import type { OutputType } from '../types'
import logger from '../utils/logger'

// Track WASM module initialization promises to avoid duplicate loading
const wasmLoadPromises = new Map<OutputType, Promise<void>>()

// WASM文件配置
interface WasmConfig {
  baseUrl?: string // 本地WASM文件的基础URL
  useLocal?: boolean // 是否优先使用本地WASM文件
}

// 默认配置
let wasmConfig: WasmConfig = {
  baseUrl: '/wasm/', // 默认本地WASM文件路径
  useLocal: false,
}

// 配置WASM加载选项
export function configureWasmLoading(config: WasmConfig): void {
  wasmConfig = { ...wasmConfig, ...config }
}

// WASM文件映射
const wasmFiles: Record<OutputType, string> = {
  avif: 'squoosh_avif_bg.wasm',
  jpeg: 'mozjpeg_bg.wasm',
  jxl: 'jxl_bg.wasm',
  png: 'squoosh_png_bg.wasm',
  webp: 'squoosh_webp_bg.wasm',
}

// 检测WASM支持
export function isWebAssemblySupported(): boolean {
  return (
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function'
  )
}

// 检测是否在浏览器环境
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

// 检测是否在 Vitest 环境中（用于在测试时静默短路）
function isVitest(): boolean {
  try {
    // Vitest 会在 globalThis 上设置 __vitest__ 标记
    return typeof (globalThis as any).__vitest__ !== 'undefined'
  } catch (e) {
    return false
  }
}

// 动态导入JSQuash模块
async function importJsquashModule(format: OutputType): Promise<any> {
  if (!isBrowser()) {
    // 在Node.js环境中，直接抛出错误，让系统回退到其他工具
    throw new Error(
      `JSQuash not supported in Node.js environment for ${format}`,
    )
  }

  // 在浏览器环境中，直接使用CDN导入
  try {
    const cdnUrl = `https://unpkg.com/@jsquash/${format}@latest?module`
    return await import(/* @vite-ignore */ cdnUrl)
  } catch (cdnError) {
    logger.error(`CDN import failed for ${format}:`, cdnError)
    throw cdnError
  }
}

