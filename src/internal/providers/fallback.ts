import { ThemeDetectionError } from '../../errors.js'
import { logDebug } from '../../logger.js'
import type { SystemTheme } from '../../types.js'
import type { ProviderContext, ThemeDetector } from './types.js'

export async function detectWithFallback(
  detectors: readonly ThemeDetector[],
  context: ProviderContext
): Promise<SystemTheme> {
  const failures: string[] = []

  for (const detector of detectors) {
    try {
      const theme = await detector.detect(context)
      if (theme) {
        logDebug('detector', `Detected theme from ${detector.id}`, { theme })
        return theme
      }

      logDebug('detector', `Detector ${detector.id} unavailable`)
    } catch (error) {
      failures.push(`${detector.id}: ${(error as Error).message}`)
      logDebug('detector', `Detector ${detector.id} failed`, {
        error: (error as Error).message
      })
    }
  }

  throw new ThemeDetectionError(
    failures.length > 0
      ? `Could not detect system theme. Tried: ${failures.join('; ')}`
      : 'Could not detect system theme. No providers were available.'
  )
}
