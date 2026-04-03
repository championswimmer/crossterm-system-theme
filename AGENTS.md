# AGENTS.md

## Project
**crossterm-system-theme** — a Node.js library for detecting the current **system theme** (`light` or `dark`) across operating systems.

## Primary Goal
Build a cross-platform API that works for CLI/TUI apps (especially apps not using Ink/Chalk-style framework abstractions):

1. **Polling mode**
   - `getSystemTheme()` → returns current `light | dark`
2. **Monitoring mode**
   - subscribe to theme changes and get notified whenever OS theme flips
   - if real monitoring is unavailable on current platform/session, throw a clear **MonitoringUnsupportedError** so callers can fallback to polling

## Target Platforms
- **macOS**
- **Windows**
- **Linux**
  - GNOME
  - KDE Plasma
  - Wayland sessions
  - X11 sessions

## MVP Principles
- Prefer **standard OS interfaces** and stable mechanisms first
- Keep runtime dependencies minimal (CLI/TUI-first library)
- Normalize output to a simple cross-platform model (`light` / `dark`)
- Provide metadata/debug info internally so platform quirks are diagnosable
- Fail clearly, never silently

## Initial Scope Boundaries
- Focus first on **detection + change notification**
- No UI rendering/theming helpers in MVP
- No framework-specific bindings in MVP (can be added later as adapters)

## Planning
Detailed implementation roadmap lives in:
- `.agents/plans/00-initial-setup.md`
