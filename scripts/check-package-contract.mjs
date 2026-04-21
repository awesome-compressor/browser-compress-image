import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const packageJsonPath = path.join(rootDir, 'package.json')
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function normalizeDistPath(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} is missing or invalid.`)
  }

  const normalized = value.replace(/^\.\//, '')

  if (!normalized.startsWith('dist/')) {
    fail(`${label} must point into dist/: ${value}`)
  }

  const absolutePath = path.join(rootDir, normalized)

  if (!existsSync(absolutePath)) {
    fail(`${label} does not exist: ${value}`)
  }

  return normalized
}

function collectExportSpecifiers(exportsField) {
  if (!exportsField || typeof exportsField !== 'object') {
    fail('package.json exports is missing or invalid.')
  }

  return Object.keys(exportsField).map((subpath) => {
    if (subpath === '.') {
      return pkg.name
    }

    return `${pkg.name}/${subpath.slice(2)}`
  })
}

function runNodeCheck(args, source, label) {
  try {
    execFileSync(process.execPath, [...args, '-e', source], {
      cwd: rootDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .join('\n')
      .trim()
    fail(`${label} failed.${output ? `\n${output}` : ''}`)
  }
}

if (!Array.isArray(pkg.files) || !pkg.files.includes('dist')) {
  fail('package.json files must include dist.')
}

normalizeDistPath(pkg.main, 'package.json main')
normalizeDistPath(pkg.module, 'package.json module')
normalizeDistPath(pkg.types, 'package.json types')

for (const [subpath, config] of Object.entries(pkg.exports)) {
  const resolved =
    typeof config === 'string'
      ? { import: config }
      : config && typeof config === 'object'
        ? config
        : null

  if (!resolved) {
    fail(`package.json exports entry is invalid: ${subpath}`)
  }

  for (const key of ['types', 'import', 'require']) {
    if (resolved[key]) {
      normalizeDistPath(
        resolved[key],
        `package.json exports["${subpath}"].${key}`,
      )
    }
  }
}

const specifiers = collectExportSpecifiers(pkg.exports)

runNodeCheck(
  ['--input-type=module'],
  `
const specifiers = ${JSON.stringify(specifiers)}
for (const specifier of specifiers) {
  await import(specifier)
}
console.log('esm package smoke ok')
process.exit(0)
`,
  'ESM package smoke check',
)

runNodeCheck(
  [],
  `
const specifiers = ${JSON.stringify(specifiers)}
for (const specifier of specifiers) {
  require(specifier)
}
console.log('cjs package smoke ok')
process.exit(0)
`,
  'CommonJS package smoke check',
)

process.stdout.write('Package contract check passed.\n')
