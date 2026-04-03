use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

#[cfg(target_os = "macos")]
use std::ptr::NonNull;

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2_foundation::{
    ns_string, NSDistributedNotificationCenter, NSNotification, NSOperationQueue,
};

use crate::{
    api::Theme,
    platform::{self, PlatformError},
};

#[cfg(not(target_os = "macos"))]
const POLL_INTERVAL: Duration = Duration::from_millis(750);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(target_os = "macos")]
const RUN_LOOP_SLICE: Duration = Duration::from_millis(250);
#[cfg(target_os = "macos")]
const THEME_CHANGED_NOTIFICATION: &str = "AppleInterfaceThemeChangedNotification";

struct MonitorState {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<JoinHandle<()>>,
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

    let (startup_tx, startup_rx) = mpsc::channel::<MonitorStartupStatus>();

    let join_handle = thread::Builder::new()
        .name("crossterm-system-theme-monitor".to_string())
        .spawn(move || run_monitor_loop(callback, stop_flag_for_thread, initial_theme, startup_tx))
        .map_err(|error| {
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
            }),
        }),
        Err(error) => {
            stop_flag.store(true, Ordering::Release);
            if let Some(handle) = join_handle.take() {
                let _ = handle.join();
            }
            Err(PlatformError::internal(format!(
                "Theme monitor failed to initialize: {error}"
            )))
        }
    }
}

fn run_monitor_loop(
    callback: ThreadsafeFunction<String>,
    stop_flag: Arc<AtomicBool>,
    initial_theme: Theme,
    startup_tx: Sender<MonitorStartupStatus>,
) {
    #[cfg(target_os = "macos")]
    {
        run_macos_monitor_loop(callback, stop_flag, initial_theme, startup_tx);
        return;
    }

    #[cfg(not(target_os = "macos"))]
    {
        run_poll_monitor_loop(callback, stop_flag, initial_theme, startup_tx);
    }
}

#[cfg(not(target_os = "macos"))]
fn run_poll_monitor_loop(
    callback: ThreadsafeFunction<String>,
    stop_flag: Arc<AtomicBool>,
    mut last_theme: Theme,
    startup_tx: Sender<MonitorStartupStatus>,
) {
    let _ = startup_tx.send(MonitorStartupStatus::Ready);

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
        emit_theme_change(&callback, detected_theme);
    }
}

#[cfg(target_os = "macos")]
fn run_macos_monitor_loop(
    callback: ThreadsafeFunction<String>,
    stop_flag: Arc<AtomicBool>,
    mut last_theme: Theme,
    startup_tx: Sender<MonitorStartupStatus>,
) {
    let center = NSDistributedNotificationCenter::defaultCenter();
    center.setSuspended(false);

    let queue = NSOperationQueue::new();
    let (event_tx, event_rx) = mpsc::channel::<()>();

    let observer_block = RcBlock::new(move |_notification: NonNull<NSNotification>| {
        let _ = event_tx.send(());
    });

    // SAFETY: observer token is retained for this monitor loop lifetime.
    let observer_token = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(ns_string!(THEME_CHANGED_NOTIFICATION)),
            None,
            Some(&queue),
            &observer_block,
        )
    };

    let _ = startup_tx.send(MonitorStartupStatus::Ready);

    while !stop_flag.load(Ordering::Acquire) {
        match event_rx.recv_timeout(RUN_LOOP_SLICE) {
            Ok(()) => {
                let detected_theme = match platform::detect() {
                    Ok(theme) => theme,
                    Err(_) => continue,
                };

                if detected_theme == last_theme {
                    continue;
                }

                last_theme = detected_theme;
                emit_theme_change(&callback, detected_theme);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    // SAFETY: observer token was returned by this center registration.
    unsafe {
        center.removeObserver(observer_token.as_ref());
    }
}

fn emit_theme_change(callback: &ThreadsafeFunction<String>, theme: Theme) {
    let _ = callback.call(
        Ok(theme.as_str().to_string()),
        ThreadsafeFunctionCallMode::NonBlocking,
    );
}
