import { ThemeDetectionError } from '../../../errors.js'
import { CommandExecutionError } from '../../exec.js'
import { parseWindowsAppsUseLightTheme } from '../../parsers.js'
import type { ThemeDetector } from '../types.js'

const PERSONALIZE_PATH =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'

export const windowsDetector: ThemeDetector = {
  id: 'windows:reg-query',
  async detect({ exec }) {
    try {
      const result = await exec.execFile('reg', [
        'query',
        PERSONALIZE_PATH,
        '/v',
        'AppsUseLightTheme'
      ])

      const parsed = parseWindowsAppsUseLightTheme(result.stdout)
      if (parsed) {
        return parsed
      }

      throw new ThemeDetectionError(
        'Windows registry output did not include AppsUseLightTheme value'
      )
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        const message = `${error.stdout}\n${error.stderr}`.toLowerCase()
        if (
          message.includes('unable to find the specified registry key') ||
          message.includes('unable to find the specified registry value')
        ) {
          return 'light'
        }

        if (error.reason === 'not-found') {
          return null
        }
      }

      throw new ThemeDetectionError('Failed reading Windows system theme', {
        cause: error
      })
    }
  }
}
