# 01 — Native Architecture Plan (napi-rs + Rust only)

## Objective
Pivot implementation to a **Rust-native core** exposed through **napi-rs**, while keeping the public package API in TypeScript.

Constraints from product direction:
- No Swift or C# in repo
- Native OS integration must be Rust
- Node.js **20+** only
- TypeScript-first package API and tests
- Build/publish prebuilt binaries for multiple OS/arch via GitHub Actions

---

## Research-backed decisions

## 1) Use napi-rs v3 packaging model (recommended baseline)
Use the maintained `@napi-rs/package-template` workflow pattern:
- `package.json` uses `napi.binaryName` + `napi.targets`
- Build via `napi build --platform --release`
- CI artifact flow: `napi create-npm-dirs` + `napi artifacts` + `napi prepublish -t npm`

This gives us:
- ABI-stable native addon distribution (N-API)
- Optional per-platform npm packages (no postinstall downloader)
- Proven GitHub Actions matrix patterns for macOS/Windows/Linux + multi-arch

## 2) Native platform APIs to implement in Rust

### Linux
- Primary detection: XDG portal `org.freedesktop.portal.Settings.ReadOne(org.freedesktop.appearance, color-scheme)`
- Primary monitor: `SettingChanged` signal on same interface
- Mapping: `1 -> dark`, `2 -> light`, `0/no-preference -> light` (normalized)

### Windows
- Detection: `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\\AppsUseLightTheme`
  - `0 => dark`, `1 => light`, missing => light default
- Monitor: Win32 `RegNotifyChangeKeyValue` on `...\\Personalize`

### macOS
- Detection: read global style (`AppleInterfaceStyle`) via Cocoa/Foundation APIs in Rust (`objc2` bindings)
- Monitor: use Cocoa notification/KVO route in Rust (`objc2`), no Swift helper

---

## Proposed repository structure

```txt
.
├─ src/                           # TS public API (stable contract)
│  ├─ index.ts
│  ├─ errors.ts
│  └─ internal/
│     └─ native.ts                # typed bridge to generated napi loader
├─ native/                        # Rust crate (napi addon)
│  ├─ Cargo.toml
│  ├─ build.rs
│  └─ src/
│     ├─ lib.rs                   # napi exports
│     ├─ api.rs                   # Rust-side API surface
│     ├─ monitor.rs               # monitor lifecycle / stop handles
│     └─ platform/
│        ├─ mod.rs
│        ├─ linux.rs
│        ├─ windows.rs
│        └─ macos.rs
├─ test/                          # TS tests (vitest)
├─ native/tests/                  # Rust tests (unit/integration)
├─ .github/workflows/
│  ├─ ci.yml
│  └─ release-native.yml
└─ package.json
```

Design rule:
- Public runtime API stays in TS (`getSystemTheme`, `monitorSystemTheme`, typed errors)
- OS-native work stays in Rust
- Generated napi JS loader is internal implementation detail

---

## Public API contract (unchanged)

```ts
export type SystemTheme = 'light' | 'dark'

export async function getSystemTheme(): Promise<SystemTheme>

export interface ThemeMonitor {
  stop(): void
}

export async function monitorSystemTheme(
  onChange: (theme: SystemTheme) => void
): Promise<ThemeMonitor>
```

Errors:
- `ThemeDetectionError`
- `MonitoringUnsupportedError` (only when truly unavailable)

---

## Rust/native design

## Native export layer (napi)
Expose minimal functions/classes from Rust:
- `get_system_theme_native() -> String`
- `start_theme_monitor_native(callback) -> NativeMonitorHandle`
- `NativeMonitorHandle.stop()`

Implementation notes:
- Use `ThreadsafeFunction` for callbacks into JS
- Keep a per-monitor stop flag/channel in Rust
- Ensure monitor resources are released on `stop()` and on drop/finalizer

## Platform module contract
Internal trait:
- `detect() -> Result<Theme, PlatformError>`
- `monitor(sender) -> Result<MonitorGuard, PlatformError>`

Then `lib.rs` maps platform errors to napi errors, and TS maps napi errors to public error classes.

---

## Phased implementation plan

## Phase 0 — Reset architecture boundary
- [ ] Keep current TS API surface
- [ ] Mark command/subprocess detector path as legacy fallback only
- [ ] Add migration notes in changelog/dev docs

Deliverable: clear source-of-truth is Rust native path.

## Phase 1 — Scaffold napi-rs crate
- [ ] Add `native/Cargo.toml` (`napi`, `napi-derive`, `napi-build`)
- [ ] Add `native/build.rs`
- [ ] Configure package `napi.binaryName` + `napi.targets`
- [ ] Add build scripts for native + TS build orchestration

Deliverable: `npm run build` creates `.node` binary + TS dist output.

## Phase 2 — Detection implementation (Rust)
- [ ] Linux portal detection via `zbus`
- [ ] Windows registry detection (`winreg` or `windows` bindings)
- [ ] macOS detection via `objc2` Foundation/AppKit bindings
- [ ] Normalize to `light|dark`
- [ ] Add rich error mapping and debug metadata

Deliverable: `getSystemTheme()` backed by Rust on all target OS families.

