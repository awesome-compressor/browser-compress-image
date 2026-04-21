import { compress } from '../compress'
import type { CompressOptions } from '../types'
import { convertImage, type ImageConvertOptions } from '../conversion'
import type { CompressResultType } from '../types'
import {
  assessQuality,
  type QualityOptions,
  type QualityResult,
} from '../utils/imageQuality'

export interface ConversionCompareItemMeta {
  flow: 'C→T' | 'T' | 'T→C' // 压缩→转换 | 仅转换 | 转换→压缩
  tool?: string // 压缩工具名（若有）
  compressOptions?: any
  convertOptions: ImageConvertOptions
}

export interface ConversionCompareItem {
  meta: ConversionCompareItemMeta
  blob?: Blob
  success: boolean
  error?: string
  size?: number
  compressionRatio?: number // 相对"原图"
  evaluationRatio?: number // 相对评估基线
  evaluationLabel?: string
  qualityMetrics?: QualityResult
  duration?: number
}

export interface ConversionEvaluationOptions extends QualityOptions {
  baseline?: Blob | File
  label?: string
  includeQualityMetrics?: boolean
}

export interface BuildConversionColumnInput {
  file: File
  compressOptions?: CompressOptions & { returnAllResults: true }
  convertOptions: ImageConvertOptions
  evaluation?: ConversionEvaluationOptions
}

export interface ConversionColumnResult {
  title: string // 如 "Format: webp"
  items: ConversionCompareItem[]
}

interface ConversionEvaluationContext {
  baseline: Blob | File
  label: string
  includeQualityMetrics: boolean
  maxDimension?: number
  includeHeatmap?: boolean
}

function getEvaluationContext(
  input: BuildConversionColumnInput,
): ConversionEvaluationContext {
  return {
    baseline: input.evaluation?.baseline || input.file,
    label:
      input.evaluation?.label ||
      (input.evaluation?.baseline ? 'baseline' : 'original'),
    includeQualityMetrics: input.evaluation?.includeQualityMetrics || false,
    maxDimension: input.evaluation?.maxDimension,
    includeHeatmap: input.evaluation?.includeHeatmap,
  }
}

async function finalizeEvaluation(
  item: ConversionCompareItem,
  file: File,
  evaluation: ConversionEvaluationContext,
): Promise<ConversionCompareItem> {
  if (!item.success || !item.blob || typeof item.size !== 'number') {
    return item
  }

  const nextItem: ConversionCompareItem = {
    ...item,
    compressionRatio: ((file.size - item.size) / file.size) * 100,
    evaluationRatio:
      ((evaluation.baseline.size - item.size) / evaluation.baseline.size) * 100,
    evaluationLabel: evaluation.label,
  }

  if (!evaluation.includeQualityMetrics) {
    return nextItem
  }

  return {
    ...nextItem,
    qualityMetrics: await assessQuality(evaluation.baseline, item.blob, {
      maxDimension: evaluation.maxDimension,
      includeHeatmap: evaluation.includeHeatmap,
    }),
  }
}

// Helper function to get tools for target format (currently unused)
// function getToolsForFormat(targetFormat: string): string[] {
//   const formatTools: Record<string, string[]> = {
//     png: ['jsquash', 'browser-image-compression', 'canvas', 'compressorjs'],
//     jpeg: ['jsquash', 'compressorjs', 'canvas', 'browser-image-compression'],
//     webp: ['jsquash', 'canvas', 'browser-image-compression', 'compressorjs'],
//     ico: ['canvas'] // ICO typically converted from PNG
//   }

//   return formatTools[targetFormat] || ['jsquash', 'canvas', 'browser-image-compression']
// }

