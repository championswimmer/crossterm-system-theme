import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __testing,
  getSystemTheme,
  monitorSystemTheme,
  MonitoringUnsupportedError,
  ThemeDetectionError
} from '../src/index.js'
import type { NativeBinding } from '../src/internal/native.js'

describe('public API (native bridge)', () => {
  beforeEach(() => {
    __testing.setNativeBinding(undefined)
  })

  it('returns normalized theme from native binding', async () => {
    const nativeBinding: NativeBinding = {
      getSystemThemeNative: () => 'dark',
      startThemeMonitorNative: () => ({
        stop() {}
      })
    }

    __testing.setNativeBinding(nativeBinding)
    await expect(getSystemTheme()).resolves.toBe('dark')
  })

  it('throws ThemeDetectionError for invalid native values', async () => {
    const nativeBinding: NativeBinding = {
      getSystemThemeNative: () => 'nope',
      startThemeMonitorNative: () => ({
        stop() {}
      })
    }

    __testing.setNativeBinding(nativeBinding)
    await expect(getSystemTheme()).rejects.toBeInstanceOf(ThemeDetectionError)
  })

  it('maps monitoring unsupported native errors', async () => {
    const nativeBinding: NativeBinding = {
      getSystemThemeNative: () => 'light',
      startThemeMonitorNative: () => {
        throw new Error('MONITORING_UNSUPPORTED_ERROR:portal backend unavailable')
      }
    }

    __testing.setNativeBinding(nativeBinding)

    await expect(monitorSystemTheme(() => {})).rejects.toBeInstanceOf(
      MonitoringUnsupportedError
    )
  })

  it('emits monitor changes and forwards stop()', async () => {
    const stopSpy = vi.fn()
    let callback: ((error: Error | null, theme: string) => void) | undefined

    const nativeBinding: NativeBinding = {
      getSystemThemeNative: () => 'light',
      startThemeMonitorNative: (cb) => {
        callback = cb
        return {
          stop: stopSpy
        }
      }
    }

    __testing.setNativeBinding(nativeBinding)

    const changes: string[] = []
    const monitor = await monitorSystemTheme((theme) => {
      changes.push(theme)
    })

    callback?.(null, 'dark')
    callback?.(null, 'light')

    expect(changes).toEqual(['dark', 'light'])

    monitor.stop()
    expect(stopSpy).toHaveBeenCalledOnce()
  })
})
