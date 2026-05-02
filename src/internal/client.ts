import { MonitoringUnsupportedError } from '../errors.js'
import { createNodeExecAdapter } from './exec.js'
import {
  mapNativeDetectionError,
  mapNativeMonitoringError,
  normalizeNativeTheme
} from './native-bridge.js'
import { getNativeBinding } from './native.js'
import { macOsDetector } from './providers/detectors/macos.js'
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

function getPlatformDetectors(
  platform: NodeJS.Platform
): readonly ThemeDetector[] {
  if (platform === 'darwin') {
    return [macOsDetector]
  }

  if (platform === 'linux') {
    return linuxDetectors
  }

  return []
}

export function createThemeClient(
  options: CreateThemeClientOptions = {}
): ThemeClient {
  const exec = options.exec ?? createNodeExecAdapter()
  const platform = options.platform ?? process.platform

  async function getSystemTheme(): Promise<SystemTheme> {
    if (platform === 'win32') {
      const native = getNativeBinding()

      try {
        const value = await Promise.resolve(native.getSystemThemeNative())
        return normalizeNativeTheme(value)
      } catch (error) {
        throw mapNativeDetectionError(error)
      }
    }

    const detectors = getPlatformDetectors(platform)
    return detectWithFallback(detectors, { exec })
  }

  async function monitorSystemTheme(
    onChange: ThemeChangeCallback
  ): Promise<ThemeMonitor> {
    if (platform === 'win32') {
      const native = getNativeBinding()

      try {
        const nativeHandle = await Promise.resolve(
          native.startThemeMonitorNative((error, nextTheme) => {
            if (error) {
              return
            }

            onChange(normalizeNativeTheme(nextTheme))
          })
        )

        return {
          stop() {
            nativeHandle.stop()
          }
        }
      } catch (error) {
        throw mapNativeMonitoringError(error)
      }
    }

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
