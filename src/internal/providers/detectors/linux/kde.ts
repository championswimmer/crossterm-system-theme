import { CommandExecutionError } from '../../../exec.js'
import { parseThemeName } from '../../../parsers.js'
import type { ThemeDetector } from '../../types.js'

const KREADCONFIG_ARGS = [
  '--file',
  'kdeglobals',
  '--group',
  'General',
  '--key',
  'ColorScheme'
]

async function readColorScheme(command: 'kreadconfig6' | 'kreadconfig5', exec: {
  execFile: (command: string, args: string[]) => Promise<{ stdout: string }>
}): Promise<string | null> {
  try {
    const result = await exec.execFile(command, KREADCONFIG_ARGS)
    return result.stdout
  } catch (error) {
    if (error instanceof CommandExecutionError) {
      return null
    }

    throw error
  }
}

export const linuxKdeDetector: ThemeDetector = {
  id: 'linux:kde-kreadconfig',
  async detect({ exec }) {
    const output6 = await readColorScheme('kreadconfig6', exec)
    if (output6) {
      return parseThemeName(output6)
    }

    const output5 = await readColorScheme('kreadconfig5', exec)
    if (!output5) {
      return null
    }

    return parseThemeName(output5)
  }
}