// 确保WASM模块加载
export async function ensureWasmLoaded(format: OutputType): Promise<void> {
  // 如果已经有加载Promise，直接返回它（避免重复加载）
  if (wasmLoadPromises.has(format)) {
    return wasmLoadPromises.get(format)!
  }

  // 创建加载Promise并缓存
  const loadPromise = (async () => {
    try {
      // 如果配置为使用本地WASM文件，先尝试本地加载
      if (wasmConfig.useLocal) {
        try {
          await loadLocalWasm(format)
          return
        } catch (localError) {
          logger.warn(
            `Local WASM loading failed for ${format}, falling back to CDN:`,
            localError,
          )
        }
      }

      // 回退到动态导入
      await importJsquashModule(format)
    } catch (error) {
      // 如果加载失败，从缓存中移除Promise，允许重试
      wasmLoadPromises.delete(format)

      // 检查是否是WASM加载错误
      if (error instanceof Error && error.message.includes('magic word')) {
        logger.error(
          `WASM loading failed for ${format}: Invalid WASM file or CDN issue`,
          error,
        )
        throw new Error(
          `Failed to load ${format} WASM module. This might be due to network issues or CDN problems.`,
        )
      }

      logger.error(`Failed to initialize WASM for ${format}:`, error)

      throw new Error(
        `Failed to initialize ${format} support: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })()

  wasmLoadPromises.set(format, loadPromise)
  return loadPromise
}

// 诊断JSQuash可用性
export async function diagnoseJsquashAvailability(): Promise<{
  wasmSupported: boolean
  availableFormats: OutputType[]
  errors: { format: OutputType; error: string }[]
}> {
  const result = {
    wasmSupported: isWebAssemblySupported(),
    availableFormats: [] as OutputType[],
    errors: [] as { format: OutputType; error: string }[],
  }

  if (!result.wasmSupported) {
    return result
  }

  const formats: OutputType[] = ['avif', 'jpeg', 'jxl', 'png', 'webp']

  for (const format of formats) {
    try {
      await ensureWasmLoaded(format)
      result.availableFormats.push(format)
    } catch (error) {
      result.errors.push({
        format,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

// 下载WASM文件到本地的工具函数
export async function downloadWasmFiles(
  formats: OutputType[] = ['avif', 'jpeg', 'jxl', 'png', 'webp'],
  targetDir: string = '/wasm/',
): Promise<{ format: OutputType; success: boolean; error?: string }[]> {
  const results: { format: OutputType; success: boolean; error?: string }[] = []

  for (const format of formats) {
    try {
      // 获取对应的JSQuash包的WASM文件URL
      const packageName = `@jsquash/${format}`
      const wasmFileName = wasmFiles[format]

      // 尝试从unpkg CDN获取WASM文件
      const cdnUrl = `https://unpkg.com/${packageName}/codec/${wasmFileName}`

      logger.log(`正在下载 ${format} WASM 文件: ${cdnUrl}`)

      const response = await fetch(cdnUrl)
      if (!response.ok) {
        throw new Error(
          `Failed to fetch: ${response.status} ${response.statusText}`,
        )
      }

      const wasmBytes = await response.arrayBuffer()

      // 验证WASM文件
      const magic = new Uint8Array(wasmBytes.slice(0, 4))
      if (
        magic[0] !== 0x00 ||
        magic[1] !== 0x61 ||
        magic[2] !== 0x73 ||
        magic[3] !== 0x6d
      ) {
        throw new Error('Invalid WASM file format')
      }

      // 创建下载链接
      const blob = new Blob([wasmBytes], { type: 'application/wasm' })
      const url = URL.createObjectURL(blob)

      // 触发下载
      const a = document.createElement('a')
      a.href = url
      a.download = `${format}_${wasmFileName}`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      results.push({ format, success: true })
      logger.log(`✅ ${format} WASM 文件下载成功`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      results.push({ format, success: false, error: errorMsg })
      logger.error(`❌ ${format} WASM 文件下载失败:`, errorMsg)
    }
  }

  return results
}

// 简化的本地WASM加载（使用Service Worker缓存策略）
async function loadLocalWasm(format: OutputType): Promise<void> {
  // 检查是否有Service Worker支持
  if ('serviceWorker' in navigator) {
    // 尝试通过Service Worker缓存的方式加载
    const cacheName = 'jsquash-wasm-cache'
    const wasmFileName = wasmFiles[format]
    const localUrl = `${wasmConfig.baseUrl}${wasmFileName}`

    try {
      // 检查缓存中是否有WASM文件
      const cache = await caches.open(cacheName)
      const cachedResponse = await cache.match(localUrl)

      if (cachedResponse) {
        logger.log(`从缓存加载 ${format} WASM 文件`)
        // 这里简化处理，实际应该初始化WASM模块
        return
      }
    } catch (error) {
      logger.warn('Cache API not available:', error)
    }
  }

  // 回退：直接尝试从本地路径加载
  const localUrl = `${wasmConfig.baseUrl}${wasmFiles[format]}`
  const response = await fetch(localUrl)

  if (!response.ok) {
    throw new Error(`Local WASM file not found: ${localUrl}`)
  }

  const wasmBytes = await response.arrayBuffer()

  // 简单验证
  const magic = new Uint8Array(wasmBytes.slice(0, 4))
  if (
    magic[0] !== 0x00 ||
    magic[1] !== 0x61 ||
    magic[2] !== 0x73 ||
    magic[3] !== 0x6d
  ) {
    throw new Error(`Invalid local WASM file: ${localUrl}`)
  }

  logger.log(`✅ 本地 ${format} WASM 文件验证成功`)
}

// 获取文件类型对应的输出格式
function getOutputFormat(fileType: string): OutputType {
  if (fileType.includes('png')) return 'png'
  if (fileType.includes('webp')) return 'webp'
  if (fileType.includes('avif')) return 'avif'
  if (fileType.includes('jxl')) return 'jxl'
  // 默认使用 jpeg 格式
  return 'jpeg'
}

// 从File读取ImageData
async function fileToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

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

// JSQuash 压缩工具
export default async function compressWithJsquash(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
  },
): Promise<Blob> {
  const { quality, targetWidth, targetHeight, maxWidth, maxHeight } = options

  // If not running in a browser, short-circuit and return the original file.
  // This avoids attempting to load WASM / DOM APIs in Node (e.g. during tests).
  if (!isBrowser()) {
    // 在测试环境中静默短路以避免噪声日志
    if (!isVitest()) {
      logger.warn(
        'JSQuash: non-browser environment detected; skipping WASM compression and returning original file',
      )
    }
    return file
  }

  // 确定输出格式
  const outputFormat = getOutputFormat(file.type)

  try {
    // 确保WASM模块已加载
    await ensureWasmLoaded(outputFormat)

    // 获取对应的JSQuash模块
    const jsquashModule = await importJsquashModule(outputFormat)

    // 将文件转换为ImageData
    const imageData = await fileToImageData(file)

    // 处理尺寸调整
    let processedImageData = imageData
    if (targetWidth || targetHeight || maxWidth || maxHeight) {
      processedImageData = await resizeImageData(
        imageData,
        targetWidth || maxWidth,
        targetHeight || maxHeight,
      )
    }

    // 根据格式进行压缩
    let compressedBuffer: ArrayBuffer

    switch (outputFormat) {
      case 'avif': {
        compressedBuffer = await jsquashModule.encode(processedImageData, {
          quality: Math.round(quality * 100),
        })
        break
      }
      case 'jpeg': {
        compressedBuffer = await jsquashModule.encode(processedImageData, {
          quality: Math.round(quality * 100),
        })
        break
      }
      case 'jxl': {
        compressedBuffer = await jsquashModule.encode(processedImageData, {
          quality: Math.round(quality * 100),
        })
        break
      }
      case 'png': {
        // PNG不支持quality参数，使用默认设置
        compressedBuffer = await jsquashModule.encode(processedImageData)
        break
      }
      case 'webp': {
        compressedBuffer = await jsquashModule.encode(processedImageData, {
          quality: Math.round(quality * 100),
        })
        break
      }
      default:
        throw new Error(`Unsupported output format: ${outputFormat}`)
    }

    // 创建适当的MIME类型
    const mimeType = `image/${outputFormat === 'jxl' ? 'jxl' : outputFormat}`
    const compressedBlob = new Blob([compressedBuffer], { type: mimeType })

    // 如果压缩后文件大于或接近原文件大小，返回原文件
    if (compressedBlob.size >= file.size * 0.98) {
      return file
    }

    return compressedBlob
  } catch (error) {
    logger.error('JSQuash compression failed:', error)
    // 压缩失败时返回原文件
    return file
  }
}

// 调整ImageData尺寸的辅助函数
async function resizeImageData(
  imageData: ImageData,
  targetWidth?: number,
  targetHeight?: number,
): Promise<ImageData> {
  if (!targetWidth && !targetHeight) {
    return imageData
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // 计算新尺寸
  const originalWidth = imageData.width
  const originalHeight = imageData.height

  let newWidth = targetWidth || originalWidth
  let newHeight = targetHeight || originalHeight

  // 如果只指定了一个维度，按比例计算另一个
  if (targetWidth && !targetHeight) {
    newHeight = Math.round((originalHeight * targetWidth) / originalWidth)
  } else if (targetHeight && !targetWidth) {
    newWidth = Math.round((originalWidth * targetHeight) / originalHeight)
  }

  // 创建临时画布来绘制原图
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')!
  tempCanvas.width = originalWidth
  tempCanvas.height = originalHeight
  tempCtx.putImageData(imageData, 0, 0)

  // 在新画布上绘制调整后的图像
  canvas.width = newWidth
  canvas.height = newHeight
  ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight)

  return ctx.getImageData(0, 0, newWidth, newHeight)
}