## Phase 3 — Monitoring implementation (Rust)
- [ ] Linux `SettingChanged` signal listener
- [ ] Windows `RegNotifyChangeKeyValue` watcher thread
- [ ] macOS notification/KVO observer in Rust
- [ ] Debounce duplicate events and emit only transitions
- [ ] Implement monitor handle stop semantics

Deliverable: `monitorSystemTheme()` works with real native listeners.

## Phase 4 — TS bridge and ergonomics
- [ ] Typed native binding loader wrapper (`src/internal/native.ts`)
- [ ] Public TS API wrappers and error translation
- [ ] Ensure ESM/CJS compatibility in distributed package

Deliverable: consumers use a clean TS API; native details hidden.

## Phase 5 — Tests
- [ ] Rust unit tests for per-platform parsers/mapping
- [ ] Rust tests for monitor state machine (dedupe, stop behavior)
- [ ] TS unit tests for API contract + error mapping
- [ ] OS smoke tests in CI (best effort, non-flaky)

Deliverable: reliable test pyramid across Rust + TS.

## Phase 6 — Docs + support matrix
- [ ] Update README architecture section (Rust native core via napi-rs)
- [ ] Add runtime prerequisites and troubleshooting notes
- [ ] Add support matrix by OS/arch and monitor support status

Deliverable: publish-ready `0.2.0` (or next planned) release docs.

---

## GitHub Actions strategy (multi-OS + multi-arch)

## Workflow A: `ci.yml` (PR/push)
- Lint + typecheck + tests (TS + Rust)
- Node matrix: 20, 22
- OS matrix for non-native smoke: ubuntu, macos, windows

## Workflow B: `release-native.yml` (tag/release)
Build matrix (minimum recommended):
- macOS x64: `x86_64-apple-darwin` (runner: macos-13)
- macOS arm64: `aarch64-apple-darwin` (runner: macos-14)
- Windows x64: `x86_64-pc-windows-msvc` (runner: windows-latest)
- Windows arm64: `aarch64-pc-windows-msvc` (runner: windows-11-arm or cross strategy)
- Linux x64 gnu: `x86_64-unknown-linux-gnu` (runner: ubuntu-latest)
- Linux arm64 gnu: `aarch64-unknown-linux-gnu` (runner: ubuntu-24.04-arm or cross strategy)

Optional additional targets:
- `x86_64-unknown-linux-musl`
- `aarch64-unknown-linux-musl`

Publish flow:
1. Build each target via `napi build --platform --release --target ...`
2. Upload target artifacts
3. Create npm dirs: `napi create-npm-dirs`
4. Download + place artifacts: `napi artifacts`
5. Publish root + optional native packages (`napi prepublish -t npm` + npm publish)

---

## Risks and mitigations

1. **macOS observer threading requirements**
   - Mitigation: isolate observer setup in dedicated module; enforce main-thread constraints clearly; add fallback detection-only mode with explicit unsupported monitor error if needed.

2. **Linux desktop variance (portal not available in some sessions)**
   - Mitigation: clear fallback order and actionable errors (`DBUS_SESSION_BUS_ADDRESS`, missing portal backend).

3. **Windows ARM64 runner availability variability**
   - Mitigation: provide cross-build fallback path and keep x64 as required gate.

4. **NAPI packaging complexity (optionalDependencies sync)**
   - Mitigation: use official `napi` CLI flow (`create-npm-dirs`, `artifacts`, `prepublish`) instead of bespoke scripts.

---

## Definition of Done

- Rust-native detection working on macOS/Windows/Linux
- Rust-native monitoring implemented without Swift/C# helpers
- TS public API stable and fully typed
- CI builds prebuilt binaries for target OS/arch matrix
- Tests pass for TS + Rust layers
- Package publishes with `.d.ts` and architecture-specific native artifacts

---

## References used for this plan

- napi-rs docs: https://napi.rs/docs/introduction/simple-package
- napi CLI build docs: https://napi.rs/docs/cli/build
- napi v2→v3 migration (`binaryName`, `targets`, CI notes): https://napi.rs/en/docs/more/v2-v3-migration-guide.en
- package-template workflow (artifact/publish model): https://raw.githubusercontent.com/napi-rs/package-template/main/.github/workflows/CI.yml
- package-template package.json example: https://raw.githubusercontent.com/napi-rs/package-template/main/package.json
- XDG portal Settings API (`ReadOne`, `SettingChanged`): https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html
- Windows registry change notifications: https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regnotifychangekeyvalue
- Windows settings broadcast docs (`WM_SETTINGCHANGE`): https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-settingchange
- Existing Rust detection implementations for reference:
  - macOS/windows/linux detection patterns: https://raw.githubusercontent.com/rust-dark-light/dark-light/master/src/lib.rs
  - macOS file: https://raw.githubusercontent.com/rust-dark-light/dark-light/master/src/platforms/macos.rs
  - Windows file: https://raw.githubusercontent.com/rust-dark-light/dark-light/master/src/platforms/windows.rs
  - Linux file: https://raw.githubusercontent.com/rust-dark-light/dark-light/master/src/platforms/freedesktop.rs
- Rust-native monitoring design reference (cross-platform):
  - https://docs.rs/crate/system-theme/latest/source/src/platform/macos.rs
  - https://docs.rs/crate/system-theme/latest/source/src/platform/windows.rs
  - https://docs.rs/crate/system-theme/latest/source/src/platform/xdg.rs
