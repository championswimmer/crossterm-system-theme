use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

use crate::{
    api::Theme,
    platform::{self, PlatformError},
};

const POLL_INTERVAL: Duration = Duration::from_millis(750);

struct MonitorState {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<JoinHandle<()>>,
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

pub(crate) fn start_theme_monitor(
    callback: ThreadsafeFunction<String>,
) -> Result<NativeMonitorHandle, PlatformError> {
    let initial_theme = platform::detect()?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_for_thread = Arc::clone(&stop_flag);

    let join_handle = thread::Builder::new()
        .name("crossterm-system-theme-monitor".to_string())
        .spawn(move || run_monitor_loop(callback, stop_flag_for_thread, initial_theme))
        .map_err(|error| {
            PlatformError::internal(format!(
                "Could not start theme monitor background thread: {error}"
            ))
        })?;

    Ok(NativeMonitorHandle {
        state: Mutex::new(MonitorState {
            stop_flag,
            join_handle: Some(join_handle),
        }),
    })
}

fn run_monitor_loop(
    callback: ThreadsafeFunction<String>,
    stop_flag: Arc<AtomicBool>,
    mut last_theme: Theme,
) {
    while !stop_flag.load(Ordering::Acquire) {
        thread::sleep(POLL_INTERVAL);

        if stop_flag.load(Ordering::Acquire) {
            break;
        }

        let detected_theme = match platform::detect() {
            Ok(theme) => theme,
            Err(_) => continue,
        };

        if detected_theme == last_theme {
            continue;
        }

        last_theme = detected_theme;
        let _ = callback.call(
            Ok(detected_theme.as_str().to_string()),
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    }
}
