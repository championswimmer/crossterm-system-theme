# 00 — Initial Setup Plan (0 → 1 MVP)

## Objective
Create the first usable version of **crossterm-system-theme**: a Node.js library for CLI/TUI apps to detect system light/dark mode across macOS, Windows, and Linux (GNOME/KDE/Wayland/X11), with:

- `getSystemTheme()` (polling)
- `monitorSystemTheme()` (real change listener where available)
- explicit `MonitoringUnsupportedError` for unsupported monitor paths

---

## Research Summary (what we should build on)

### 1) Cross-desktop Linux standard: XDG Desktop Portal (highest priority on Linux)
- `org.freedesktop.portal.Settings` defines:
  - namespace: `org.freedesktop.appearance`
  - key: `color-scheme`
  - values: `0` no preference, `1` dark, `2` light
- Read methods: `Read` (deprecated), `ReadOne` (preferred)
- Change signal: `SettingChanged(namespace, key, value)`

**Why this matters:** single API that can work across GNOME/KDE and Wayland/X11 sessions when portal backend exists.

References:
- https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html
- https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.impl.portal.Settings.html
- Practical implementation pattern in Waybar:
  - https://raw.githubusercontent.com/Alexays/Waybar/master/src/util/portal.cpp

---

### 2) GNOME path
- Polling:
  - `gsettings get org.gnome.desktop.interface color-scheme`
  - fallback: `gsettings get org.gnome.desktop.interface gtk-theme` and infer from `-dark`
- Monitoring:
  - `gsettings monitor org.gnome.desktop.interface color-scheme`

References:
- gsettings monitor usage: https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/using_the_desktop_environment_in_rhel_8/configuring-gnome-at-low-level_using-the-desktop-environment-in-rhel-8
- GNOME dark preference context: https://blogs.gnome.org/alicem/2021/10/04/dark-style-preference/

---

### 3) KDE path
- Polling candidates:
  - portal `color-scheme` (preferred)
  - fallback: read `~/.config/kdeglobals` (`[General] ColorScheme`) via `kreadconfig5/6`
- Monitoring:
  - portal `SettingChanged` preferred
  - KDE-specific portal keys/signals appear in real-world traces (`org.kde.kdeglobals.General`, `ColorScheme`)

References:
- Portal docs (same as above)
- Observed KDE portal signal patterns: https://forum.qt.io/topic/145065/colorschemechanged-under-gnome/12

---

### 4) macOS path
- Polling (common CLI pattern):
  - `defaults read -g AppleInterfaceStyle` → `Dark` means dark, missing key usually means light
- Monitoring:
  - `AppleInterfaceThemeChangedNotification` via `DistributedNotificationCenter`
  - practical implementation exists in Swift (`dark-mode-notify`)

References:
- dark-mode-notify source:
  - https://raw.githubusercontent.com/bouk/dark-mode-notify/main/main.swift

---

### 5) Windows path
- Polling:
  - registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize\AppsUseLightTheme`
  - `0 = dark`, `1 = light` (missing key observed on some systems: treat as light default)
- Monitoring (native/documented options):
  - `RegNotifyChangeKeyValue` on the Personalize key
  - message-based `WM_SETTINGCHANGE` (often with `ImmersiveColorSet` in `lParam`)
  - WinRT `UISettings.ColorValuesChanged` also valid in desktop apps

References:
- RegNotifyChangeKeyValue docs:
  - https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regnotifychangekeyvalue
- WM_SETTINGCHANGE docs:
  - https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-settingchange
- Theme detection guidance (UISettings.ColorValuesChanged):
  - https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/apply-windows-themes

---

### 6) X11-specific background
- XSETTINGS includes `Net/ThemeName` and related settings
- useful as low-level fallback for X11 ecosystems where portal/gnome/kde-specific methods are missing

Reference:
- https://wiki.freedesktop.org/www/Specifications/XSettingsRegistry/

---

## MVP Product Scope

### Must-have (0 → 1)
1. Polling API returning `light | dark`
2. Monitoring API with subscription + unsubscribe
3. Support polling on all target OS families
4. Monitoring on platforms where we can implement **reliably** in pure Node + subprocess strategy
5. Explicit unsupported errors for monitor gaps

### Not in first MVP
- Theme auto-apply utilities for terminal frameworks
- High contrast/accent APIs
- Full native bindings for every OS (can be Phase 2)

---

## Proposed Public API (MVP)

```ts
export type SystemTheme = 'light' | 'dark'

export async function getSystemTheme(): Promise<SystemTheme>

export type ThemeChangeCallback = (theme: SystemTheme) => void

export interface ThemeMonitor {
  stop(): void
}

