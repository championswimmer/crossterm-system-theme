import { MonitoringUnsupportedError } from '../errors.js'
import { createNodeExecAdapter } from './exec.js'
import { macOsDetector } from './providers/detectors/macos.js'
import { windowsDetector } from './providers/detectors/windows.js'
import { linuxDetectors } from './providers/detectors/linux/index.js'
import { detectWithFallback } from './providers/fallback.js'
import type { ExecAdapter } from './exec.js'
import type { ThemeDetector } from './providers/types.js'
import type {
  SystemTheme,
  ThemeChangeCallback,
  ThemeClient,
  ThemeMonitor
} from '../types.js'
import { linuxGsettingsMonitorProvider } from './providers/monitors/linuxGsettings.js'

export interface CreateThemeClientOptions {
  platform?: NodeJS.Platform
  exec?: ExecAdapter
}

function getPlatformDetectors(platform: NodeJS.Platform): readonly ThemeDetector[] {
  if (platform === 'darwin') {
    return [macOsDetector]
  }

  if (platform === 'win32') {
    return [windowsDetector]
  }

  if (platform === 'linux') {
    return linuxDetectors
  }

  return []
}

export function createThemeClient(options: CreateThemeClientOptions = {}): ThemeClient {
  const exec = options.exec ?? createNodeExecAdapter()
  const platform = options.platform ?? process.platform

  async function getSystemTheme(): Promise<SystemTheme> {
    const detectors = getPlatformDetectors(platform)
    return detectWithFallback(detectors, { exec })
  }

  async function monitorSystemTheme(
    onChange: ThemeChangeCallback
  ): Promise<ThemeMonitor> {
    if (platform !== 'linux') {
      throw new MonitoringUnsupportedError(
        `System theme monitoring is not supported on ${platform} in this MVP build. Use polling with getSystemTheme() as fallback.`
      )
    }

    const initialTheme = await getSystemTheme()
    return linuxGsettingsMonitorProvider.start(
      { exec },
      {
        onChange,
        initialTheme
      }
    )
  }

  return {
    getSystemTheme,
    monitorSystemTheme
  }
}
