import { convertImage } from './conversion'
import type {
  CompressionOutputDecision,
  CompressionOutputDecisionCandidate,
  CompressionOutputFormat,
  CompressionOutputTarget,
} from './types'

interface ResolveCompressionOutputOptions {
  output?: CompressionOutputFormat
  quality?: number
  preserveExif?: boolean
  selectedTool?: string
}

interface ResolveCompressionOutputResult {
  blob: Blob
  decision?: CompressionOutputDecision
}

const MIME_TO_OUTPUT_FORMAT: Record<string, CompressionOutputTarget> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function getOutputFormatFromMime(
  mimeType?: string,
): CompressionOutputTarget | null {
  if (!mimeType) {
    return null
  }

  return MIME_TO_OUTPUT_FORMAT[mimeType.toLowerCase()] ?? null
}

function isGifSource(file: File): boolean {
  return /image\/gif/i.test(file.type)
}

function needsAlphaSafeAutoCandidates(file: File): boolean {
  return /image\/(png|webp)/i.test(file.type)
}

function getAutoCandidates(file: File): CompressionOutputTarget[] {
  return needsAlphaSafeAutoCandidates(file)
    ? ['png', 'webp']
    : ['jpeg', 'webp', 'png']
}

function createDecision(
  requested: CompressionOutputFormat,
  selected: CompressionOutputDecision['selected'],
  selectedTool: string | undefined,
  usedFallback: boolean,
  candidates: CompressionOutputDecisionCandidate[],
  rejectedReasons: string[],
): CompressionOutputDecision {
  return {
    requested,
    selected,
    selectedTool,
    usedFallback,
    candidates,
    rejectedReasons,
  }
}

export async function resolveCompressionOutput(
  sourceFile: File,
  compressedBlob: Blob,
  options: ResolveCompressionOutputOptions,
): Promise<ResolveCompressionOutputResult> {
  const requestedOutput = options.output ?? 'preserve'
  if (requestedOutput === 'preserve') {
    return { blob: compressedBlob }
  }

  const currentFormat = getOutputFormatFromMime(compressedBlob.type)

  if (isGifSource(sourceFile)) {
    if (requestedOutput === 'auto') {
      return {
        blob: compressedBlob,
        decision: createDecision(
          requestedOutput,
          'preserve',
          options.selectedTool,
          true,
          [],
          ['gif-source-output-conversion-is-not-supported'],
        ),
      }
    }

    throw new Error(
      'Output format conversion is not supported for GIF sources in compress APIs.',
    )
  }

  if (options.preserveExif) {
    if (requestedOutput === 'auto') {
      if (currentFormat) {
        return {
          blob: compressedBlob,
          decision: createDecision(
            requestedOutput,
            currentFormat,
            options.selectedTool,
            false,
            [
              {
                format: currentFormat,
                size: compressedBlob.size,
                selected: true,
              },
            ],
            ['cross-format-output-disabled-when-preserveExif-is-enabled'],
          ),
        }
      }

      return {
        blob: compressedBlob,
        decision: createDecision(
          requestedOutput,
          'preserve',
          options.selectedTool,
          true,
          [],
          ['cross-format-output-disabled-when-preserveExif-is-enabled'],
        ),
      }
    }

    if (currentFormat === requestedOutput) {
      return {
        blob: compressedBlob,
        decision: createDecision(
          requestedOutput,
          requestedOutput,
          options.selectedTool,
          false,
          [
            {
              format: requestedOutput,
              size: compressedBlob.size,
              selected: true,
            },
          ],
          [],
        ),
      }
    }

    throw new Error(
      'Output format conversion is not supported when preserveExif is enabled.',
    )
  }

  if (
    requestedOutput !== 'auto' &&
    currentFormat &&
    currentFormat === requestedOutput
  ) {
    return {
      blob: compressedBlob,
      decision: createDecision(
        requestedOutput,
        requestedOutput,
        options.selectedTool,
        false,
        [
          {
            format: requestedOutput,
            size: compressedBlob.size,
            selected: true,
          },
        ],
        [],
      ),
    }
  }

  const requestedCandidates =
    requestedOutput === 'auto'
      ? getAutoCandidates(sourceFile)
      : [requestedOutput]
  const candidates: CompressionOutputDecisionCandidate[] = []
  const successfulCandidates: Array<{
    format: CompressionOutputTarget
    blob: Blob
    size: number
  }> = []

  if (currentFormat && requestedCandidates.includes(currentFormat)) {
    successfulCandidates.push({
      format: currentFormat,
      blob: compressedBlob,
      size: compressedBlob.size,
    })
  }

  for (const candidate of requestedCandidates) {
    if (candidate === currentFormat) {
      continue
    }

    try {
      const converted = await convertImage(compressedBlob, {
        targetFormat: candidate,
        quality: options.quality,
      })

      successfulCandidates.push({
        format: candidate,
        blob: converted.blob,
        size: converted.blob.size,
      })
    } catch (error) {
      candidates.push({
        format: candidate,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (successfulCandidates.length === 0) {
    if (requestedOutput === 'auto') {
      return {
        blob: compressedBlob,
        decision: createDecision(
          requestedOutput,
          'preserve',
          options.selectedTool,
          true,
          candidates,
          candidates
            .filter((candidate) => candidate.reason)
            .map((candidate) => `${candidate.format}: ${candidate.reason}`),
        ),
      }
    }

    const failureReason = candidates[0]?.reason
    throw new Error(
      failureReason
        ? `Failed to convert compressed output to ${requestedOutput}: ${failureReason}`
        : `Failed to convert compressed output to ${requestedOutput}.`,
    )
  }

  const bestCandidate = successfulCandidates.reduce((best, current) =>
    current.size < best.size ? current : best,
  )

  const finalizedCandidates: CompressionOutputDecisionCandidate[] = [
    ...candidates,
    ...successfulCandidates.map((candidate) => ({
      format: candidate.format,
      size: candidate.size,
      selected: candidate.format === bestCandidate.format,
    })),
  ].sort((left, right) => left.format.localeCompare(right.format))

  return {
    blob: bestCandidate.blob,
    decision: createDecision(
      requestedOutput,
      bestCandidate.format,
      options.selectedTool,
      false,
      finalizedCandidates,
      finalizedCandidates
        .filter((candidate) => candidate.reason)
        .map((candidate) => `${candidate.format}: ${candidate.reason}`),
    ),
  }
}
