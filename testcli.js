#!/usr/bin/env node
/* eslint-env node */

import {
  getSystemTheme,
  monitorSystemTheme,
  MonitoringUnsupportedError
} from './dist/index.js'

const args = new Set(process.argv.slice(2))

if (args.has('--help') || args.size === 0) {
  printUsage()
  process.exit(0)
}

const supportedFlags = new Set(['--show', '--monitor', '--help'])
const unknownFlags = [...args].filter((flag) => !supportedFlags.has(flag))
if (unknownFlags.length > 0) {
  console.error(`Unknown argument(s): ${unknownFlags.join(', ')}`)
  printUsage()
  process.exit(1)
}

const shouldShow = args.has('--show')
const shouldMonitor = args.has('--monitor')

if (!shouldShow && !shouldMonitor) {
  printUsage()
  process.exit(1)
}

await run()

async function run() {
  try {
    if (shouldShow) {
      const theme = await getSystemTheme()
      logWithTime(`Current system theme: ${theme}`)
    }

    if (!shouldMonitor) {
      return
    }

    if (!shouldShow) {
      const theme = await getSystemTheme()
      logWithTime(`Current system theme: ${theme}`)
    }

    const monitor = await monitorSystemTheme((theme) => {
      logWithTime(`Theme changed -> ${theme}`)
    })

    logWithTime('Monitoring theme changes. Press Ctrl+C to stop.')

    const cleanupAndExit = (code) => {
      monitor.stop()
      process.exit(code)
    }

    process.on('SIGINT', () => cleanupAndExit(0))
    process.on('SIGTERM', () => cleanupAndExit(0))

    await new Promise(() => {})
  } catch (error) {
    if (error instanceof MonitoringUnsupportedError) {
      console.error(`[monitoring unsupported] ${error.message}`)
      process.exit(2)
    }

    if (error instanceof Error) {
      console.error(`[error] ${error.name}: ${error.message}`)
    } else {
      console.error(`[error] ${String(error)}`)
    }

    process.exit(1)
  }
}

function logWithTime(message) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${message}`)
}

function printUsage() {
  console.log(`Usage:
  node testcli.js --show
  node testcli.js --monitor
  node testcli.js --show --monitor

Options:
  --show      Print current system theme once
  --monitor   Keep running and print theme change notifications
  --help      Show this help

Note: Build first so ./dist exists:
  npm run build`)
}
