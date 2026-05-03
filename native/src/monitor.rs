use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};

#[cfg(target_os = "macos")]
use std::{
    io::{BufRead, BufReader},
    process::{Child, ChildStdout, Command, Stdio},
    sync::mpsc::{self, Sender},
    thread,
    time::Duration,
};

#[cfg(target_os = "windows")]
use std::thread;

use napi::threadsafe_function::ThreadsafeFunction;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use napi_derive::napi;

use crate::platform::PlatformError;

#[cfg(target_os = "macos")]
use crate::{api::Theme, platform};
#[cfg(target_os = "windows")]
use crate::{api::Theme, platform};

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0},
    System::{
        Registry::{RegNotifyChangeKeyValue, REG_NOTIFY_CHANGE_LAST_SET},
        Threading::{CreateEventW, SetEvent, WaitForMultipleObjects, INFINITE},
    },
};
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[cfg(target_os = "windows")]
type WindowsHandle = isize;

#[cfg(target_os = "macos")]
const STARTUP_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(target_os = "macos")]
const HELPER_PATH_ENV: &str = "CROSSTERM_SYSTEM_THEME_HELPER_PATH";

struct MonitorState {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<JoinHandle<()>>,
    #[cfg(target_os = "macos")]
    helper_child: Option<Child>,
    #[cfg(target_os = "windows")]
    stop_event: Option<WindowsHandle>,
}

#[cfg(target_os = "macos")]
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

        #[cfg(target_os = "windows")]
        if let Some(stop_event) = guard.stop_event {
            unsafe {
                let _ = SetEvent(windows_handle_to_raw(stop_event));
            }
        }

        if let Some(join_handle) = guard.join_handle.take() {
            let _ = join_handle.join();
        }

        #[cfg(target_os = "windows")]
        if let Some(stop_event) = guard.stop_event.take() {
            close_windows_handle(stop_event);
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

        #[cfg(target_os = "windows")]
        if let Some(stop_event) = state.stop_event {
            unsafe {
                let _ = SetEvent(windows_handle_to_raw(stop_event));
            }
        }

        if let Some(join_handle) = state.join_handle.take() {
            let _ = join_handle.join();
        }

        #[cfg(target_os = "windows")]
        if let Some(stop_event) = state.stop_event.take() {
            close_windows_handle(stop_event);
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

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) fn start_theme_monitor(
    callback: ThreadsafeFunction<String>,
) -> Result<NativeMonitorHandle, PlatformError> {
    let _ = callback;
    Err(PlatformError::unsupported(
        "Native theme monitoring is not available on this platform/session. Use polling with getSystemTheme().",
    ))
}

#[cfg(target_os = "windows")]
pub(crate) fn start_theme_monitor(
    callback: ThreadsafeFunction<String>,
) -> Result<NativeMonitorHandle, PlatformError> {
    let initial_theme = platform::detect()?;
    let monitor_key = platform::open_monitor_key()?;
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_for_thread = Arc::clone(&stop_flag);
    let stop_event = create_windows_event(true, false)?;

    let join_handle = thread::Builder::new()
        .name("crossterm-system-theme-monitor".to_string())
        .spawn(move || {
            run_windows_monitor_loop(
                callback,
                stop_flag_for_thread,
                stop_event,
                initial_theme,
                monitor_key,
            )
        })
        .map_err(|error| {
            close_windows_handle(stop_event);
            PlatformError::internal(format!(
                "Could not start theme monitor background thread: {error}"
            ))
        })?;

    Ok(NativeMonitorHandle {
        state: Mutex::new(MonitorState {
            stop_flag,
            join_handle: Some(join_handle),
            stop_event: Some(stop_event),
        }),
    })
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn emit_theme_change(callback: &ThreadsafeFunction<String>, theme: Theme) {
    let _ = callback.call(
        Ok(theme.as_str().to_string()),
        ThreadsafeFunctionCallMode::NonBlocking,
    );
}

#[cfg(target_os = "windows")]
fn run_windows_monitor_loop(
    callback: ThreadsafeFunction<String>,
    stop_flag: Arc<AtomicBool>,
    stop_event: WindowsHandle,
    mut last_theme: Theme,
    monitor_key: RegKey,
) {
    let change_event = match create_windows_event(false, false) {
        Ok(handle) => handle,
        Err(_) => return,
    };

    while !stop_flag.load(Ordering::Acquire) {
        if arm_windows_registry_notification(&monitor_key, change_event).is_err() {
            break;
        }

        let handles = [
            windows_handle_to_raw(stop_event),
            windows_handle_to_raw(change_event),
        ];
        let wait_result =
            unsafe { WaitForMultipleObjects(handles.len() as u32, handles.as_ptr(), 0, INFINITE) };

        if wait_result == WAIT_OBJECT_0 {
            break;
        }

        if wait_result == WAIT_OBJECT_0 + 1 {
            let detected_theme = match platform::detect() {
                Ok(theme) => theme,
                Err(_) => continue,
            };

            if detected_theme != last_theme {
                last_theme = detected_theme;
                emit_theme_change(&callback, detected_theme);
            }

            continue;
        }

        break;
    }

    close_windows_handle(change_event);
}

#[cfg(target_os = "windows")]
fn arm_windows_registry_notification(
    monitor_key: &RegKey,
    change_event: WindowsHandle,
) -> Result<(), PlatformError> {
    let status = unsafe {
        RegNotifyChangeKeyValue(
            monitor_key.raw_handle() as HANDLE,
            1,
            REG_NOTIFY_CHANGE_LAST_SET,
            windows_handle_to_raw(change_event),
            1,
        )
    };

    if status == 0 {
        return Ok(());
    }

    Err(PlatformError::internal(format!(
        "Could not arm Windows theme monitor: {}",
        std::io::Error::from_raw_os_error(status as i32)
    )))
}

#[cfg(target_os = "windows")]
fn create_windows_event(
    manual_reset: bool,
    initial_state: bool,
) -> Result<WindowsHandle, PlatformError> {
    let handle = unsafe {
        CreateEventW(
            std::ptr::null(),
            manual_reset as i32,
            initial_state as i32,
            std::ptr::null(),
        )
    };

    if !handle.is_null() {
        return Ok(handle as WindowsHandle);
    }

    Err(PlatformError::internal(format!(
        "Could not create Windows monitor event: {}",
        std::io::Error::last_os_error()
    )))
}

#[cfg(target_os = "windows")]
fn close_windows_handle(handle: WindowsHandle) {
    if handle == 0 {
        return;
    }

    unsafe {
        let _ = CloseHandle(windows_handle_to_raw(handle));
    }
}

#[cfg(target_os = "windows")]
fn windows_handle_to_raw(handle: WindowsHandle) -> HANDLE {
    handle as HANDLE
}
