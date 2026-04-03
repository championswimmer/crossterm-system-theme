import { CommandExecutionError } from '../../../exec.js'
import {
  parseGSettingsColorScheme,
  parseThemeName
} from '../../../parsers.js'
import type { ThemeDetector } from '../../types.js'

const SCHEMA = 'org.gnome.desktop.interface'

export const linuxGnomeDetector: ThemeDetector = {
  id: 'linux:gnome-gsettings',
  async detect({ exec }) {
    try {
      const colorScheme = await exec.execFile('gsettings', [
        'get',
        SCHEMA,
        'color-scheme'
      ])

      const parsedColorScheme = parseGSettingsColorScheme(colorScheme.stdout)
      if (parsedColorScheme) {
        return parsedColorScheme
      }
    } catch (error) {
      if (!(error instanceof CommandExecutionError)) {
        throw error
      }

      if (error.reason === 'not-found') {
        return null
      }
    }

    try {
      const gtkTheme = await exec.execFile('gsettings', [
        'get',
        SCHEMA,
        'gtk-theme'
      ])

      return parseThemeName(gtkTheme.stdout)
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return null
      }

      throw error
    }
  }
}
