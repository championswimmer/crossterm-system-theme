import { describe, expect, it } from 'vitest'
import {
  parseGSettingsColorScheme,
  parseGSettingsMonitorLine,
  parseMacOsDefaults,
  parsePortalColorSchemeValue,
  parseThemeName,
  parseWindowsAppsUseLightTheme
} from '../src/internal/parsers.js'

describe('parsers', () => {
  it('parses portal color-scheme values', () => {
    expect(parsePortalColorSchemeValue('(<uint32 1>,)')).toBe('dark')
    expect(parsePortalColorSchemeValue('(<uint32 2>,)')).toBe('light')
    expect(parsePortalColorSchemeValue('(0,)')).toBe('light')
    expect(parsePortalColorSchemeValue('(nope)')).toBeNull()
  })

  it('parses gsettings color scheme', () => {
    expect(parseGSettingsColorScheme("'prefer-dark'\n")).toBe('dark')
    expect(parseGSettingsColorScheme("'prefer-light'")).toBe('light')
    expect(parseGSettingsColorScheme("'default'")).toBeNull()
  })

  it('parses theme names from GNOME/KDE/X11 outputs', () => {
    expect(parseThemeName("'Adwaita-dark'\n")).toBe('dark')
    expect(parseThemeName('Breeze')).toBe('light')
    expect(parseThemeName('')).toBeNull()
  })

  it('parses macOS defaults output', () => {
    expect(parseMacOsDefaults('Dark\n')).toBe('dark')
    expect(parseMacOsDefaults('Light\n')).toBe('light')
    expect(parseMacOsDefaults('')).toBeNull()
  })

  it('parses windows registry values', () => {
    expect(
      parseWindowsAppsUseLightTheme(
        'AppsUseLightTheme    REG_DWORD    0x0\n'
      )
    ).toBe('dark')
    expect(
      parseWindowsAppsUseLightTheme(
        'AppsUseLightTheme    REG_DWORD    0x1\n'
      )
    ).toBe('light')
    expect(
      parseWindowsAppsUseLightTheme(
        'AppsUseLightTheme    REG_DWORD    0\n'
      )
    ).toBe('dark')
    expect(parseWindowsAppsUseLightTheme('no value')).toBeNull()
  })

  it('parses gsettings monitor lines', () => {
    expect(parseGSettingsMonitorLine("color-scheme: 'prefer-dark'\n")).toBe(
      'dark'
    )
    expect(parseGSettingsMonitorLine("color-scheme: 'default'\n")).toBeNull()
  })
})
