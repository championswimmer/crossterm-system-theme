import type { SystemTheme } from '../types.js'

export function parsePortalColorSchemeValue(raw: string): SystemTheme | null {
  const match = raw.match(/(?:uint32\s+)?([012])/)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  if (value === 1) {
    return 'dark'
  }

  if (value === 2) {
    return 'light'
  }

  // 0 = no-preference; normalize to light for deterministic behavior
  return 'light'
}

export function parseGSettingsColorScheme(raw: string): SystemTheme | null {
  const value = raw.trim().replace(/'/g, '').toLowerCase()

  if (value === 'prefer-dark') {
    return 'dark'
  }

  if (value === 'prefer-light') {
    return 'light'
  }

  return null
}

export function parseThemeName(raw: string): SystemTheme | null {
  const value = raw.trim().replace(/'/g, '').toLowerCase()
  if (!value) {
    return null
  }

  if (value.includes('dark')) {
    return 'dark'
  }

  return 'light'
}

export function parseMacOsDefaults(raw: string): SystemTheme | null {
  const value = raw.trim().toLowerCase()
  if (value === 'dark') {
    return 'dark'
  }

  if (!value) {
    return null
  }

  return 'light'
}

export function parseWindowsAppsUseLightTheme(raw: string): SystemTheme | null {
  const hexMatch = raw.match(/AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i)
  if (hexMatch) {
    return Number.parseInt(hexMatch[1], 16) === 0 ? 'dark' : 'light'
  }

  const decimalMatch = raw.match(/AppsUseLightTheme\s+REG_DWORD\s+([01])/i)
  if (decimalMatch) {
    return Number.parseInt(decimalMatch[1], 10) === 0 ? 'dark' : 'light'
  }

  return null
}

export function parseGSettingsMonitorLine(rawLine: string): SystemTheme | null {
  const line = rawLine.trim()
  if (!line) {
    return null
  }

  const value = line.includes(':') ? line.split(':').at(-1) ?? line : line
  return parseGSettingsColorScheme(value)
}
