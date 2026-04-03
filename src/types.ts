export type SystemTheme = 'light' | 'dark'

export type ThemeChangeCallback = (theme: SystemTheme) => void

export interface ThemeMonitor {
  stop(): void
}

export interface ThemeClient {
  getSystemTheme(): Promise<SystemTheme>
  monitorSystemTheme(onChange: ThemeChangeCallback): Promise<ThemeMonitor>
}
