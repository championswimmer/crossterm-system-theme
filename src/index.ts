import { createThemeClient } from './internal/client.js'
import type { SystemTheme, ThemeChangeCallback, ThemeMonitor } from './types.js'

const defaultClient = createThemeClient()

export { setDebugLogger } from './logger.js'
export { MonitoringUnsupportedError, ThemeDetectionError } from './errors.js'
export type {
  ThemeChangeCallback,
  ThemeClient,
  ThemeMonitor,
  SystemTheme
} from './types.js'

export const getSystemTheme = (): Promise<SystemTheme> =>
  defaultClient.getSystemTheme()

export const monitorSystemTheme = (
  onChange: ThemeChangeCallback
): Promise<ThemeMonitor> => defaultClient.monitorSystemTheme(onChange)

export const __testing = {
  createThemeClient
}
