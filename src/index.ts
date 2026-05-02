import {
  getNativeBinding,
  __setNativeBindingForTests
} from './internal/native.js'
import {
  mapNativeDetectionError,
  mapNativeMonitoringError,
  normalizeNativeTheme
} from './internal/native-bridge.js'
import type { NativeBinding, NativeMonitorHandle } from './internal/native.js'
import type { SystemTheme, ThemeChangeCallback, ThemeMonitor } from './types.js'

export { setDebugLogger } from './logger.js'
export { MonitoringUnsupportedError, ThemeDetectionError } from './errors.js'
export type {
  ThemeChangeCallback,
  ThemeClient,
  ThemeMonitor,
  SystemTheme
} from './types.js'

export async function getSystemTheme(): Promise<SystemTheme> {
  const native = getNativeBinding()

  try {
    const value = await Promise.resolve(native.getSystemThemeNative())
    return normalizeNativeTheme(value)
  } catch (error) {
    throw mapNativeDetectionError(error)
  }
}

export async function monitorSystemTheme(
  onChange: ThemeChangeCallback
): Promise<ThemeMonitor> {
  const native = getNativeBinding()

  let nativeHandle: NativeMonitorHandle
  try {
    nativeHandle = await Promise.resolve(
      native.startThemeMonitorNative((error, nextTheme) => {
        if (error) {
          return
        }

        const normalized = normalizeNativeTheme(nextTheme)
        onChange(normalized)
      })
    )
  } catch (error) {
    throw mapNativeMonitoringError(error)
  }

  return {
    stop() {
      nativeHandle.stop()
    }
  }
}

export const __testing = {
  setNativeBinding(binding?: NativeBinding) {
    __setNativeBindingForTests(binding)
  }
}
