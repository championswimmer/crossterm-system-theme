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

function replaceCargoLockVersion(source, targetVersion) {
  return source.replace(
    createCargoLockVersionPattern(),
    `[[package]]\nname = "${packageName}"\nversion = "${targetVersion}"`,
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
      throw new Error(
        'Unable to find version field in the [package] section of native/Cargo.toml',
      )
    }

    const match = line.match(versionLinePattern)
    if (match) {
      return match[1]
    }
  }

  if (!inPackageSection) {
    throw new Error('Unable to find a [package] section in native/Cargo.toml')
  }

  throw new Error(
    'Unable to find version field in the [package] section of native/Cargo.toml',
  )
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
      throw new Error(
        'Unable to update native/Cargo.toml because the [package] section does not contain a version field',
      )
    }

    if (versionLinePattern.test(line)) {
      lines[index] = `version = "${targetVersion}"`
      return lines.join('\n')
    }
  }

  if (!inPackageSection) {
    throw new Error(
      'Unable to update native/Cargo.toml because no [package] section was found',
    )
  }

  throw new Error(
    'Unable to update native/Cargo.toml because the [package] section does not contain a version field',
  )
}

const cargoTomlVersion = findCargoTomlVersion(cargoToml)
const cargoLockVersionMatch = cargoLock.match(createCargoLockVersionPattern())

if (!cargoLockVersionMatch) {
  throw new Error(
    `Unable to find the ${packageName} package entry in native/Cargo.lock`,
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
  const nextCargoLock = replaceCargoLockVersion(cargoLock, version)

  if (nextCargoLock === cargoLock) {
    throw new Error(
      `Unable to update native/Cargo.lock because the ${packageName} package entry was not found`,
    )
  }

  writeFileSync(
    cargoTomlPath,
    nextCargoToml,
    'utf8',
  )
  writeFileSync(
    cargoLockPath,
    nextCargoLock,
    'utf8',
  )
}
