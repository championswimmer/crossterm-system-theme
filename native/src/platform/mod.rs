#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub(crate) use linux::detect;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub(crate) use windows::{detect, open_monitor_key};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub(crate) use macos::detect;

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
mod unsupported;
#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub(crate) use unsupported::detect;

use dark_light::{detect as dark_light_detect, Error as DarkLightError};

use crate::api::{theme_from_mode, Theme};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PlatformErrorKind {
    Unsupported,
    Internal,
}

#[derive(Debug)]
pub(crate) struct PlatformError {
    kind: PlatformErrorKind,
    message: String,
}

impl PlatformError {
    pub(crate) fn unsupported(message: impl Into<String>) -> Self {
        Self {
            kind: PlatformErrorKind::Unsupported,
            message: message.into(),
        }
    }

    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self {
            kind: PlatformErrorKind::Internal,
            message: message.into(),
        }
    }

    pub(crate) fn kind(&self) -> PlatformErrorKind {
        self.kind
    }
}

impl std::fmt::Display for PlatformError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for PlatformError {}

pub(crate) fn detect_with_dark_light() -> Result<Theme, PlatformError> {
    let mode = dark_light_detect().map_err(map_dark_light_error)?;
    Ok(theme_from_mode(mode))
}

fn map_dark_light_error(error: DarkLightError) -> PlatformError {
    match error {
        DarkLightError::MediaQueryNotSupported | DarkLightError::WindowNotFound => {
            PlatformError::unsupported(error.to_string())
        }
        _ => PlatformError::internal(error.to_string()),
    }
}
