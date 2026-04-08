/**
 * sample/monitor.js
 *
 * Subscribes to OS-native theme change events and prints each change.
 * Press Ctrl+C to stop.
 *
 * Usage:
 *   node sample/monitor.js
 */

import {
  getSystemTheme,
  monitorSystemTheme,
  MonitoringUnsupportedError,
  ThemeDetectionError,
} from '../dist/index.js'

// Print current theme first so the baseline is clear.
const current = await getSystemTheme()
console.log(`Current system theme : ${current}`)
console.log(`Listening for theme changes… (Ctrl+C to stop)\n`)

let monitor
try {
  monitor = await monitorSystemTheme((theme) => {
    const ts = new Date().toLocaleTimeString()
    console.log(`[${ts}] Theme changed → ${theme}`)
  })
} catch (err) {
  if (err instanceof MonitoringUnsupportedError) {
    console.error(`Native monitoring is not supported in this environment:`)
    console.error(`  ${err.message}`)
    console.error(`\nTry sample/polling.js instead.`)
  } else if (err instanceof ThemeDetectionError) {
    console.error(`Theme detection error: ${err.message}`)
  } else {
    console.error(`Unexpected error:`, err)
  }
  process.exit(1)
}

// Clean up on Ctrl+C.
process.on('SIGINT', () => {
  console.log('\nStopping monitor…')
  monitor.stop()
  process.exit(0)
})
