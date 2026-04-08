/**
 * sample/current-theme.js
 *
 * One-shot check: prints the current system theme and exits.
 *
 * Usage:
 *   node sample/current-theme.js
 */

import { getSystemTheme, ThemeDetectionError } from '../dist/index.js'

try {
  const theme = await getSystemTheme()
  console.log(`Current system theme: ${theme}`)
} catch (err) {
  if (err instanceof ThemeDetectionError) {
    console.error(`Theme detection failed: ${err.message}`)
  } else {
    console.error(`Unexpected error:`, err)
  }
  process.exit(1)
}
