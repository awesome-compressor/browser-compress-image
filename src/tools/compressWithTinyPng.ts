import { LRUCache } from '../utils/lruCache'

// 缓存对象，用于存储文件的压缩结果（最多缓存50个文件）
const compressionCache = new LRUCache<string, Blob>(50)

// 生成文件的唯一标识符
function generateFileKey(file: File, options: any): string {
  // TinyPNG不支持质量调整，所以忽略quality参数
  // 只考虑文件内容、尺寸调整参数
  const relevantOptions = {
    targetWidth: options.targetWidth,
    targetHeight: options.targetHeight,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    mode: options.mode === 'keepQuality' ? options.mode : undefined, // 只有keepQuality模式下才考虑尺寸调整
  }

  // 使用文件名、大小、最后修改时间和相关选项生成key
  return `${file.name}_${file.size}_${file.lastModified}_${JSON.stringify(relevantOptions)}`
}

export function compressWithTinyPng(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
    key?: string
  },
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      // 生成缓存key
      const cacheKey = generateFileKey(file, options)

      // 检查缓存
      if (compressionCache.has(cacheKey)) {
        console.log('TinyPNG: Using cached result for file:', file.name)
        resolve(compressionCache.get(cacheKey)!)
        return
      }
      // 检查是否提供了 TinyPNG API 密钥
      const apiKey = options.key

      if (!apiKey) {
        throw new Error(
          'TinyPNG API key is required. Please set TINYPNG_API_KEY environment variable or window.TINYPNG_API_KEY',
        )
      }

      // 验证文件类型
      const supportedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ]
      if (!supportedTypes.includes(file.type)) {
        throw new Error(
          `Unsupported file type: ${file.type}. TinyPNG supports JPEG, PNG, and WebP images.`,
        )
      }

      // 步骤1: 上传图片到 TinyPNG 进行压缩
      const uploadResponse = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
          'Content-Type': file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(
          `TinyPNG upload failed: ${uploadResponse.status} - ${errorText}`,
        )
      }

      const uploadResult = await uploadResponse.json()
      const outputUrl = uploadResponse.headers.get('Location')

      if (!outputUrl) {
        throw new Error('No output URL received from TinyPNG')
      }

      // 如果需要调整尺寸，构建调整选项
      let resizeOptions: any = null
      if (
        options.mode === 'keepQuality' &&
        (options.targetWidth ||
          options.targetHeight ||
          options.maxWidth ||
          options.maxHeight)
      ) {
        resizeOptions = {}

        if (options.targetWidth && options.targetHeight) {
          resizeOptions.method = 'fit'
          resizeOptions.width = options.targetWidth
          resizeOptions.height = options.targetHeight
        } else if (options.maxWidth && options.maxHeight) {
          resizeOptions.method = 'scale'
          resizeOptions.width = options.maxWidth
          resizeOptions.height = options.maxHeight
        } else if (options.targetWidth) {
          resizeOptions.method = 'scale'
          resizeOptions.width = options.targetWidth
        } else if (options.targetHeight) {
          resizeOptions.method = 'scale'
          resizeOptions.height = options.targetHeight
        }
      }

      let finalUrl = outputUrl

      // 步骤2: 如果需要调整尺寸，发送调整请求
      if (resizeOptions) {
        const resizeResponse = await fetch(outputUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resize: resizeOptions,
          }),
        })

        if (!resizeResponse.ok) {
          const errorText = await resizeResponse.text()
          throw new Error(
            `TinyPNG resize failed: ${resizeResponse.status} - ${errorText}`,
          )
        }

        finalUrl = resizeResponse.headers.get('Location') || outputUrl
      }

      // 步骤3: 下载压缩后的图片
      const downloadResponse = await fetch(finalUrl, {
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        },
      })

      if (!downloadResponse.ok) {
        throw new Error(
          `Failed to download compressed image: ${downloadResponse.status}`,
        )
      }

      const compressedBlob = await downloadResponse.blob()

      // 检查压缩效果
      if (compressedBlob.size >= file.size * 0.98) {
        console.warn(
          'TinyPNG compression did not significantly reduce file size, returning original file',
        )
        // 缓存原始文件
        compressionCache.set(cacheKey, file)
        resolve(file)
      } else {
        // 创建一个新的 Blob，确保正确的 MIME 类型
        const finalBlob = new Blob([compressedBlob], { type: file.type })
        // 缓存压缩结果
        compressionCache.set(cacheKey, finalBlob)
        resolve(finalBlob)
      }
    } catch (error) {
      console.error('TinyPNG compression error:', error)
      reject(error)
    }
  })
}

// 导出缓存管理功能
export function clearTinyPngCache() {
  compressionCache.clear()
  console.log('TinyPNG cache cleared')
}

export function getTinyPngCacheSize() {
  return compressionCache.size
}

export function getTinyPngCacheInfo() {
  const cacheEntries = Array.from(compressionCache.entries()).map(
    ([key, blob]) => ({
      key,
      size: blob.size,
      type: blob.type,
    }),
  )

  const stats = compressionCache.getStats()

  return {
    totalEntries: stats.size,
    maxSize: stats.maxSize,
    usageRate: stats.usageRate,
    entries: cacheEntries,
  }
}

// 配置缓存最大大小
export function configureTinyPngCache(maxSize: number = 50) {
  compressionCache.setMaxSize(maxSize)
  console.log(`TinyPNG cache reconfigured with max size: ${maxSize}`)
}
