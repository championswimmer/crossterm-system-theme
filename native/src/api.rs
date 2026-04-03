use dark_light::Mode;

pub(crate) const THEME_DETECTION_ERROR_PREFIX: &str = "THEME_DETECTION_ERROR";
pub(crate) const MONITORING_UNSUPPORTED_ERROR_PREFIX: &str = "MONITORING_UNSUPPORTED_ERROR";
pub(crate) const THEME_MONITORING_ERROR_PREFIX: &str = "THEME_MONITORING_ERROR";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Theme {
    Light,
    Dark,
}

impl Theme {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }
}

pub(crate) fn theme_from_mode(mode: Mode) -> Theme {
    match mode {
        Mode::Dark => Theme::Dark,
        Mode::Light | Mode::Unspecified => Theme::Light,
    }
}

pub(crate) fn detection_napi_error(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(format!(
        "{}:{}",
        THEME_DETECTION_ERROR_PREFIX,
        message.into()
    ))
}

pub(crate) fn monitoring_unsupported_napi_error(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(format!(
        "{}:{}",
        MONITORING_UNSUPPORTED_ERROR_PREFIX,
        message.into()
    ))
}

pub(crate) fn monitoring_napi_error(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(format!(
        "{}:{}",
        THEME_MONITORING_ERROR_PREFIX,
        message.into()
    ))
}

#[cfg(test)]
mod tests {
    use super::{theme_from_mode, Theme};

    #[test]
    fn mode_mapping_is_normalized() {
        assert_eq!(theme_from_mode(dark_light::Mode::Dark), Theme::Dark);
        assert_eq!(theme_from_mode(dark_light::Mode::Light), Theme::Light);
        assert_eq!(theme_from_mode(dark_light::Mode::Unspecified), Theme::Light);
    }
}
