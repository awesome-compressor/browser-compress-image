import type { ImageConvertOptions, ImageConvertResult } from './types'
import {
  MIME_MAP,
  encodeWithJsquash,
  encodeWithCanvas,
  encodeIcoFromImage,
} from './encoders'
import logger from '../utils/logger'

export async function convertImage(
  fileOrBlob: File | Blob,
  options: ImageConvertOptions,
): Promise<ImageConvertResult> {
  const startTime = performance.now()

  try {
    // Convert Blob to File if needed
    const file =
      fileOrBlob instanceof File
        ? fileOrBlob
        : new File([fileOrBlob], 'image', { type: fileOrBlob.type })

    const { targetFormat, quality } = options

    let blob: Blob

    switch (targetFormat) {
      case 'png':
      case 'jpeg':
      case 'webp':
        try {
          // First try JSQuash for better quality
          blob = await encodeWithJsquash(file, targetFormat, quality)
        } catch (jsquashError) {
          logger.warn(
            `JSQuash failed for ${targetFormat}, falling back to Canvas:`,
            jsquashError,
          )
          // Fallback to Canvas
          blob = await encodeWithCanvas(file, targetFormat, quality)
        }
        break

      case 'ico':
        blob = await encodeIcoFromImage(file, options)
        break

      default:
        throw new Error(`Unsupported target format: ${targetFormat}`)
    }

    const duration = performance.now() - startTime

    return {
      blob,
      mime: MIME_MAP[targetFormat],
      duration,
    }
  } catch (error) {
    logger.error('Image conversion failed:', error)
    if (error instanceof Error) {
      throw new Error(`Image conversion failed: ${error.message}`)
    }

    throw new Error(`Image conversion failed: ${String(error)}`)
  }
}
