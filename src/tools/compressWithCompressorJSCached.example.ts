import { LRUCache } from '../utils/lruCache'

// 示例：为CompressorJS工具添加缓存支持
const compressorJSCache = new LRUCache<string, Blob>(30) // 最多缓存30个文件

// 生成缓存key的辅助函数
function generateCompressorJSKey(
  file: File,
  quality: number,
  maxWidth?: number,
  maxHeight?: number,
): string {
  return `${file.name}_${file.size}_${file.lastModified}_${quality}_${maxWidth || 'auto'}_${maxHeight || 'auto'}`
}

// 带缓存的CompressorJS压缩函数示例
export async function compressWithCompressorJSCached(
  file: File,
  options: { quality: number; maxWidth?: number; maxHeight?: number },
): Promise<Blob> {
  const cacheKey = generateCompressorJSKey(
    file,
    options.quality,
    options.maxWidth,
    options.maxHeight,
  )

  // 检查缓存
  const cached = compressorJSCache.get(cacheKey)
  if (cached) {
    console.log('CompressorJS: Using cached result for file:', file.name)
    return cached
  }

  // 这里应该是实际的CompressorJS压缩逻辑
  // const compressedBlob = await actualCompressorJSLogic(file, options)

  // 缓存结果
  // compressorJSCache.set(cacheKey, compressedBlob)

  // return compressedBlob

  // 临时返回原文件作为示例
  return file
}

// 缓存管理函数
export function clearCompressorJSCache() {
  compressorJSCache.clear()
  console.log('CompressorJS cache cleared')
}

export function getCompressorJSCacheInfo() {
  const stats = compressorJSCache.getStats()
  const entries = Array.from(compressorJSCache.entries()).map(
    ([key, blob]) => ({
      key,
      size: blob.size,
      type: blob.type,
    }),
  )

  return {
    ...stats,
    entries,
  }
}

export function configureCompressorJSCache(maxSize: number) {
  compressorJSCache.setMaxSize(maxSize)
  console.log(`CompressorJS cache reconfigured with max size: ${maxSize}`)
}
