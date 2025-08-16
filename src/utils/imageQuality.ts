/**
 * Image quality utilities: PSNR, SSIM, and difference heatmap (browser only)
 */

export interface QualityOptions {
  /** Max dimension to downscale for analysis to speed up (e.g., 512 or 1024) */
  maxDimension?: number
}

export interface QualityResult {
  ssim: number
  psnr: number
  heatmap?: Blob
}

/** Load an image source (blob or URL) into a canvas with optional downscale */
async function loadToCanvas(
  src: Blob | string,
  maxDimension = 512,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData }> {
  const img = await loadImage(src)
  const { width, height } = downscaleDims(img.width, img.height, maxDimension)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // Use imageSmoothing for downscale quality
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img as any, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  // Cleanup ImageBitmap if used
  if ('close' in (img as any) && typeof (img as any).close === 'function') {
    try {
      ;(img as any).close()
    } catch {}
  }
  return { canvas, ctx, imageData }
}

async function loadImage(src: Blob | string): Promise<ImageBitmap | HTMLImageElement> {
  try {
    if (typeof createImageBitmap === 'function') {
      const blob = typeof src === 'string' ? await fetch(src).then((r) => r.blob()) : src
      return await createImageBitmap(blob)
    }
  } catch {}

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    if (typeof src === 'string') img.src = src
    else img.src = URL.createObjectURL(src)
  })
}

function downscaleDims(w: number, h: number, maxDimension: number) {
  if (!maxDimension || (w <= maxDimension && h <= maxDimension)) return { width: w, height: h }
  const scale = Math.min(maxDimension / w, maxDimension / h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** Convert RGBA ImageData to grayscale luma array (Float64) */
function toLumaArray(img: ImageData): Float64Array {
  const { data, width, height } = img
  const n = width * height
  const Y = new Float64Array(n)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // BT.601 luma
    Y[p] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return Y
}

/** PSNR on grayscale luma */
export function computePSNR(original: ImageData, compressed: ImageData): number {
  const w = Math.min(original.width, compressed.width)
  const h = Math.min(original.height, compressed.height)
  const a = cropImageData(original, w, h)
  const b = cropImageData(compressed, w, h)
  const A = toLumaArray(a)
  const B = toLumaArray(b)
  let mse = 0
  for (let i = 0; i < A.length; i++) {
    const d = A[i] - B[i]
    mse += d * d
  }
  mse /= A.length
  if (mse === 0) return Infinity
  const MAX = 255
  const psnr = 10 * Math.log10((MAX * MAX) / mse)
  return psnr
}

/** Simplified global SSIM (not windowed) on grayscale luma */
export function computeSSIM(original: ImageData, compressed: ImageData): number {
  const w = Math.min(original.width, compressed.width)
  const h = Math.min(original.height, compressed.height)
  const a = cropImageData(original, w, h)
  const b = cropImageData(compressed, w, h)
  const A = toLumaArray(a)
  const B = toLumaArray(b)

  const n = A.length
  let muA = 0,
    muB = 0
  for (let i = 0; i < n; i++) {
    muA += A[i]
    muB += B[i]
  }
  muA /= n
  muB /= n

  let sigmaA2 = 0,
    sigmaB2 = 0,
    sigmaAB = 0
  for (let i = 0; i < n; i++) {
    const da = A[i] - muA
    const db = B[i] - muB
    sigmaA2 += da * da
    sigmaB2 += db * db
    sigmaAB += da * db
  }
  sigmaA2 /= n - 1
  sigmaB2 /= n - 1
  sigmaAB /= n - 1

  const L = 255
  const k1 = 0.01
  const k2 = 0.03
  const C1 = (k1 * L) ** 2
  const C2 = (k2 * L) ** 2

  const numerator = (2 * muA * muB + C1) * (2 * sigmaAB + C2)
  const denominator = (muA * muA + muB * muB + C1) * (sigmaA2 + sigmaB2 + C2)
  let ssim = numerator / (denominator || 1)
  if (!Number.isFinite(ssim)) ssim = 0
  return Math.max(-1, Math.min(1, ssim))
}

function cropImageData(img: ImageData, w: number, h: number): ImageData {
  if (img.width === w && img.height === h) return img
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.putImageData(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

/** Generate a difference heatmap PNG blob where hotter colors indicate larger per-pixel differences */
export async function generateDifferenceHeatmap(
  original: ImageData,
  compressed: ImageData,
): Promise<Blob> {
  const w = Math.min(original.width, compressed.width)
  const h = Math.min(original.height, compressed.height)
  const a = cropImageData(original, w, h)
  const b = cropImageData(compressed, w, h)
  const A = toLumaArray(a)
  const B = toLumaArray(b)

  const heat = new Uint8ClampedArray(w * h * 4)
  let maxDiff = 1
  for (let i = 0; i < A.length; i++) {
    const d = Math.abs(A[i] - B[i])
    if (d > maxDiff) maxDiff = d
  }
  maxDiff = Math.max(1, maxDiff)

  for (let i = 0; i < A.length; i++) {
    const norm = Math.abs(A[i] - B[i]) / maxDiff // 0..1
    const [r, g, bl] = colormapTurbo(norm)
    const o = i * 4
    heat[o] = r
    heat[o + 1] = g
    heat[o + 2] = bl
    heat[o + 3] = 255
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(heat, w, h), 0, 0)
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/png'),
  )
  return blob
}

// Google Turbo colormap approximation (returns [r,g,b])
function colormapTurbo(x: number): [number, number, number] {
  x = Math.min(1, Math.max(0, x))
  const r = Math.round(
    255 * (0.13572 + 4.61539 * x - 42.6609 * x ** 2 + 132.131 * x ** 3 - 152.942 * x ** 4 + 59.2866 * x ** 5),
  )
  const g = Math.round(
    255 * (0.091402 + 2.194 * x + 4.84274 * x ** 2 - 27.278 * x ** 3 + 44.3536 * x ** 4 - 22.1643 * x ** 5),
  )
  const b = Math.round(
    255 * (0.106673 + 0.628 * x + 1.44467 * x ** 2 - 6.42 * x ** 3 + 7.7133 * x ** 4 - 2.79586 * x ** 5),
  )
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ]
}

/** High-level helper: assess SSIM/PSNR and optional heatmap from two sources */
export async function assessQuality(
  originalSrc: Blob | string,
  compressedSrc: Blob | string,
  options: QualityOptions = {},
): Promise<QualityResult> {
  const maxDimension = options.maxDimension ?? 512
  const { imageData: a } = await loadToCanvas(originalSrc, maxDimension)
  const { imageData: b } = await loadToCanvas(compressedSrc, maxDimension)
  const ssim = computeSSIM(a, b)
  const psnr = computePSNR(a, b)
  const heatmap = await generateDifferenceHeatmap(a, b)
  return { ssim, psnr, heatmap }
}
