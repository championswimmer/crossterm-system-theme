import { ThemeDetectionError } from '../../../errors.js'
import { CommandExecutionError } from '../../exec.js'
import { parseMacOsDefaults } from '../../parsers.js'
import type { ThemeDetector } from '../types.js'

const APPLE_INTERFACE_STYLE_MISSING =
  'the domain/default pair of (kcfpreferencesanyapplication, appleinterfacestyle) does not exist'

export const macOsDetector: ThemeDetector = {
  id: 'macos:defaults',
  async detect({ exec }) {
    try {
      const result = await exec.execFile('defaults', [
        'read',
        '-g',
        'AppleInterfaceStyle'
      ])
      return parseMacOsDefaults(result.stdout) ?? 'light'
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        const stderrLower = error.stderr.toLowerCase()

        if (stderrLower.includes(APPLE_INTERFACE_STYLE_MISSING)) {
          return 'light'
        }

        if (error.reason === 'not-found') {
          return null
        }
      }

      throw new ThemeDetectionError('Failed reading macOS system theme', {
        cause: error
      })
    }
  }
}
