import { MonitoringUnsupportedError, ThemeDetectionError } from '../errors.js'
import type { SystemTheme } from '../types.js'

const MONITORING_UNSUPPORTED_ERROR_PREFIX = 'MONITORING_UNSUPPORTED_ERROR:'
const THEME_DETECTION_ERROR_PREFIX = 'THEME_DETECTION_ERROR:'

export function normalizeNativeTheme(theme: string): SystemTheme {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }

  throw new ThemeDetectionError(
    `Native binding returned unexpected theme value: ${String(theme)}`
  )
}

export function mapNativeDetectionError(error: unknown): ThemeDetectionError {
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

export function mapNativeMonitoringError(error: unknown): Error {
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
