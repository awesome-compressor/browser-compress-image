import { ensureWasmLoaded, importJsquashModule } from '../tools/compressWithJsquash'
import type { TargetFormat, ImageConvertOptions } from './types'

// MIME type mapping
const MIME_MAP: Record<TargetFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon'
}

// Convert file to ImageData using canvas
async function fileToImageData(file: File): Promise<ImageData> {
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
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(imageData)
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// JSQuash encoder
async function encodeWithJsquash(
  file: File,
  format: TargetFormat,
  quality?: number
): Promise<Blob> {
  try {
    await ensureWasmLoaded(format)
    const jsquashModule = await importJsquashModule(format)
    const imageData = await fileToImageData(file)

    let compressedBuffer: ArrayBuffer
    
    if (format === 'png') {
      compressedBuffer = await jsquashModule.encode(imageData)
    } else {
      compressedBuffer = await jsquashModule.encode(imageData, {
        quality: Math.round((quality || 0.8) * 100)
      })
    }

    return new Blob([compressedBuffer], { type: MIME_MAP[format] })
  } catch (error) {
    console.error(`JSQuash ${format} encoding failed:`, error)
    throw new Error(`Failed to encode ${format} with JSQuash: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Canvas encoder (fallback)
async function encodeWithCanvas(
  file: File,
  format: TargetFormat,
  quality?: number
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
          qualityParam = quality
          break
        case 'webp':
          mimeType = 'image/webp'
          qualityParam = quality
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
        qualityParam
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// ICO encoder (placeholder - will need proper implementation)
async function encodeIcoFromImage(
  file: File,
  options?: ImageConvertOptions
): Promise<Blob> {
  // For now, convert to PNG and return as ICO placeholder
  // This will need proper ICO encoding implementation
  try {
    const pngBlob = await encodeWithJsquash(file, 'png')
    // Create a simple ICO file structure (placeholder)
    const icoHeader = new Uint8Array([
      0x00, 0x00, // Reserved
      0x01, 0x00, // Image type (1 = ICO)
      0x01, 0x00  // Number of images
    ])
    
    const pngArray = await pngBlob.arrayBuffer()
    const icoBlob = new Blob([icoHeader, pngArray], { type: 'image/x-icon' })
    
    return icoBlob
  } catch (error) {
    console.error('ICO encoding failed:', error)
    throw new Error('ICO encoding not yet implemented. Please install icojs for proper ICO support.')
  }
}

export {
  MIME_MAP,
  encodeWithJsquash,
  encodeWithCanvas,
  encodeIcoFromImage
}