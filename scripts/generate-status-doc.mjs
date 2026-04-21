import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import prettier from 'prettier'
import { parse } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const packageJsonPath = path.join(repoRoot, 'package.json')
const capabilitiesPath = path.join(repoRoot, 'specs', 'capabilities.yaml')
const statusDocPath = path.join(repoRoot, 'docs', 'status.md')

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => `\`${item}\``).join(', ')
  }

  if (value === true) return 'Yes'
  if (value === false) return 'No'

  const normalized =
    typeof value === 'string' ? value.replaceAll('-', ' ') : String(value)

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatNotes(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return '—'
  }

  return notes.join('<br>')
}

function renderApiTable(apis) {
  const rows = Object.entries(apis).map(([name, api]) => {
    return `| \`${name}\` | ${formatValue(api.maturity)} | ${api.summary} | ${formatNotes(api.notes)} |`
  })

  return [
    '| API | Maturity | Summary | Notes |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function renderToolTable(tools) {
  const rows = Object.entries(tools).map(([name, tool]) => {
    return [
      `| \`${name}\``,
      tool.label,
      formatValue(tool.maturity),
      formatValue(tool.inputFormats),
      formatValue(tool.outputFormats),
      formatValue(tool.preserveExif),
      formatValue(tool.browserOnly),
      formatValue(tool.requiresNetwork),
      formatValue(tool.workerSupport),
      `${formatNotes(tool.notes)} |`,
    ].join(' | ')
  })

  return [
    '| Tool | Label | Maturity | Input Formats | Output Formats | Preserve EXIF | Browser Only | Network | Worker | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function renderFormatTable(formats) {
  const rows = Object.entries(formats).map(([format, info]) => {
    const builtIn = formatValue(info.builtInTools)
    const optional =
      Array.isArray(info.optionalTools) && info.optionalTools.length > 0
        ? formatValue(info.optionalTools)
        : '—'

    return `| \`${format}\` | ${builtIn} | ${optional} |`
  })

  return [
    '| Format | Built-in Tools | Optional Tools |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function renderExportsTable(exportsField) {
  const rows = Object.entries(exportsField).map(([entry, config]) => {
    const resolvedConfig =
      typeof config === 'string'
        ? { types: '—', import: config, require: '—' }
        : config

    return `| \`${entry}\` | \`${resolvedConfig.types || '—'}\` | \`${resolvedConfig.import || '—'}\` | \`${resolvedConfig.require || '—'}\` |`
  })

  return [
    '| Export | Types | Import | Require |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function renderMaturityLevels(levels) {
  return Object.entries(levels)
    .map(([name, description]) => `- \`${name}\`: ${description}`)
    .join('\n')
}

function renderBehaviorSummary(behavior) {
  return [
    `- Built-in compression selection: \`${behavior.builtInCompressionSelection}\``,
    `- Built-in \`preserveExif\` allowlist: ${formatValue(behavior.builtInExifAllowlist)}`,
    `- \`compressEnhanced\` defaults: \`useQueue=${behavior.compressEnhancedDefaults.useQueue}\`, \`useWorker=${behavior.compressEnhancedDefaults.useWorker}\``,
    `- Worker semantics: \`${behavior.workerSemantics.mode}\` (${formatValue(behavior.workerSemantics.maturity)}), fallback \`${behavior.workerSemantics.fallback}\``,
  ].join('\n')
}

function renderStatusDoc(pkg, capabilities) {
  return `# Status

> Generated from \`specs/capabilities.yaml\` and \`package.json\`. Do not edit by hand. Run \`pnpm docs:generate\`.

## Package

- npm version: \`${pkg.version}\`
- package name: \`${pkg.name}\`
- module type: \`${pkg.type}\`

## Public API Maturity

${renderApiTable(capabilities.apis)}

## Compression Behavior

${renderBehaviorSummary(capabilities.behavior)}

## Entry Points

${renderExportsTable(pkg.exports)}

## Tool Capability Matrix

${renderToolTable(capabilities.tools)}

## Built-in Format Coverage

${renderFormatTable(capabilities.formats)}

## Maturity Labels

${renderMaturityLevels(capabilities.maturityLevels)}
`
}

async function main() {
  const [packageJsonRaw, capabilitiesRaw] = await Promise.all([
    fs.readFile(packageJsonPath, 'utf8'),
    fs.readFile(capabilitiesPath, 'utf8'),
  ])

  const pkg = JSON.parse(packageJsonRaw)
  const capabilities = parse(capabilitiesRaw)
  const prettierConfig = (await prettier.resolveConfig(statusDocPath)) || {}
  const nextDoc = await prettier.format(renderStatusDoc(pkg, capabilities), {
    ...prettierConfig,
    parser: 'markdown',
  })
  const checkOnly = process.argv.includes('--check')

  if (checkOnly) {
    const currentDoc = await fs.readFile(statusDocPath, 'utf8').catch(() => '')

    if (currentDoc !== nextDoc) {
      process.stderr.write(
        'docs/status.md is out of date. Run `pnpm docs:generate`.\n',
      )
      process.exitCode = 1
    }

    return
  }

  await fs.writeFile(statusDocPath, nextDoc)
}

await main()
