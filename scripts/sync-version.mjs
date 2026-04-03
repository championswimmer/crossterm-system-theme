import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { URL } from 'node:url'

const mode = process.argv[2]
const packageJsonPath = new URL('../package.json', import.meta.url)
const cargoTomlPath = new URL('../native/Cargo.toml', import.meta.url)
const cargoLockPath = new URL('../native/Cargo.lock', import.meta.url)
const versionLinePattern = /^version = "([^"]+)"$/

if (mode !== 'check' && mode !== 'write') {
  throw new Error(`Invalid mode "${mode}". Expected "check" or "write".`)
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const packageName = packageJson.name
const version = packageJson.version

const cargoToml = readFileSync(cargoTomlPath, 'utf8')
const cargoLock = readFileSync(cargoLockPath, 'utf8')

function createCargoLockVersionPattern(capturePrefix = false) {
  return new RegExp(
    capturePrefix
      ? String.raw`(\[\[package\]\]\nname = "${packageName}"\nversion = ")([^"]+)(")`
      : String.raw`\[\[package\]\]\nname = "${packageName}"\nversion = "([^"]+)"`,
  )
}

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

    const match = line.match(versionLinePattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

function replaceCargoTomlVersion(source, targetVersion) {
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

    if (versionLinePattern.test(line)) {
      lines[index] = `version = "${targetVersion}"`
      return lines.join('\n')
    }
  }

  return null
}

const cargoTomlVersion = findCargoTomlVersion(cargoToml)
const cargoLockVersionMatch = cargoLock.match(createCargoLockVersionPattern())

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
    const mismatches = [
      cargoTomlVersion !== version
        ? `native/Cargo.toml=${cargoTomlVersion}`
        : null,
      cargoLockVersionMatch[1] !== version
        ? `native/Cargo.lock=${cargoLockVersionMatch[1]}`
        : null,
    ].filter(Boolean)
    throw new Error(
      `Version mismatch detected for ${mismatches.join(', ')}; package.json=${version}`,
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
      createCargoLockVersionPattern(true),
      `$1${version}$3`,
    ),
  )
}
