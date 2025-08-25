import { compress } from '../compress'
import type { CompressOptions } from '../types'
import { convertImage, type ImageConvertOptions } from '../conversion'
import type { CompressResultType } from '../types'

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
  duration?: number
}

export interface BuildConversionColumnInput {
  file: File
  compressOptions: CompressOptions & { returnAllResults: true }
  convertOptions: ImageConvertOptions
}

export interface ConversionColumnResult {
  title: string // 如 "Format: webp"
  items: ConversionCompareItem[]
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

  const items: ConversionCompareItem[] = []

  try {
    // Get all compression results
    const compressResults = await compress(file, {
      ...compressOptions,
      returnAllResults: true,
      type: 'blob' as CompressResultType,
    })

    // C→T: Convert each successful compression result
    const cToTPromises = compressResults.allResults
      .filter((result) => result.success)
      .map(async (result) => {
        try {
          const convertResult = await convertImage(
            result.result as Blob,
            convertOptions,
          )

          return {
            meta: {
              flow: 'C→T' as const,
              tool: result.tool,
              compressOptions,
              convertOptions,
            },
            blob: convertResult.blob,
            success: true,
            size: convertResult.blob.size,
            compressionRatio:
              ((file.size - convertResult.blob.size) / file.size) * 100,
            duration: result.duration + convertResult.duration,
          }
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
          }
        }
      })

    // T: Convert original file only
    const tPromise = (async () => {
      const startTime = performance.now()

      try {
        const convertResult = await convertImage(file, convertOptions)
        const duration = performance.now() - startTime

        return {
          meta: {
            flow: 'T' as const,
            convertOptions,
          },
          blob: convertResult.blob,
          success: true,
          size: convertResult.blob.size,
          compressionRatio:
            ((file.size - convertResult.blob.size) / file.size) * 100,
          duration,
        }
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
        }
      }
    })()

    // T→C: Convert then compress
    const tToCPromise = (async () => {
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

        const bestResult = compressResultsAfterConvert.allResults
          .filter((result) => result.success)
          .reduce(
            (best, current) =>
              current.compressedSize < best.compressedSize ? current : best,
            compressResultsAfterConvert.allResults[0],
          )

        const totalDuration = performance.now() - startTime

        return {
          meta: {
            flow: 'T→C' as const,
            tool: bestResult.tool,
            compressOptions,
            convertOptions,
          },
          blob: bestResult.result as Blob,
          success: true,
          size: bestResult.compressedSize,
          compressionRatio:
            ((file.size - bestResult.compressedSize) / file.size) * 100,
          duration: totalDuration,
        }
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
        }
      }
    })()

    // Wait for all flows to complete
    const [cToTResults, tResult, tToCResult] = await Promise.all([
      Promise.all(cToTPromises),
      tPromise,
      tToCPromise,
    ])

    items.push(...cToTResults, tResult, tToCResult)
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
