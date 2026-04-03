import { MonitoringUnsupportedError, ThemeDetectionError } from './errors.js'
import { getNativeBinding, __setNativeBindingForTests } from './internal/native.js'
import type {
  NativeBinding,
  NativeMonitorHandle
} from './internal/native.js'
import type { SystemTheme, ThemeChangeCallback, ThemeMonitor } from './types.js'

export { setDebugLogger } from './logger.js'
export { MonitoringUnsupportedError, ThemeDetectionError } from './errors.js'
export type {
  ThemeChangeCallback,
  ThemeClient,
  ThemeMonitor,
  SystemTheme
} from './types.js'

const MONITORING_UNSUPPORTED_ERROR_PREFIX = 'MONITORING_UNSUPPORTED_ERROR:'
const THEME_DETECTION_ERROR_PREFIX = 'THEME_DETECTION_ERROR:'

export async function getSystemTheme(): Promise<SystemTheme> {
  const native = getNativeBinding()

  try {
    const value = await Promise.resolve(native.getSystemThemeNative())
    return normalizeTheme(value)
  } catch (error) {
    throw mapDetectionError(error)
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

        const normalized = normalizeTheme(nextTheme)
        onChange(normalized)
      })
    )
  } catch (error) {
    throw mapMonitoringError(error)
  }

  return {
    stop() {
      nativeHandle.stop()
    }
  }
}

function normalizeTheme(theme: string): SystemTheme {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }

  throw new ThemeDetectionError(
    `Native binding returned unexpected theme value: ${String(theme)}`
  )
}

function mapDetectionError(error: unknown): ThemeDetectionError {
  const message = getErrorMessage(error)
  if (message.startsWith(THEME_DETECTION_ERROR_PREFIX)) {
    return new ThemeDetectionError(
      message.slice(THEME_DETECTION_ERROR_PREFIX.length),
      {
        cause: error
      }
    )
  }

  return new ThemeDetectionError(message, { cause: error })
}

function mapMonitoringError(error: unknown): Error {
  const message = getErrorMessage(error)
  if (message.startsWith(MONITORING_UNSUPPORTED_ERROR_PREFIX)) {
    return new MonitoringUnsupportedError(
      message.slice(MONITORING_UNSUPPORTED_ERROR_PREFIX.length),
      {
        cause: error
      }
    )
  }

  if (message.startsWith(THEME_DETECTION_ERROR_PREFIX)) {
    return new ThemeDetectionError(
      message.slice(THEME_DETECTION_ERROR_PREFIX.length),
      {
        cause: error
      }
    )
  }

  return new ThemeDetectionError(message, { cause: error })
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const __testing = {
  setNativeBinding(binding?: NativeBinding) {
    __setNativeBindingForTests(binding)
  }
}
