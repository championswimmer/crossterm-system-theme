import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { URL } from 'node:url'

const mode = process.argv[2] ?? 'write'
const packageJsonPath = new URL('../package.json', import.meta.url)
const cargoTomlPath = new URL('../native/Cargo.toml', import.meta.url)
const cargoLockPath = new URL('../native/Cargo.lock', import.meta.url)

if (mode !== 'check' && mode !== 'write') {
  throw new Error(`Invalid mode "${mode}". Expected "check" or "write".`)
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const packageName = packageJson.name
const version = packageJson.version

const cargoToml = readFileSync(cargoTomlPath, 'utf8')
const cargoLock = readFileSync(cargoLockPath, 'utf8')

function findCargoTomlVersion(source) {
  const lines = source.split('\n')
  let inPackageSection = false

  for (const line of lines) {
    if (!inPackageSection) {
      if (line.trim() === '[package]') {
        inPackageSection = true
      }

      continue
    }

    if (line.startsWith('[')) {
      return null
    }

    const match = line.match(/^version = "([^"]+)"$/)
    if (match) {
      return match[1]
    }
  }

  return null
}

function replaceCargoTomlVersion(source, nextVersion) {
  const lines = source.split('\n')
  let inPackageSection = false

  for (const [index, line] of lines.entries()) {
    if (!inPackageSection) {
      if (line.trim() === '[package]') {
        inPackageSection = true
      }

      continue
    }

    if (line.startsWith('[')) {
      break
    }

    if (/^version = "([^"]+)"$/.test(line)) {
      lines[index] = `version = "${nextVersion}"`
      return lines.join('\n')
    }
  }

  return null
}

const cargoTomlVersion = findCargoTomlVersion(cargoToml)
const cargoLockVersionMatch = cargoLock.match(
  new RegExp(
    String.raw`\[\[package\]\]\nname = "${packageName}"\nversion = "([^"]+)"`,
  ),
)

if (!cargoTomlVersion || !cargoLockVersionMatch) {
  const missingFiles = [
    !cargoTomlVersion ? 'native/Cargo.toml' : null,
    !cargoLockVersionMatch ? 'native/Cargo.lock' : null,
  ].filter(Boolean)
  throw new Error(
    `Unable to locate native package version metadata in ${missingFiles.join(', ')}`,
  )
}

if (mode === 'check') {
  if (cargoTomlVersion !== version || cargoLockVersionMatch[1] !== version) {
    throw new Error(
      `Version mismatch detected: package.json=${version}, Cargo.toml=${cargoTomlVersion}, Cargo.lock=${cargoLockVersionMatch[1]}`,
    )
  }
} else {
  const nextCargoToml = replaceCargoTomlVersion(cargoToml, version)
  if (!nextCargoToml) {
    throw new Error(
      'Unable to update native/Cargo.toml because the package version field was not found',
    )
  }

  writeFileSync(
    cargoTomlPath,
    nextCargoToml,
  )
  writeFileSync(
    cargoLockPath,
    cargoLock.replace(
      new RegExp(
        String.raw`(\[\[package\]\]\nname = "${packageName}"\nversion = ")([^"]+)(")`,
      ),
      `$1${version}$3`,
    ),
  )
}
