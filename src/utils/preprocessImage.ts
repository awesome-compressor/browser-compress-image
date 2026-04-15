import { memoryManager } from './memoryManager'
import type { PreprocessOptions } from '../types'
import { resolveResizeDimensions } from './resize'

// Load a Blob/File/String into an HTMLImageElement
async function loadImage(src: Blob | File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    if (src instanceof Blob) {
      const url = URL.createObjectURL(src)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load image'))
      }
      img.src = url
    } else {
      img.src = src
    }
  })
}

export interface PreprocessInputMeta {
  width: number
  height: number
  mimeType: string
}

export interface PreprocessOutput {
  blob: Blob
  width: number
  height: number
  mimeType: string
}

export async function preprocessImage(
  src: Blob | File | string,
  options: PreprocessOptions,
): Promise<PreprocessOutput> {
  const img = await loadImage(src)
  const naturalW = img.naturalWidth
  const naturalH = img.naturalHeight

  // Resolve crop region in natural pixels
  const crop = options.crop ?? { x: 0, y: 0, width: naturalW, height: naturalH }
  const cropX = Math.max(0, Math.min(crop.x, naturalW))
  const cropY = Math.max(0, Math.min(crop.y, naturalH))
  const cropW = Math.max(1, Math.min(crop.width, naturalW - cropX))
  const cropH = Math.max(1, Math.min(crop.height, naturalH - cropY))

  const rotate = (((options.rotate ?? 0) % 360) + 360) % 360
  const flipH = !!options.flipHorizontal
  const flipV = !!options.flipVertical

  // Determine intermediate canvas size after rotation
  const rad = (rotate * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rotW = Math.abs(cropW * cos) + Math.abs(cropH * sin)
  const rotH = Math.abs(cropW * sin) + Math.abs(cropH * cos)

  // Final output size after resize
  const size = resolveResizeDimensions(
    Math.round(rotW),
    Math.round(rotH),
    options.resize,
  )
  const useCoverResize =
    options.resize?.fit === 'cover' &&
    !options.resize.targetWidth &&
    !options.resize.targetHeight &&
    !!options.resize.maxWidth &&
    !!options.resize.maxHeight

  // Create canvas
  const canvas = memoryManager.createManagedCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D context')

  canvas.width = size.width
  canvas.height = size.height

  // Draw pipeline: translate to center, apply rotation/flip, draw cropped image, then scale to fit output
  ctx.save()

  // Map output canvas to rotated crop space
  // We draw into an offscreen temp canvas first at rotated crop size, then draw scaled into final canvas for quality
  const temp = memoryManager.createManagedCanvas()
  const tctx = temp.getContext('2d')
  if (!tctx) throw new Error('Failed to get temp 2D context')
  temp.width = Math.round(rotW)
  temp.height = Math.round(rotH)

  // Clear
  tctx.clearRect(0, 0, temp.width, temp.height)
  tctx.save()
  // Move to center of temp and rotate/flip, then draw crop around center
  tctx.translate(temp.width / 2, temp.height / 2)
  if (rotate !== 0) tctx.rotate(rad)
  tctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  // After rotation, the source crop should be centered and drawn with its top-left at (-cropW/2, -cropH/2)
  tctx.drawImage(
    img,
    cropX,
    cropY,
    cropW,
    cropH,
    -cropW / 2,
    -cropH / 2,
    cropW,
    cropH,
  )
  tctx.restore()

  // Now scale temp into final canvas
  // Use drawImage for scaling; browsers apply good quality sampling
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (useCoverResize) {
    const scale = Math.max(
      canvas.width / temp.width,
      canvas.height / temp.height,
    )
    const drawWidth = temp.width * scale
    const drawHeight = temp.height * scale
    const drawX = (canvas.width - drawWidth) / 2
    const drawY = (canvas.height - drawHeight) / 2
    ctx.drawImage(temp, drawX, drawY, drawWidth, drawHeight)
  } else {
    ctx.drawImage(temp, 0, 0, canvas.width, canvas.height)
  }
  ctx.restore()

  const mime =
    options.outputType ||
    (src instanceof Blob ? src.type : 'image/png') ||
    'image/png'
  const quality = options.outputQuality

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to export canvas'))),
      mime,
      quality,
    )
  })

  const width = canvas.width
  const height = canvas.height

  // Cleanup temp canvas
  memoryManager.cleanupCanvasElement(temp)
  memoryManager.cleanupCanvasElement(canvas)

  return {
    blob,
    width,
    height,
    mimeType: blob.type,
  }
}

export default preprocessImage