export async function monitorSystemTheme(
  onChange: ThemeChangeCallback
): Promise<ThemeMonitor>
```

Errors:
- `MonitoringUnsupportedError`
- `ThemeDetectionError`

Behavior contract:
- `monitorSystemTheme` should emit only on actual theme transitions
- consumer can catch `MonitoringUnsupportedError` and fallback to polling loop

---

## Implementation Strategy (MVP)

## Phase 1 — Repo foundation
- [ ] Initialize TypeScript build (`src/`, `dist/`, ESM+CJS strategy decided)
- [ ] Add lint/format/test tooling
- [ ] Add baseline CI matrix (macOS, Windows, Ubuntu)
- [ ] Add typed error classes + logger hook (debug mode)

Deliverable: package builds and tests run on CI.

---

## Phase 2 — Core architecture
- [ ] Define `Detector` and `Monitor` internal interfaces
- [ ] Add provider registry + ordered fallback chain
- [ ] Add `exec` abstraction for command invocation/timeouts/exit parsing
- [ ] Add normalized parse helpers (`dark/light/no-preference` mapping policy)

Deliverable: no-op providers can be composed and selected by platform.

---

## Phase 3 — Polling providers

### macOS polling
- [ ] Implement `defaults read -g AppleInterfaceStyle`
- [ ] Parse `Dark` vs missing/error

### Windows polling
- [ ] Implement `reg query` for `AppsUseLightTheme`
- [ ] Parse DWORD 0/1
- [ ] Missing key => default `light`

### Linux polling chain
Order:
1. [ ] Portal ReadOne/Read (`org.freedesktop.appearance`, `color-scheme`)
2. [ ] GNOME `gsettings ... color-scheme`
3. [ ] KDE `kreadconfig5/6 --file kdeglobals --group General --key ColorScheme`
4. [ ] X11-ish fallback (`xfconf-query -c xsettings -p /Net/ThemeName` where available)

Deliverable: `getSystemTheme()` works with deterministic fallback order.

---

## Phase 4 — Monitoring providers (MVP practical)

### Linux monitor (first-class in MVP)
1. [ ] Portal `SettingChanged` listener via `dbus-monitor`/`gdbus monitor`
2. [ ] GNOME `gsettings monitor org.gnome.desktop.interface color-scheme`
3. [ ] KDE via portal signal path (same watcher, parse KDE/appearance namespace keys)

### macOS monitor (MVP option A)
- [ ] Implement subprocess strategy using a tiny bundled Swift watcher (dark-mode-notify style)
- [ ] If swift toolchain missing, throw `MonitoringUnsupportedError`

### Windows monitor (MVP conservative)
- [ ] Start as unsupported in v0 MVP unless reliable pure-subprocess monitor is validated
- [ ] Return `MonitoringUnsupportedError` with actionable message

Deliverable: monitor support on Linux (+mac if helper available), explicit unsupported elsewhere.

---

## Phase 5 — Testing

- [ ] Unit tests for all parsers (sample outputs from each command)
- [ ] Unit tests for fallback order and error policy
- [ ] Integration smoke tests per OS in CI (best-effort, non-flaky)
- [ ] Manual verification scripts for real desktop sessions:
  - macOS (Light/Dark/Auto)
  - Windows (app mode toggle)
  - GNOME Wayland/X11
  - KDE Wayland/X11

Deliverable: stable tests with fixtures for command outputs.

---

## Phase 6 — Packaging and docs
- [ ] README with examples: polling + monitor + fallback pattern
- [ ] Platform support matrix table
- [ ] Troubleshooting section (`DBUS_SESSION_BUS_ADDRESS`, missing portal backend, swift unavailable, etc.)
- [ ] Version as `0.1.0` MVP

Deliverable: installable npm package with clear usage and support boundaries.

---

## Initial Support Matrix (target for MVP)

| Platform | Polling | Monitoring |
|---|---:|---:|
| macOS | ✅ | ⚠️ (Swift helper required) |
| Windows | ✅ | ❌ (MVP: explicit unsupported) |
| Linux GNOME | ✅ | ✅ |
| Linux KDE | ✅ | ✅ (portal-based) |
| Linux Wayland | ✅ | ✅ (portal preferred) |
| Linux X11 | ✅ | ⚠️ (depends on available backend/tools) |

---

## Key Risks + Mitigations

1. **Portal availability differs per distro/session**
   - Mitigation: strict fallback chain + diagnostics
2. **Variant nesting differences in portal `Read` responses**
   - Mitigation: prefer `ReadOne`; keep tolerant parser for legacy behavior
3. **macOS CLI key reliability across versions**
   - Mitigation: keep fallback strategy and add versioned fixture tests
4. **Windows monitor complexity without native addon**
   - Mitigation: make unsupported explicit in MVP, add native watcher in next phase

---

## Definition of Done (MVP)

- `getSystemTheme()` returns `light | dark` on macOS, Windows, Linux major DEs
- `monitorSystemTheme()` works on at least Linux GNOME/KDE and clearly fails with `MonitoringUnsupportedError` where unavailable
- Documented fallback snippet for consumers:
  1) try monitor
  2) fallback to polling loop
- CI green + README support matrix + troubleshooting
