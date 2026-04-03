use crate::api::Theme;

use super::PlatformError;

pub(crate) fn detect() -> Result<Theme, PlatformError> {
    Err(PlatformError::unsupported(
        "System theme detection is not supported on this operating system",
    ))
}
