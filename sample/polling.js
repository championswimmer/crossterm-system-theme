/**
 * sample/polling.js
 *
 * Detects theme changes by polling getSystemTheme() at a regular interval.
 * Useful as a fallback when native monitoring is unavailable.
 * Press Ctrl+C to stop.
 *
 * Usage:
 *   node sample/polling.js [interval_ms]
 *
 * Examples:
 *   node sample/polling.js          # polls every 2 000 ms (default)
 *   node sample/polling.js 500      # polls every 500 ms
 */

import { getSystemTheme, ThemeDetectionError } from '../dist/index.js'

const INTERVAL_MS = parseInt(process.argv[2] ?? '2000', 10)

if (isNaN(INTERVAL_MS) || INTERVAL_MS < 100) {
  console.error('Interval must be a number ≥ 100 ms.')
  process.exit(1)
}

// Bootstrap: read the initial theme.
let lastTheme
try {
  lastTheme = await getSystemTheme()
} catch (err) {
  console.error(`Failed to read initial theme: ${err.message}`)
  process.exit(1)
}

console.log(`Current system theme : ${lastTheme}`)
console.log(`Polling every ${INTERVAL_MS} ms for changes… (Ctrl+C to stop)\n`)

const timer = setInterval(async () => {
  let theme
  try {
    theme = await getSystemTheme()
  } catch (err) {
    if (err instanceof ThemeDetectionError) {
      console.error(`Poll error: ${err.message}`)
    } else {
      console.error(`Unexpected poll error:`, err)
    }
    return
  }

  if (theme !== lastTheme) {
    const ts = new Date().toLocaleTimeString()
    console.log(`[${ts}] Theme changed ${lastTheme} → ${theme}`)
    lastTheme = theme
  }
}, INTERVAL_MS)

process.on('SIGINT', () => {
  console.log('\nStopping poller…')
  clearInterval(timer)
  process.exit(0)
})
