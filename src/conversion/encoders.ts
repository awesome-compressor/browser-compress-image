import type { TargetFormat, ImageConvertOptions } from './types'

// MIME type mapping
export const MIME_MAP: Record<TargetFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
}

// Convert file to ImageData using canvas (currently unused but may be needed later)
// async function fileToImageData(file: File): Promise<ImageData> {
//   return new Promise((resolve, reject) => {
//     const img = new Image()
//     const canvas = document.createElement('canvas')
//     const ctx = canvas.getContext('2d')

//     if (!ctx) {
//       reject(new Error('Canvas context not available'))
//       return
//     }

//     img.onload = () => {
//       canvas.width = img.width
//       canvas.height = img.height
//       ctx.drawImage(img, 0, 0)
//       const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
//       resolve(imageData)
//     }

//     img.onerror = () => reject(new Error('Failed to load image'))
//     img.src = URL.createObjectURL(file)
//   })
// }

// JSQuash encoder (simplified version)
export async function encodeWithJsquash(
  file: File,
  format: TargetFormat,
  quality?: number,
): Promise<Blob> {
  try {
    // For now, fallback to canvas encoding as JSQuash integration is complex
    // This can be enhanced later with proper JSQuash integration
    return await encodeWithCanvas(file, format, quality)
  } catch (error) {
    throw new Error(`JSQuash encoding fallback failed: ${error}`)
  }
}

// Canvas encoder (fallback)
export async function encodeWithCanvas(
  file: File,
  format: TargetFormat,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Canvas context not available'))
      return
    }

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      let mimeType: string
      let qualityParam: number | undefined

      switch (format) {
        case 'jpeg':
          mimeType = 'image/jpeg'
          qualityParam = quality || 0.8
          break
        case 'webp':
          mimeType = 'image/webp'
          qualityParam = quality || 0.8
          break
        case 'png':
          mimeType = 'image/png'
          break
        default:
          reject(new Error(`Canvas does not support ${format} encoding`))
          return
      }

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Canvas toBlob failed'))
          }
        },
        mimeType,
        qualityParam,
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// ICO encoder (simplified placeholder)
export async function encodeIcoFromImage(
  file: File,
  options?: ImageConvertOptions,
): Promise<Blob> {
  try {
    // Convert to PNG first
    const pngBlob = await encodeWithCanvas(file, 'png')

    // Create a simple ICO file structure (basic implementation)
    // Note: This is a simplified version. For production, use a proper ICO library
    const pngArray = new Uint8Array(await pngBlob.arrayBuffer())

    // ICO header: 6 bytes
    const icoHeader = new Uint8Array([
      0x00,
      0x00, // Reserved (must be 0)
      0x01,
      0x00, // Image type (1 = ICO)
      0x01,
      0x00, // Number of images (1)
    ])

    // ICO directory entry: 16 bytes
    const width = 256 // Use 0 for 256
    const height = 256 // Use 0 for 256
    const pngSize = pngArray.length

    const icoDirectory = new Uint8Array([
      width === 256 ? 0 : width, // Width (0 = 256)
      height === 256 ? 0 : height, // Height (0 = 256)
      0x00, // Color count (0 = no palette)
      0x00, // Reserved (must be 0)
      0x01,
      0x00, // Color planes (1)
      0x20,
      0x00, // Bits per pixel (32)
      pngSize & 0xff,
      (pngSize >> 8) & 0xff, // Image size (low bytes)
      (pngSize >> 16) & 0xff,
      (pngSize >> 24) & 0xff, // Image size (high bytes)
      0x16,
      0x00,
      0x00,
      0x00, // Offset to image data (22 bytes)
    ])

    const icoBlob = new Blob([icoHeader, icoDirectory, pngArray], {
      type: 'image/x-icon',
    })

    return icoBlob
  } catch (error) {
    // Use logger if available at runtime (import not desirable in this helper)
    try {
      // dynamic import to avoid circular deps in some environments
      const logger = await import('../utils/logger').then((m) => m.default)
      logger.error('ICO encoding failed:', error)
    } catch (e) {
      /* ignore */
    }
    throw new Error(
      `ICO encoding failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
