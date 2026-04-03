import { describe, expect, it, vi } from 'vitest'
import { createThemeClient } from '../src/internal/client.js'
import { MonitoringUnsupportedError } from '../src/errors.js'
import { CommandExecutionError } from '../src/internal/exec.js'
import { FakeExec, controllableChildProcess } from './helpers/fake-exec.js'

describe('createThemeClient', () => {
  it('detects macOS dark mode with defaults', async () => {
    const exec = new FakeExec()
    exec.onExecFile(
      'defaults',
      ['read', '-g', 'AppleInterfaceStyle'],
      {
        type: 'ok',
        value: { stdout: 'Dark\n', stderr: '', exitCode: 0 }
      }
    )

    const client = createThemeClient({ platform: 'darwin', exec })
    await expect(client.getSystemTheme()).resolves.toBe('dark')
  })

  it('falls back to light when macOS interface style key is missing', async () => {
    const exec = new FakeExec()
    exec.onExecFile(
      'defaults',
      ['read', '-g', 'AppleInterfaceStyle'],
      {
        type: 'error',
        error: new CommandExecutionError(
          'missing key',
          'non-zero',
          {
            stderr:
              'The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist'
          }
        )
      }
    )

    const client = createThemeClient({ platform: 'darwin', exec })
    await expect(client.getSystemTheme()).resolves.toBe('light')
  })

  it('detects windows dark mode from registry value 0x0', async () => {
    const exec = new FakeExec()
    exec.onExecFile(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
        '/v',
        'AppsUseLightTheme'
      ],
      {
        type: 'ok',
        value: {
          stdout: 'AppsUseLightTheme    REG_DWORD    0x0\n',
          stderr: '',
          exitCode: 0
        }
      }
    )

    const client = createThemeClient({ platform: 'win32', exec })
    await expect(client.getSystemTheme()).resolves.toBe('dark')
  })

  it('uses linux fallback order (portal -> gsettings) for detection', async () => {
    const exec = new FakeExec()
    exec.onExecFile(
      'gdbus',
      [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.portal.Desktop',
        '--object-path',
        '/org/freedesktop/portal/desktop',
        '--method',
        'org.freedesktop.portal.Settings.ReadOne',
        'org.freedesktop.appearance',
        'color-scheme'
      ],
      {
        type: 'error',
        error: new CommandExecutionError('portal unavailable', 'non-zero')
      }
    )
    exec.onExecFile(
      'gsettings',
      ['get', 'org.gnome.desktop.interface', 'color-scheme'],
      {
        type: 'ok',
        value: {
          stdout: "'prefer-dark'\n",
          stderr: '',
          exitCode: 0
        }
      }
    )

    const client = createThemeClient({ platform: 'linux', exec })
    await expect(client.getSystemTheme()).resolves.toBe('dark')
  })

  it('throws monitoring unsupported for non-linux platforms', async () => {
    const exec = new FakeExec()
    exec.onExecFile(
      'defaults',
      ['read', '-g', 'AppleInterfaceStyle'],
      {
        type: 'ok',
        value: { stdout: 'Dark\n', stderr: '', exitCode: 0 }
      }
    )

    const client = createThemeClient({ platform: 'darwin', exec })
    await expect(client.monitorSystemTheme(vi.fn())).rejects.toBeInstanceOf(
      MonitoringUnsupportedError
    )
  })

  it('linux monitor emits only transitions', async () => {
    const exec = new FakeExec()

    exec.onExecFile(
      'gdbus',
      [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.portal.Desktop',
        '--object-path',
        '/org/freedesktop/portal/desktop',
        '--method',
        'org.freedesktop.portal.Settings.ReadOne',
        'org.freedesktop.appearance',
        'color-scheme'
      ],
      {
        type: 'error',
        error: new CommandExecutionError('portal unavailable', 'non-zero')
      }
    )
    exec.onExecFile(
      'gsettings',
      ['get', 'org.gnome.desktop.interface', 'color-scheme'],
      {
        type: 'ok',
        value: {
          stdout: "'prefer-light'\n",
          stderr: '',
          exitCode: 0
        }
      }
    )

    const controlled = controllableChildProcess()
    exec.onSpawn(() => controlled.child)

    const changes: string[] = []
    const client = createThemeClient({ platform: 'linux', exec })

    const monitor = await client.monitorSystemTheme((theme) => {
      changes.push(theme)
    })

    controlled.pushStdout("color-scheme: 'prefer-light'\n")
    controlled.pushStdout("color-scheme: 'prefer-dark'\n")
    controlled.pushStdout("color-scheme: 'prefer-dark'\n")
    controlled.pushStdout("color-scheme: 'prefer-light'\n")

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(changes).toEqual(['dark', 'light'])
    monitor.stop()
  })
})
