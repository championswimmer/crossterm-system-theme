import type { ExecAdapter } from '../exec.js'
import type { SystemTheme, ThemeChangeCallback, ThemeMonitor } from '../../types.js'

export interface ProviderContext {
  exec: ExecAdapter
}

export interface ThemeDetector {
  id: string
  detect(context: ProviderContext): Promise<SystemTheme | null>
}

export interface MonitorStartOptions {
  onChange: ThemeChangeCallback
  initialTheme: SystemTheme
}

export interface ThemeMonitorProvider {
  id: string
  start(context: ProviderContext, options: MonitorStartOptions): Promise<ThemeMonitor>
}
