use crate::api::Theme;

use super::{detect_with_dark_light, PlatformError};

pub(crate) fn detect() -> Result<Theme, PlatformError> {
    detect_with_dark_light()
}
