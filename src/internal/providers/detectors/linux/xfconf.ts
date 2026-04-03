import { CommandExecutionError } from '../../../exec.js'
import { parseThemeName } from '../../../parsers.js'
import type { ThemeDetector } from '../../types.js'

export const linuxXfconfDetector: ThemeDetector = {
  id: 'linux:xfconf-query',
  async detect({ exec }) {
    try {
      const result = await exec.execFile('xfconf-query', [
        '-c',
        'xsettings',
        '-p',
        '/Net/ThemeName'
      ])
      return parseThemeName(result.stdout)
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return null
      }

      throw error
    }
  }
}