// C→T flow: compress then convert
export async function buildConversionColumn(
  input: BuildConversionColumnInput,
): Promise<ConversionColumnResult> {
  const { file, compressOptions, convertOptions } = input
  const { targetFormat } = convertOptions
  const evaluation = getEvaluationContext(input)

  const items: ConversionCompareItem[] = []

  try {
    const promises: Promise<ConversionCompareItem | ConversionCompareItem[]>[] =
      []

    // C→T: Compress then convert (only if compressOptions provided)
    if (compressOptions) {
      const cToTPromise = (async () => {
        const compressResults = await compress(file, {
          ...compressOptions,
          returnAllResults: true,
          type: 'blob' as CompressResultType,
        })

        return Promise.all(
          compressResults.allResults
            .filter((result) => result.success)
            .map(async (result) => {
              try {
                const convertResult = await convertImage(
                  result.result as Blob,
                  convertOptions,
                )

                return finalizeEvaluation(
                  {
                    meta: {
                      flow: 'C→T' as const,
                      tool: result.tool,
                      compressOptions,
                      convertOptions,
                    },
                    blob: convertResult.blob,
                    success: true,
                    size: convertResult.blob.size,
                    duration: result.duration + convertResult.duration,
                  },
                  file,
                  evaluation,
                )
              } catch (error) {
                return {
                  meta: {
                    flow: 'C→T' as const,
                    tool: result.tool,
                    compressOptions,
                    convertOptions,
                  },
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  duration: result.duration,
                } as ConversionCompareItem
              }
            }),
        )
      })()

      promises.push(cToTPromise)
    }

    // T: Convert original file only
    promises.push(
      (async () => {
        const startTime = performance.now()

        try {
          const convertResult = await convertImage(file, convertOptions)
          const duration = performance.now() - startTime

          return finalizeEvaluation(
            {
              meta: {
                flow: 'T' as const,
                convertOptions,
              },
              blob: convertResult.blob,
              success: true,
              size: convertResult.blob.size,
              duration,
            },
            file,
            evaluation,
          )
        } catch (error) {
          const duration = performance.now() - startTime

          return {
            meta: {
              flow: 'T' as const,
              convertOptions,
            },
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration,
          } as ConversionCompareItem
        }
      })(),
    )

    // T→C: Convert then compress (only if compressOptions provided)
    if (compressOptions) {
      promises.push(
        (async () => {
          const startTime = performance.now()

          try {
            // First convert
            const convertResult = await convertImage(file, convertOptions)

            // Then compress with tools suitable for target format
            const convertedFile = new File([convertResult.blob], file.name, {
              type: convertResult.mime,
            })

            const compressResultsAfterConvert = await compress(convertedFile, {
              ...compressOptions,
              returnAllResults: true,
              type: 'blob' as CompressResultType,
            })

            const successfulResults =
              compressResultsAfterConvert.allResults.filter(
                (result) => result.success,
              )

            if (successfulResults.length === 0) {
              const firstError = compressResultsAfterConvert.allResults.find(
                (result) => result.error,
              )
              throw new Error(
                firstError?.error || 'All compression attempts failed',
              )
            }

            const bestResult = successfulResults.reduce((best, current) =>
              current.compressedSize < best.compressedSize ? current : best,
            )

            const totalDuration = performance.now() - startTime

            return finalizeEvaluation(
              {
                meta: {
                  flow: 'T→C' as const,
                  tool: bestResult.tool,
                  compressOptions,
                  convertOptions,
                },
                blob: bestResult.result as Blob,
                success: true,
                size: bestResult.compressedSize,
                duration: totalDuration,
              },
              file,
              evaluation,
            )
          } catch (error) {
            const duration = performance.now() - startTime

            return {
              meta: {
                flow: 'T→C' as const,
                convertOptions,
              },
              success: false,
              error: error instanceof Error ? error.message : String(error),
              duration,
            } as ConversionCompareItem
          }
        })(),
      )
    }

    // Wait for all flows to complete
    const results = await Promise.all(promises)

    // Flatten results (some might be arrays from C→T flow)
    for (const result of results) {
      if (Array.isArray(result)) {
        items.push(...result)
      } else {
        items.push(result)
      }
    }
  } catch (error) {
    // If overall process fails, add error item
    items.push({
      meta: {
        flow: 'T' as const,
        convertOptions,
      },
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    title: `Format: ${targetFormat}`,
    items,
  }
}
