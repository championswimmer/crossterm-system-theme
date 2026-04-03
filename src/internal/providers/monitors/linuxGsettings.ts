import { MonitoringUnsupportedError } from '../../../errors.js'
import { logDebug } from '../../../logger.js'
import { parseGSettingsMonitorLine } from '../../parsers.js'
import type { ThemeMonitor } from '../../../types.js'
import type { ThemeMonitorProvider } from '../types.js'

const STARTUP_GRACE_MS = 100

export const linuxGsettingsMonitorProvider: ThemeMonitorProvider = {
  id: 'linux:gsettings-monitor',
  async start({ exec }, { onChange, initialTheme }) {
    const child = exec.spawn('gsettings', [
      'monitor',
      'org.gnome.desktop.interface',
      'color-scheme'
    ])

    let lastTheme = initialTheme
    let stopped = false
    let buffer = ''

    const handleLine = (line: string): void => {
      const parsed = parseGSettingsMonitorLine(line)
      if (!parsed || parsed === lastTheme) {
        return
      }

      lastTheme = parsed
      onChange(parsed)
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        handleLine(line)
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      logDebug('monitor', 'gsettings stderr', { chunk })
    })

    return new Promise<ThemeMonitor>((resolve, reject) => {
      let settled = false

      const fail = (reason: string, cause?: unknown): void => {
        if (settled) {
          return
        }

        settled = true
        reject(new MonitoringUnsupportedError(reason, { cause }))
      }

      child.once('error', (error) => {
        fail(
          'gsettings monitor is not available in this Linux session. Fallback to polling.',
          error
        )
      })

      child.once('exit', (code, signal) => {
        if (stopped || settled) {
          return
        }

        fail(
          `gsettings monitor exited before startup (code: ${String(
            code
          )}, signal: ${String(signal)})`
        )
      })

      setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        resolve({
          stop() {
            if (stopped) {
              return
            }

            stopped = true
            child.kill()
          }
        })
      }, STARTUP_GRACE_MS)
    })
  }
}
