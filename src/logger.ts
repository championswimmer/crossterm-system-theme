export interface DebugLogEntry {
  scope: string
  message: string
  meta?: Record<string, unknown>
}

export type DebugLogger = (entry: DebugLogEntry) => void

let debugLogger: DebugLogger | undefined

export function setDebugLogger(logger?: DebugLogger): void {
  debugLogger = logger
}

export function logDebug(
  scope: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  if (!debugLogger) {
    return
  }

  if (meta) {
    debugLogger({ scope, message, meta })
    return
  }

  debugLogger({ scope, message })
}
