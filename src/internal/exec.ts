import { execFile as nodeExecFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams, SpawnOptions } from 'node:child_process'

export type CommandFailureReason = 'not-found' | 'non-zero' | 'timeout'

export interface ExecOptions {
  timeoutMs?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class CommandExecutionError extends Error {
  readonly reason: CommandFailureReason
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null

  constructor(
    message: string,
    reason: CommandFailureReason,
    options: {
      stdout?: string
      stderr?: string
      exitCode?: number | null
      cause?: unknown
    } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'CommandExecutionError'
    this.reason = reason
    this.stdout = options.stdout ?? ''
    this.stderr = options.stderr ?? ''
    this.exitCode = options.exitCode ?? null
  }
}

export interface ExecAdapter {
  execFile(
    command: string,
    args: string[],
    options?: ExecOptions
  ): Promise<CommandResult>
  spawn(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): ChildProcessWithoutNullStreams
}

function getReason(error: NodeJS.ErrnoException): CommandFailureReason {
  if (error.code === 'ENOENT') {
    return 'not-found'
  }

  if (typeof error.message === 'string' && error.message.includes('timed out')) {
    return 'timeout'
  }

  return 'non-zero'
}

export function createNodeExecAdapter(): ExecAdapter {
  return {
    async execFile(command, args, options) {
      const timeout = options?.timeoutMs
      return new Promise<CommandResult>((resolve, reject) => {
        nodeExecFile(
          command,
          args,
          {
            timeout,
            cwd: options?.cwd,
            env: options?.env,
            windowsHide: true,
            maxBuffer: 1024 * 1024
          },
          (error, stdout, stderr) => {
            if (error) {
              const nodeError = error as NodeJS.ErrnoException
              const exitCode =
                typeof nodeError.code === 'number' ? nodeError.code : null
              reject(
                new CommandExecutionError(
                  `Command failed: ${command} ${args.join(' ')}`,
                  getReason(nodeError),
                  {
                    stdout,
                    stderr,
                    exitCode,
                    cause: nodeError
                  }
                )
              )
              return
            }

            resolve({ stdout, stderr, exitCode: 0 })
          }
        )
      })
    },

    spawn(command, args, options) {
      return spawn(command, args, {
        windowsHide: true,
        stdio: 'pipe',
        ...options
      })
    }
  }
}
