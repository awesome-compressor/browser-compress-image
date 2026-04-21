import { execFileSync } from 'node:child_process'
import process from 'node:process'

function parseArgs(argv) {
  const args = { base: undefined, head: undefined, files: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--base') {
      args.base = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--head') {
      args.head = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--files') {
      args.files = argv.slice(index + 1)
      break
    }
  }

  return args
}

function getChangedFiles({ base, head, files }) {
  if (files.length > 0) {
    return files
  }

  if (!base || !head) {
    return []
  }

  const output = execFileSync(
    'git',
    ['diff', '--name-only', `${base}...${head}`],
    {
      encoding: 'utf8',
    },
  )

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function checkboxChecked(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`- \\[[xX]\\] ${escapedLabel}`)
  return pattern.test(body)
}

const PUBLIC_CONTRACT_FILES = [
  'src/compress.ts',
  'src/compressWithTools.ts',
  'src/compressEnhanced.ts',
  'src/types.ts',
  'src/utils/abort.ts',
  'src/utils/compressionQueue.ts',
  'src/utils/compressionWorker.ts',
  'package.json',
]

function touchesPublicContractSurface(changedFiles) {
  return changedFiles.some((file) => PUBLIC_CONTRACT_FILES.includes(file))
}

function touchesSpecs(changedFiles) {
  return changedFiles.some((file) => file.startsWith('specs/'))
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const changedFiles = getChangedFiles(args)
const prBody = process.env.PR_BODY || ''

const publicBehaviorChecked = checkboxChecked(
  prBody,
  'This PR changes public behavior.',
)
const specSyncChecked = checkboxChecked(
  prBody,
  'I updated the relevant spec docs and capability data when public behavior changed.',
)

const specFilesChanged = touchesSpecs(changedFiles)
const publicSurfaceChanged = touchesPublicContractSurface(changedFiles)

if (publicBehaviorChecked && !specSyncChecked) {
  fail(
    'PR template indicates public behavior changed, but the spec-sync checkbox is not checked.',
  )
}

if (publicBehaviorChecked && !specFilesChanged) {
  fail(
    'PR template indicates public behavior changed, but no files under specs/ were updated.',
  )
}

if (publicSurfaceChanged && !specFilesChanged) {
  fail(
    [
      'This PR modifies public contract files but does not update specs/.',
      'Update the relevant contract under specs/ or narrow the code change.',
    ].join(' '),
  )
}

process.stdout.write('PR contract check passed.\n')
