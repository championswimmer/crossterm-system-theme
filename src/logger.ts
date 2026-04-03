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
  debugLogger?.({ scope, message, meta })
}
