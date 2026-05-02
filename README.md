# crossterm-system-theme

Detect the current system theme (`light` / `dark`) in Node.js CLI and TUI apps — and optionally monitor for live theme changes.

![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![TypeScript 6.x](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![Rust Edition 2021](https://img.shields.io/badge/Rust-Edition%202021-000000?logo=rust)
![napi-rs 3.2.x](https://img.shields.io/badge/napi--rs-3.2.x-4A4A55)
![N-API 8](https://img.shields.io/badge/N--API-8-6e40c9)
![OS: macOS | Windows | Linux](https://img.shields.io/badge/OS-macOS%20%7C%20Windows%20%7C%20Linux-0a66c2)
![Linux targets: GNOME | KDE | Wayland | X11](https://img.shields.io/badge/Linux-GNOME%20%7C%20KDE%20%7C%20Wayland%20%7C%20X11-fcc624?logo=linux&logoColor=black)
[![npm version](https://img.shields.io/npm/v/crossterm-system-theme)](https://www.npmjs.com/package/crossterm-system-theme)
![GitHub tag](https://img.shields.io/github/v/tag/championswimmer/crossterm-system-theme?label=latest%20tag)

## Install

```bash
npm i crossterm-system-theme
```

## Read current theme

```ts
import { getSystemTheme } from 'crossterm-system-theme'

const theme = await getSystemTheme()
console.log(theme) // 'light' | 'dark'
```

## Monitor theme changes

```ts
import {
  monitorSystemTheme,
  MonitoringUnsupportedError
} from 'crossterm-system-theme'

try {
  const monitor = await monitorSystemTheme((theme) => {
    console.log('Theme changed to:', theme)
  })

  // later, when you no longer need updates:
  monitor.stop()
} catch (error) {
  if (error instanceof MonitoringUnsupportedError) {
    console.log('Live monitoring is unavailable here. Fall back to polling.')
  } else {
    throw error
  }
}
```

## API

- `getSystemTheme(): Promise<'light' | 'dark'>`
- `monitorSystemTheme(onChange): Promise<{ stop(): void }>`
- `MonitoringUnsupportedError`
- `ThemeDetectionError`

## Notes

- `monitorSystemTheme` is a native event listener (no internal polling fallback).
- On macOS, monitoring runs through a dedicated native helper process with an AppKit run loop (improves reliability for Control Center / menu bar toggles).
- On Windows, detection reads the Personalize registry value directly and monitoring listens for registry changes natively.
- If native monitoring is unavailable in the current platform/session, `monitorSystemTheme` throws `MonitoringUnsupportedError` so you can gracefully fall back to your own polling strategy.
