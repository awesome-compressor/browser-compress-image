import type {
  CompressionGoal,
  CompressionObjective,
  CompressionObjectiveCandidate,
  CompressionObjectiveDecision,
  CompressionOutputDecision,
} from './types'

interface ObjectiveSearchResult<T> {
  compressedSize: number
  bestTool?: string
  blob: Blob
  outputDecision?: CompressionOutputDecision
  result: T
}

interface SearchObjectiveCompressionInput<T> {
  objective: CompressionObjective
  runCandidate: (quality: number) => Promise<ObjectiveSearchResult<T>>
}

interface SearchObjectiveCompressionResult<T> {
  decision: CompressionObjectiveDecision
  selectedQuality: number
  selected: ObjectiveSearchResult<T>
}

function getQualitySequence(goal: CompressionGoal): number[] {
  switch (goal) {
    case 'fastest':
      return [0.72, 0.56, 0.4, 0.28]
    case 'visually-lossless':
      return [0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6]
    case 'balanced':
    default:
      return [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34]
  }
}

function normalizeGoal(goal?: CompressionGoal): CompressionGoal {
  return goal || 'balanced'
}

function resolveSelectedOutput(
  blob: Blob,
  outputDecision?: CompressionOutputDecision,
): string | undefined {
  if (outputDecision?.selected && outputDecision.selected !== 'preserve') {
    return outputDecision.selected
  }

  return blob.type || undefined
}

export async function searchObjectiveCompression<T>(
  input: SearchObjectiveCompressionInput<T>,
): Promise<SearchObjectiveCompressionResult<T>> {
  const { objective, runCandidate } = input

  if (!Number.isFinite(objective.targetBytes) || objective.targetBytes <= 0) {
    throw new Error('objective.targetBytes must be a positive number.')
  }

  const goal = normalizeGoal(objective.goal)
  const qualities = getQualitySequence(goal)
  const candidates: CompressionObjectiveCandidate[] = []
  const rejectedReasons: string[] = []

  let fallback: {
    quality: number
    result: ObjectiveSearchResult<T>
  } | null = null

  for (const quality of qualities) {
    const result = await runCandidate(quality)
    const passed = result.compressedSize <= objective.targetBytes

    candidates.push({
      quality,
      compressedSize: result.compressedSize,
      passed,
      selectedTool: result.bestTool,
      selectedOutput: resolveSelectedOutput(result.blob, result.outputDecision),
    })

    if (!fallback || result.compressedSize < fallback.result.compressedSize) {
      fallback = {
        quality,
        result,
      }
    }

    if (!passed) {
      rejectedReasons.push(
        `quality=${quality} exceeded targetBytes by ${result.compressedSize - objective.targetBytes} bytes`,
      )
      continue
    }

    return {
      selectedQuality: quality,
      selected: result,
      decision: {
        goal,
        targetBytes: objective.targetBytes,
        selectedQuality: quality,
        selectedTool: result.bestTool,
        selectedOutput: resolveSelectedOutput(
          result.blob,
          result.outputDecision,
        ),
        candidatesEvaluated: candidates.length,
        usedFallback: false,
        candidates,
        rejectedReasons,
      },
    }
  }

  if (!fallback) {
    throw new Error('objective compression search produced no candidates.')
  }

  return {
    selectedQuality: fallback.quality,
    selected: fallback.result,
    decision: {
      goal,
      targetBytes: objective.targetBytes,
      selectedQuality: fallback.quality,
      selectedTool: fallback.result.bestTool,
      selectedOutput: resolveSelectedOutput(
        fallback.result.blob,
        fallback.result.outputDecision,
      ),
      candidatesEvaluated: candidates.length,
      usedFallback: true,
      candidates,
      rejectedReasons,
    },
  }
}
