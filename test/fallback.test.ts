import { describe, expect, it } from 'vitest'
import { detectWithFallback } from '../src/internal/providers/fallback.js'
import { ThemeDetectionError } from '../src/errors.js'
import type { ThemeDetector } from '../src/internal/providers/types.js'

describe('detectWithFallback', () => {
  it('uses the first detector that resolves a theme', async () => {
    const calls: string[] = []

    const detectors: ThemeDetector[] = [
      {
        id: 'first',
        async detect() {
          calls.push('first')
          return null
        }
      },
      {
        id: 'second',
        async detect() {
          calls.push('second')
          return 'dark'
        }
      },
      {
        id: 'third',
        async detect() {
          calls.push('third')
          return 'light'
        }
      }
    ]

    const theme = await detectWithFallback(detectors, {
      exec: {} as never
    })

    expect(theme).toBe('dark')
    expect(calls).toEqual(['first', 'second'])
  })

  it('continues when an earlier detector throws', async () => {
    const detectors: ThemeDetector[] = [
      {
        id: 'first',
        async detect() {
          throw new Error('not available')
        }
      },
      {
        id: 'second',
        async detect() {
          return 'light'
        }
      }
    ]

    await expect(
      detectWithFallback(detectors, {
        exec: {} as never
      })
    ).resolves.toBe('light')
  })

  it('throws ThemeDetectionError if all detectors fail', async () => {
    const detectors: ThemeDetector[] = [
      {
        id: 'a',
        async detect() {
          return null
        }
      },
      {
        id: 'b',
        async detect() {
          throw new Error('broken')
        }
      }
    ]

    await expect(
      detectWithFallback(detectors, {
        exec: {} as never
      })
    ).rejects.toBeInstanceOf(ThemeDetectionError)
  })
})
