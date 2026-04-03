import { parsePortalColorSchemeValue } from '../../../parsers.js'
import { CommandExecutionError } from '../../../exec.js'
import type { ThemeDetector } from '../../types.js'

const PORTAL_ARGS = [
  'call',
  '--session',
  '--dest',
  'org.freedesktop.portal.Desktop',
  '--object-path',
  '/org/freedesktop/portal/desktop',
  '--method',
  'org.freedesktop.portal.Settings.ReadOne',
  'org.freedesktop.appearance',
  'color-scheme'
]

export const linuxPortalDetector: ThemeDetector = {
  id: 'linux:portal-readone',
  async detect({ exec }) {
    try {
      const result = await exec.execFile('gdbus', PORTAL_ARGS)
      return parsePortalColorSchemeValue(result.stdout)
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return null
      }

      throw error
    }
  }
}
