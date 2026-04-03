import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { CommandResult, ExecAdapter } from '../../src/internal/exec.js'

type ExecResponse =
  | { type: 'ok'; value: CommandResult }
  | { type: 'error'; error: Error }

export class FakeExec implements ExecAdapter {
  private readonly responses = new Map<string, ExecResponse>()
  private spawnFactory: () => ChildProcessWithoutNullStreams = () =>
    createFakeChildProcess()

  onExecFile(command: string, args: string[], response: ExecResponse): void {
    this.responses.set(this.key(command, args), response)
  }

  onSpawn(factory: () => ChildProcessWithoutNullStreams): void {
    this.spawnFactory = factory
  }

  async execFile(
    command: string,
    args: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv }
  ): Promise<CommandResult> {
    const response = this.responses.get(this.key(command, args))
    if (!response) {
      throw new Error(`No fake response for command: ${this.key(command, args)}`)
    }

    if (response.type === 'error') {
      throw response.error
    }

    return response.value
  }

  spawn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _command: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _args: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ): ChildProcessWithoutNullStreams {
    return this.spawnFactory()
  }

  private key(command: string, args: string[]): string {
    return `${command} ${args.join(' ')}`
  }
}

interface FakeChildProcessControls {
  child: ChildProcessWithoutNullStreams
  pushStdout(data: string): void
  pushStderr(data: string): void
  emitError(error: Error): void
  emitExit(code?: number | null, signal?: NodeJS.Signals | null): void
}

export function createFakeChildProcess(): ChildProcessWithoutNullStreams {
  const emitter = new EventEmitter() as ChildProcessWithoutNullStreams
  const stdout = new PassThrough()
  const stderr = new PassThrough()

  emitter.stdout = stdout
  emitter.stderr = stderr
  emitter.kill = () => {
    emitter.emit('exit', 0, null)
    return true
  }

  return emitter
}

export function controllableChildProcess(): FakeChildProcessControls {
  const child = createFakeChildProcess()

  return {
    child,
    pushStdout(data) {
      child.stdout.write(data)
    },
    pushStderr(data) {
      child.stderr.write(data)
    },
    emitError(error) {
      child.emit('error', error)
    },
    emitExit(code = 0, signal = null) {
      child.emit('exit', code, signal)
    }
  }
}
