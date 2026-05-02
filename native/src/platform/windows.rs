use std::io::ErrorKind;

use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_NOTIFY, KEY_READ},
    RegKey,
};

use crate::api::Theme;

use super::PlatformError;

const THEMES_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes";
const PERSONALIZE_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";
const APPS_USE_LIGHT_THEME_VALUE: &str = "AppsUseLightTheme";

pub(crate) fn detect() -> Result<Theme, PlatformError> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    detect_from_path(&hkcu, PERSONALIZE_PATH)
}

pub(crate) fn open_monitor_key() -> Result<RegKey, PlatformError> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.open_subkey_with_flags(THEMES_PATH, KEY_READ | KEY_NOTIFY)
        .map_err(|error| match error.kind() {
            ErrorKind::NotFound => PlatformError::unsupported(
                "Windows theme registry key is unavailable. Use polling with getSystemTheme().",
            ),
            _ => PlatformError::internal(format!(
                "Could not open Windows theme registry key for monitoring: {error}"
            )),
        })
}

fn detect_from_path(root: &RegKey, path: &str) -> Result<Theme, PlatformError> {
    match root.open_subkey_with_flags(path, KEY_READ) {
        Ok(key) => detect_from_key(&key),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Theme::Light),
        Err(error) => Err(PlatformError::internal(format!(
            "Could not open Windows theme registry key: {error}"
        ))),
    }
}

fn detect_from_key(key: &RegKey) -> Result<Theme, PlatformError> {
    match key.get_value::<u32, _>(APPS_USE_LIGHT_THEME_VALUE) {
        Ok(0) => Ok(Theme::Dark),
        Ok(_) => Ok(Theme::Light),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Theme::Light),
        Err(error) => Err(PlatformError::internal(format!(
            "Could not read Windows theme registry value: {error}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    use winreg::enums::HKEY_CURRENT_USER;

    use super::{detect_from_path, Theme, APPS_USE_LIGHT_THEME_VALUE};
    use winreg::RegKey;

    fn unique_test_path(name: &str) -> String {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        format!(
            "Software\\crossterm-system-theme-tests\\{}-{}-{}",
            name,
            process::id(),
            nonce
        )
    }

    #[test]
    fn missing_windows_theme_key_defaults_to_light() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = unique_test_path("missing");

        let detected =
            detect_from_path(&hkcu, &path).expect("missing key should be treated as light");

        assert_eq!(detected, Theme::Light);
    }

    #[test]
    fn windows_theme_value_zero_maps_to_dark() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = unique_test_path("dark");
        let (key, _) = hkcu
            .create_subkey(&path)
            .expect("test registry key should be created");

        key.set_value(APPS_USE_LIGHT_THEME_VALUE, &0u32)
            .expect("test registry value should be written");

        let detected = detect_from_path(&hkcu, &path).expect("registry value should be readable");
        assert_eq!(detected, Theme::Dark);

        hkcu.delete_subkey_all(&path)
            .expect("test registry key should be deleted");
    }

    #[test]
    fn missing_windows_theme_value_defaults_to_light() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = unique_test_path("light");
        hkcu.create_subkey(&path)
            .expect("test registry key should be created");

        let detected =
            detect_from_path(&hkcu, &path).expect("missing value should be treated as light");
        assert_eq!(detected, Theme::Light);

        hkcu.delete_subkey_all(&path)
            .expect("test registry key should be deleted");
    }
}
