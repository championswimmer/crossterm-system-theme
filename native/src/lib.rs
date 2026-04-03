mod api;
mod monitor;
mod platform;

use napi::{bindgen_prelude::Result, threadsafe_function::ThreadsafeFunction};
use napi_derive::napi;

use crate::platform::PlatformErrorKind;

#[napi]
pub fn get_system_theme_native() -> Result<String> {
    platform::detect()
        .map(|theme| theme.as_str().to_string())
        .map_err(|error| api::detection_napi_error(error.to_string()))
}

#[napi]
pub fn start_theme_monitor_native(
    callback: ThreadsafeFunction<String>,
) -> Result<monitor::NativeMonitorHandle> {
    monitor::start_theme_monitor(callback).map_err(|error| match error.kind() {
        PlatformErrorKind::Unsupported => api::monitoring_unsupported_napi_error(error.to_string()),
        PlatformErrorKind::Internal => api::monitoring_napi_error(error.to_string()),
    })
}
