use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

#[cfg(target_os = "macos")]
use std::{
    io::{BufRead, BufReader},
    process::{Child, ChildStdout, Command, Stdio},
};

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

use crate::platform::PlatformError;

#[cfg(target_os = "macos")]
use crate::{api::Theme, platform};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(target_os = "macos")]
const HELPER_PATH_ENV: &str = "CROSSTERM_SYSTEM_THEME_HELPER_PATH";

struct MonitorState {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<JoinHandle<()>>,
    #[cfg(target_os = "macos")]
    helper_child: Option<Child>,
}

enum MonitorStartupStatus {
    Ready,
}

#[napi]
pub struct NativeMonitorHandle {
    state: Mutex<MonitorState>,
}

impl NativeMonitorHandle {
    fn stop_internal(&self) {
        let mut guard = match self.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };

        guard.stop_flag.store(true, Ordering::Release);

        #[cfg(target_os = "macos")]
        if let Some(mut child) = guard.helper_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        if let Some(join_handle) = guard.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

impl Drop for NativeMonitorHandle {
    fn drop(&mut self) {
        let state = match self.state.get_mut() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };

        state.stop_flag.store(true, Ordering::Release);

        #[cfg(target_os = "macos")]
        if let Some(mut child) = state.helper_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        if let Some(join_handle) = state.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

#[napi]
impl NativeMonitorHandle {
    #[napi]
    pub fn stop(&self) {
        self.stop_internal();
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn start_theme_monitor(
    callback: ThreadsafeFunction<String>,
) -> Result<NativeMonitorHandle, PlatformError> {
    let _ = callback;
    Err(PlatformError::unsupported(
        "Native theme monitoring is not available on this platform/session. Use polling with getSystemTheme().",
    ))
}

#[cfg(target_os = "macos")]
pub(crate) fn start_theme_monitor(
    callback: ThreadsafeFunction<String>,
) -> Result<NativeMonitorHandle, PlatformError> {
    let initial_theme = platform::detect()?;

    let helper_path = std::env::var(HELPER_PATH_ENV).map_err(|_| {
        PlatformError::unsupported(format!(
            "macOS monitor helper path not configured. Set {HELPER_PATH_ENV}."
        ))
    })?;

    let mut helper_child = Command::new(&helper_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            PlatformError::unsupported(format!(
                "Could not start macOS monitor helper at '{helper_path}': {error}"
            ))
        })?;

    let helper_stdout = helper_child.stdout.take().ok_or_else(|| {
        PlatformError::internal("macOS monitor helper did not provide stdout".to_string())
    })?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_for_thread = Arc::clone(&stop_flag);

    let (startup_tx, startup_rx) = mpsc::channel::<MonitorStartupStatus>();

    let join_handle = thread::Builder::new()
        .name("crossterm-system-theme-monitor".to_string())
        .spawn(move || {
            run_macos_helper_loop(
                callback,
                stop_flag_for_thread,
                initial_theme,
                helper_stdout,
                startup_tx,
            )
        })
        .map_err(|error| {
            let _ = helper_child.kill();
            let _ = helper_child.wait();
            PlatformError::internal(format!(
                "Could not start theme monitor background thread: {error}"
            ))
        })?;

    let mut join_handle = Some(join_handle);

    match startup_rx.recv_timeout(STARTUP_TIMEOUT) {
        Ok(MonitorStartupStatus::Ready) => Ok(NativeMonitorHandle {
            state: Mutex::new(MonitorState {
                stop_flag,
                join_handle,
                helper_child: Some(helper_child),
            }),
        }),
        Err(error) => {
            stop_flag.store(true, Ordering::Release);
            let _ = helper_child.kill();
            let _ = helper_child.wait();
            if let Some(handle) = join_handle.take() {
                let _ = handle.join();
            }
            Err(PlatformError::internal(format!(
                "Theme monitor failed to initialize: {error}"
            )))
        }
    }
}

#[cfg(target_os = "macos")]
fn run_macos_helper_loop(
    callback: ThreadsafeFunction<String>,
    stop_flag: Arc<AtomicBool>,
    mut last_theme: Theme,
    helper_stdout: ChildStdout,
    startup_tx: Sender<MonitorStartupStatus>,
) {
    let _ = startup_tx.send(MonitorStartupStatus::Ready);

    let reader = BufReader::new(helper_stdout);
    for line_result in reader.lines() {
        if stop_flag.load(Ordering::Acquire) {
            break;
        }

        let line = match line_result {
            Ok(line) => line,
            Err(_) => break,
        };

        let detected_theme = match parse_helper_theme_line(&line) {
            Some(theme) => theme,
            None => continue,
        };

        if detected_theme == last_theme {
            continue;
        }

        last_theme = detected_theme;
        emit_theme_change(&callback, detected_theme);
    }
}

#[cfg(target_os = "macos")]
fn parse_helper_theme_line(line: &str) -> Option<Theme> {
    match line.trim() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn emit_theme_change(callback: &ThreadsafeFunction<String>, theme: Theme) {
    let _ = callback.call(
        Ok(theme.as_str().to_string()),
        ThreadsafeFunctionCallMode::NonBlocking,
    );
}
