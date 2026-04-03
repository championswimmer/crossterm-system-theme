import { readFileSync, writeFileSync } from 'node:fs'

const mode = process.argv[2] ?? 'write'
const packageJsonPath = new URL('../package.json', import.meta.url)
const cargoTomlPath = new URL('../native/Cargo.toml', import.meta.url)
const cargoLockPath = new URL('../native/Cargo.lock', import.meta.url)

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const version = packageJson.version

const cargoToml = readFileSync(cargoTomlPath, 'utf8')
const cargoLock = readFileSync(cargoLockPath, 'utf8')

const cargoTomlVersionMatch = cargoToml.match(
  /\[package\][\s\S]*?\nversion = "([^"]+)"/,
)
const cargoLockVersionMatch = cargoLock.match(
  /\[\[package\]\]\nname = "crossterm-system-theme"\nversion = "([^"]+)"/,
)

if (!cargoTomlVersionMatch || !cargoLockVersionMatch) {
  throw new Error('Unable to locate native package version metadata')
}

if (mode === 'check') {
  if (
    cargoTomlVersionMatch[1] !== version ||
    cargoLockVersionMatch[1] !== version
  ) {
    throw new Error(
      `Version mismatch detected: package.json=${version}, Cargo.toml=${cargoTomlVersionMatch[1]}, Cargo.lock=${cargoLockVersionMatch[1]}`,
    )
  }
} else {
  writeFileSync(
    cargoTomlPath,
    cargoToml.replace(
      /(\[package\][\s\S]*?\nversion = ")([^"]+)(")/,
      `$1${version}$3`,
    ),
  )
  writeFileSync(
    cargoLockPath,
    cargoLock.replace(
      /(\[\[package\]\]\nname = "crossterm-system-theme"\nversion = ")([^"]+)(")/,
      `$1${version}$3`,
    ),
  )
}
