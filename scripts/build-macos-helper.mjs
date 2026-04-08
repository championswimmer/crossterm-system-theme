import { copyFileSync, chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const root = process.cwd()
const manifestPath = join(root, 'native', 'Cargo.toml')
const helperName = 'macos-theme-helper'
const builtHelperPath = join(root, 'native', 'target', 'release', helperName)
const outputHelperPath = join(root, 'native', helperName)

execSync(
  `cargo build --manifest-path "${manifestPath}" --release --bin ${helperName}`,
  { stdio: 'inherit' }
)

if (!existsSync(builtHelperPath)) {
  throw new Error(`Expected helper binary not found at ${builtHelperPath}`)
}

copyFileSync(builtHelperPath, outputHelperPath)
chmodSync(outputHelperPath, 0o755)

console.log(`Built macOS monitor helper: ${outputHelperPath}`)
