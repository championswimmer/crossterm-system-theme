export class ThemeDetectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ThemeDetectionError'
  }
}

export class MonitoringUnsupportedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MonitoringUnsupportedError'
  }
}
