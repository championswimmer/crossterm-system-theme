import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const BINARY_NAME = 'crossterm-system-theme'

const moduleFilename =
  typeof import.meta === 'object' &&
  typeof import.meta.url === 'string' &&
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : typeof __filename === 'string' && __filename.startsWith('/')
      ? __filename
      : join(process.cwd(), 'index.js')

const requireFromHere: NodeJS.Require = createRequire(moduleFilename)

const moduleDirectory = dirname(moduleFilename)

export interface NativeMonitorHandle {
  stop(): void
}

export interface NativeBinding {
  getSystemThemeNative(): string
  startThemeMonitorNative(
    callback: (error: Error | null, theme: string) => void
  ): NativeMonitorHandle
}

let cachedNativeBinding: NativeBinding | undefined
let injectedNativeBinding: NativeBinding | undefined

export function getNativeBinding(): NativeBinding {
  if (injectedNativeBinding) {
    return injectedNativeBinding
  }

  if (cachedNativeBinding) {
    return cachedNativeBinding
  }

  cachedNativeBinding = loadNativeBinding()
  return cachedNativeBinding
}

export function __setNativeBindingForTests(binding?: NativeBinding): void {
  injectedNativeBinding = binding
  if (binding) {
    cachedNativeBinding = binding
    return
  }

  cachedNativeBinding = undefined
}

function loadNativeBinding(): NativeBinding {
  const loadErrors: unknown[] = []

  const envPath = process.env.NAPI_RS_NATIVE_LIBRARY_PATH
  if (envPath) {
    try {
      return requireFromHere(envPath) as NativeBinding
    } catch (error) {
      loadErrors.push(error)
    }
  }

  for (const target of getTargetsForCurrentRuntime()) {
    const localPaths = [
      join(moduleDirectory, '..', `${BINARY_NAME}.${target}.node`),
      join(moduleDirectory, '..', 'native', `${BINARY_NAME}.${target}.node`)
    ]

    for (const localPath of localPaths) {
      try {
        return requireFromHere(localPath) as NativeBinding
      } catch (error) {
        loadErrors.push(error)
      }
    }

    const packageName = `${BINARY_NAME}-${target}`
    try {
      return requireFromHere(packageName) as NativeBinding
    } catch (error) {
      loadErrors.push(error)
    }
  }

  const details = loadErrors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .join('\n')

  throw new Error(
    `Could not load native binding for ${process.platform}-${process.arch}. Tried all known targets.\n${details}`
  )
}

function getTargetsForCurrentRuntime(): string[] {
  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
      return ['darwin-arm64']
    }

    if (process.arch === 'x64') {
      return ['darwin-x64']
    }

    return []
  }

  if (process.platform === 'win32') {
    if (process.arch === 'x64') {
      return ['win32-x64-msvc']
    }

    if (process.arch === 'arm64') {
      return ['win32-arm64-msvc']
    }

    return []
  }

  if (process.platform === 'linux') {
    if (process.arch === 'x64') {
      return isMusl() ? ['linux-x64-musl', 'linux-x64-gnu'] : ['linux-x64-gnu']
    }

    if (process.arch === 'arm64') {
      return isMusl()
        ? ['linux-arm64-musl', 'linux-arm64-gnu']
        : ['linux-arm64-gnu']
    }

    return []
  }

  return []
}

function isMusl(): boolean {
  if (process.platform !== 'linux') {
    return false
  }

  const fromFilesystem = isMuslFromFilesystem()
  if (fromFilesystem !== null) {
    return fromFilesystem
  }

  const fromReport = isMuslFromReport()
  if (fromReport !== null) {
    return fromReport
  }

  return false
}

function isMuslFromFilesystem(): boolean | null {
  try {
    return readFileSync('/usr/bin/ldd', 'utf8').includes('musl')
  } catch {
    return null
  }
}

function isMuslFromReport(): boolean | null {
  const getReport = process.report?.getReport
  if (typeof getReport !== 'function') {
    return null
  }

  const report = getReport.call(process.report) as
    | {
        header?: { glibcVersionRuntime?: string }
        sharedObjects?: string[]
      }
    | undefined

  if (report?.header?.glibcVersionRuntime) {
    return false
  }

  if (!Array.isArray(report?.sharedObjects)) {
    return null
  }

  return report.sharedObjects.some(
    (entry: string) => entry.includes('libc.musl-') || entry.includes('ld-musl-')
  )
}
