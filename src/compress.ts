import type {
  CompressOptions,
  CompressResult,
  CompressResultType,
  MultipleCompressResults,
  CompressResultItem,
  ToolConfig,
} from './types'
import type { CompressorTool } from './compressWithTools'
import convertBlobToType from './convertBlobToType'
import { LRUCache } from './utils/lruCache'
import logger from './utils/logger'
import { runWithAbortAndTimeout } from './utils/abort'
// 注意：这里不再直接导入所有工具，而是动态导入

// 动态导入压缩工具的辅助函数
async function getCompressorTool(tool: CompressorTool) {
  switch (tool) {
    case 'browser-image-compression': {
      const { default: compressor } = await import(
        './tools/compressWithBrowserImageCompression'
      )
      return compressor
    }
    case 'compressorjs': {
      const { default: compressor } = await import(
        './tools/compressWithCompressorJS'
      )
      return compressor
    }
    case 'gifsicle': {
      const { default: compressor } = await import(
        './tools/compressWithGifsicle'
      )
      return compressor
    }
    case 'canvas': {
      const { default: compressor } = await import('./tools/compressWithCanvas')
      return compressor
    }
    case 'jsquash': {
      const { default: compressor } = await import(
        './tools/compressWithJsquash'
      )
      return compressor
    }
    case 'tinypng': {
      const { compressWithTinyPng } = await import(
        './tools/compressWithTinyPng'
      )
      return compressWithTinyPng
    }
    default:
      throw new Error(`Unknown compression tool: ${tool}`)
  }
}

// 开发环境日志工具
// legacy devLog replaced by centralized logger

// 使用仓库内的 LRUCache 实现
const compressResultCache = new LRUCache<string, Blob>(100)

// runWithAbortAndTimeout moved to `src/utils/abort.ts`

// 支持 EXIF 保留的工具
const EXIF_SUPPORTED_TOOLS: CompressorTool[] = [
  'browser-image-compression',
  'compressorjs',
]

/**
 * 根据工具名称查找对应的配置
 */
function findToolConfig(
  toolName: string,
  toolConfigs: ToolConfig[],
): ToolConfig | undefined {
  return toolConfigs.find((config) => config.name === toolName)
}

// 压缩结果接口
interface CompressionAttempt {
  tool: CompressorTool
  blob: Blob
  size: number
  success: boolean
  error?: string
  duration: number // 压缩耗时（毫秒）
}

const toolsCollections: Record<string, CompressorTool[]> = {
  png: ['jsquash', 'browser-image-compression', 'canvas'],
  gif: ['gifsicle'],
  webp: ['jsquash', 'canvas', 'browser-image-compression'],
  jpeg: ['jsquash', 'compressorjs', 'canvas', 'browser-image-compression'],
  others: ['jsquash', 'browser-image-compression', 'canvas'],
}

// 重载：支持新的选项对象参数 - 返回多结果
export async function compress<T extends CompressResultType = 'blob'>(
  file: File,
  options: CompressOptions & { type?: T; returnAllResults: true },
): Promise<MultipleCompressResults<T>>

// 重载：支持新的选项对象参数 - 返回单结果
export async function compress<T extends CompressResultType = 'blob'>(
  file: File,
  options: CompressOptions & { type?: T; returnAllResults?: false },
): Promise<CompressResult<T>>

// 重载：支持旧的参数格式(向后兼容)
export async function compress<T extends CompressResultType = 'blob'>(
  file: File,
  quality?: number,
  type?: T,
): Promise<CompressResult<T>>

// 实现
export async function compress<T extends CompressResultType = 'blob'>(
  file: File,
  qualityOrOptions?: number | (CompressOptions & { type?: T }),
  type?: T,
): Promise<CompressResult<T> | MultipleCompressResults<T>> {
  // 解析参数
  let options: CompressOptions & { type?: T }

  if (typeof qualityOrOptions === 'object') {
    // 新的选项对象格式
    options = qualityOrOptions
  } else {
    // 旧的参数格式(向后兼容)
    options = {
      quality: qualityOrOptions || 0.6,
      mode: 'keepSize',
      type: type || ('blob' as T),
    }
  }

  // 设置默认值
  const {
    quality = 0.6,
    mode = 'keepSize',
    targetWidth,
    targetHeight,
    maxWidth,
    maxHeight,
    preserveExif = false,
    returnAllResults = false,
    type: resultType = 'blob' as T,
    toolConfigs = [],
    signal,
    timeoutMs,
  } = options

  // 使用多工具压缩比对策略
  const compressionOptions = {
    quality,
    mode,
    targetWidth,
    targetHeight,
    maxWidth,
    maxHeight,
    preserveExif,
    toolConfigs,
    signal,
    timeoutMs,
  }

  // 构建缓存 key（仅用于单结果路径）
  const cacheKey = `${file.name}:${file.size}:type=${file.type}:q=${quality}:m=${mode}:tw=${targetWidth || ''}:th=${targetHeight || ''}:mw=${maxWidth || ''}:mh=${maxHeight || ''}:preserveExif=${preserveExif}:cfg=${JSON.stringify(
    toolConfigs,
  )}`

  // 如果需要返回所有结果，则不使用缓存（避免结构不一致）
  if (!returnAllResults) {
    const cached = compressResultCache.get(cacheKey)
    if (cached) {
      logger.debug('Cache hit for', cacheKey)
      return convertBlobToType(cached, resultType, file.name)
    }
  }

  // 根据文件类型选择合适的压缩工具组合
  let tools = file.type.includes('png')
    ? toolsCollections['png']
    : file.type.includes('gif')
      ? toolsCollections['gif']
      : file.type.includes('webp')
        ? toolsCollections['webp']
        : file.type.includes('jpeg') || file.type.includes('jpg')
          ? toolsCollections['jpeg']
          : toolsCollections['others']

  // 如果在 toolConfigs 中配置了 TinyPNG，则添加到工具列表中
  const hasTinyPngConfig = toolConfigs.some(
    (config) => config.name === 'tinypng',
  )
  if (
    hasTinyPngConfig &&
    ['png', 'webp', 'jpeg', 'jpg'].some((type) => file.type.includes(type))
  ) {
    tools = [...tools, 'tinypng']
  }

  // 如果需要返回所有结果
  if (returnAllResults) {
    return await compressWithMultipleToolsAndReturnAll(
      file,
      compressionOptions,
      tools,
      resultType,
    )
  }

  // 否则返回最佳结果
  const bestResult: Blob = await compressWithMultipleTools(
    file,
    compressionOptions,
    tools,
  )

  // 将结果存入缓存（仅缓存单结果路径）
  try {
    compressResultCache.set(cacheKey, bestResult)
  } catch (e) {
    logger.warn('Failed to cache compress result', e)
  }

  return convertBlobToType(bestResult, resultType, file.name)
}

// 多工具压缩比对核心函数
async function compressWithMultipleTools(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
    toolConfigs?: ToolConfig[]
    signal?: AbortSignal
    timeoutMs?: number
  },
  tools: CompressorTool[],
): Promise<Blob> {
  const totalStartTime = performance.now()

  // 当需要保留 EXIF 时，过滤掉不支持的工具
  if (options.preserveExif) {
    tools = tools.filter((tool) => EXIF_SUPPORTED_TOOLS.includes(tool))
    if (tools.length === 0) {
      throw new Error(
        'No EXIF-supporting tools available for this file type. Please disable preserveExif or use a different file format.',
      )
    }
    logger.log('preserveExif=true, filtered tools:', tools)
  }

  const attempts: CompressionAttempt[] = []
  // 并行运行所有压缩工具
  const sharedController = new AbortController()
  const sharedSignal = sharedController.signal

  if ((options as any).signal) {
    const outer = (options as any).signal as AbortSignal
    if (outer.aborted) {
      sharedController.abort()
    } else {
      outer.addEventListener('abort', () => sharedController.abort(), {
        once: true,
      })
    }
  }

  const promises = tools.map(async (tool) => {
    const startTime = performance.now()

    try {
      let compressedBlob: Blob

      // 查找工具对应的配置
      const toolConfig = findToolConfig(tool, options.toolConfigs || [])

      // 构建传入压缩工具的选项，合并工具特定配置
      const toolOptions = {
        quality: options.quality,
        mode: options.mode,
        targetWidth: options.targetWidth,
        targetHeight: options.targetHeight,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        preserveExif: options.preserveExif,
        ...toolConfig, // 合并工具特定配置
      }

      // 使用动态导入获取压缩工具
      const compressorFunction = await getCompressorTool(tool)

      // 支持可取消/超时包装，传入 sharedSignal 以便统一取消
      ;(toolOptions as any).signal = sharedSignal
      compressedBlob = await runWithAbortAndTimeout(
        () => compressorFunction(file, toolOptions),
        sharedSignal,
        options.timeoutMs,
      )

      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        tool,
        blob: compressedBlob,
        size: compressedBlob.size,
        success: true,
        duration,
      } as CompressionAttempt
    } catch (error) {
      // 工具失败（含超时/取消），中止其他工具
      try {
        sharedController.abort()
      } catch (e) {
        /* ignore */
      }
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        tool,
        blob: file, // 失败时使用原文件
        size: file.size,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      } as CompressionAttempt
    }
  })

  // 等待所有压缩尝试完成（使用 allSettled 确保即使某些工具失败也能获得其他结果）
  const results = await Promise.allSettled(promises)

  // 处理结果，包括成功和失败的情况
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      attempts.push(result.value)
    } else {
      logger.warn('Compression tool failed:', result.reason)
    }
  })

  // 过滤成功的结果
  const successfulAttempts = attempts.filter((attempt) => attempt.success)

  if (successfulAttempts.length === 0) {
    logger.warn('All compression attempts failed, returning original file')
    return file
  }

  // 选择文件大小最小的结果
  const bestAttempt = successfulAttempts.reduce((best, current) =>
    current.size < best.size ? current : best,
  )

  // 如果最佳压缩结果仍然比原文件大，且质量设置较高，返回原文件
  if (bestAttempt.size >= file.size * 0.98 && options.quality > 0.85) {
    const totalEndTime = performance.now()
    const totalDuration = Math.round(totalEndTime - totalStartTime)

    logger.log(
      `Best compression (${bestAttempt.tool}) size: ${bestAttempt.size}, original: ${file.size}, using original (total: ${totalDuration}ms)`,
    )
    return file
  }

  const totalEndTime = performance.now()
  const totalDuration = Math.round(totalEndTime - totalStartTime)

  logger.log(
    `Best compression result: ${bestAttempt.tool} (${bestAttempt.size} bytes, ${(((file.size - bestAttempt.size) / file.size) * 100).toFixed(1)}% reduction, ${bestAttempt.duration}ms) - Total time: ${totalDuration}ms`,
  )

  // 输出所有工具的性能比较
  if (successfulAttempts.length > 1) {
    logger.table(
      successfulAttempts.map((attempt) => ({
        Tool: attempt.tool,
        'Size (bytes)': attempt.size,
        'Reduction (%)': `${(((file.size - attempt.size) / file.size) * 100).toFixed(1)}%`,
        'Duration (ms)': attempt.duration,
        'Speed (MB/s)': `${(file.size / 1024 / 1024 / (attempt.duration / 1000)).toFixed(2)}`,
      })),
    )
  }

  return bestAttempt.blob
}

// 多工具压缩并返回所有结果的函数
async function compressWithMultipleToolsAndReturnAll<
  T extends CompressResultType,
>(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
    toolConfigs?: ToolConfig[]
    signal?: AbortSignal
    timeoutMs?: number
  },
  tools: CompressorTool[],
  resultType: T,
): Promise<MultipleCompressResults<T>> {
  const totalStartTime = performance.now()

  // 当需要保留 EXIF 时，过滤掉不支持的工具
  if (options.preserveExif) {
    tools = tools.filter((tool) => EXIF_SUPPORTED_TOOLS.includes(tool))
    if (tools.length === 0) {
      throw new Error(
        'No EXIF-supporting tools available for this file type. Please disable preserveExif or use a different file format.',
      )
    }
    logger.log('preserveExif=true, filtered tools:', tools)
  }

  const attempts: CompressionAttempt[] = []

  // 并行运行所有压缩工具
  const promises = tools.map(async (tool) => {
    const startTime = performance.now()

    try {
      let compressedBlob: Blob

      // 查找工具对应的配置
      const toolConfig = findToolConfig(tool, options.toolConfigs || [])

      // 构建传入压缩工具的选项，合并工具特定配置
      const toolOptions = {
        quality: options.quality,
        mode: options.mode,
        targetWidth: options.targetWidth,
        targetHeight: options.targetHeight,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        preserveExif: options.preserveExif,
        ...toolConfig, // 合并工具特定配置
      }

      // 使用动态导入获取压缩工具
      const compressorFunction = await getCompressorTool(tool)
      compressedBlob = await runWithAbortAndTimeout(
        () => compressorFunction(file, toolOptions),
        options.signal,
        options.timeoutMs,
      )

      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        tool,
        blob: compressedBlob,
        size: compressedBlob.size,
        success: true,
        duration,
      } as CompressionAttempt
    } catch (error) {
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        tool,
        blob: file, // 失败时使用原文件
        size: file.size,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      } as CompressionAttempt
    }
  })

  // 等待所有压缩尝试完成
  const results = await Promise.allSettled(promises)

  // 处理结果
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      attempts.push(result.value)
    } else {
      logger.warn('Compression tool failed:', result.reason)
    }
  })

  if (attempts.length === 0) {
    throw new Error('All compression attempts failed')
  }

  const totalEndTime = performance.now()
  const totalDuration = Math.round(totalEndTime - totalStartTime)

  // 转换所有结果为指定类型
  const allResults: CompressResultItem<T>[] = await Promise.all(
    attempts.map(async (attempt) => {
      const convertedResult = await convertBlobToType(
        attempt.blob,
        resultType,
        file.name,
      )
      return {
        tool: attempt.tool,
        result: convertedResult,
        originalSize: file.size,
        compressedSize: attempt.size,
        compressionRatio: ((file.size - attempt.size) / file.size) * 100,
        duration: attempt.duration,
        success: attempt.success,
        error: attempt.error,
      }
    }),
  )

  // 找到最佳结果（成功的结果中文件大小最小的）
  const successfulAttempts = attempts.filter((attempt) => attempt.success)
  let bestAttempt: CompressionAttempt

  if (successfulAttempts.length > 0) {
    bestAttempt = successfulAttempts.reduce((best, current) =>
      current.size < best.size ? current : best,
    )

    // 如果最佳压缩结果仍然比原文件大，且质量设置较高，使用原文件
    if (bestAttempt.size >= file.size * 0.98 && options.quality > 0.85) {
      bestAttempt = {
        tool: 'original',
        blob: file,
        size: file.size,
        success: true,
        duration: 0,
      }
    }
  } else {
    // 如果所有工具都失败，使用原文件
    bestAttempt = {
      tool: 'original',
      blob: file,
      size: file.size,
      success: true,
      duration: 0,
    }
  }

  const bestResult = await convertBlobToType(
    bestAttempt.blob,
    resultType,
    file.name,
  )

  logger.log(
    `Best compression result: ${bestAttempt.tool} (${bestAttempt.size} bytes, ${(((file.size - bestAttempt.size) / file.size) * 100).toFixed(1)}% reduction) - Total time: ${totalDuration}ms`,
  )

  // 输出所有工具的性能比较
  if (successfulAttempts.length > 1) {
    logger.table(
      successfulAttempts.map((attempt) => ({
        Tool: attempt.tool,
        'Size (bytes)': attempt.size,
        'Reduction (%)': `${(((file.size - attempt.size) / file.size) * 100).toFixed(1)}%`,
        'Duration (ms)': attempt.duration,
        'Speed (MB/s)': `${(file.size / 1024 / 1024 / (attempt.duration / 1000)).toFixed(2)}`,
      })),
    )
  }

  return {
    bestResult,
    bestTool: bestAttempt.tool,
    allResults,
    totalDuration,
  }
}

// 详细压缩统计信息接口
export interface CompressionStats {
  bestTool: string
  compressedFile: Blob
  originalSize: number
  compressedSize: number
  compressionRatio: number
  totalDuration: number
  toolsUsed: {
    tool: string
    size: number
    duration: number
    compressionRatio: number
    success: boolean
    error?: string
  }[]
}

// 带详细统计信息的压缩函数
export async function compressWithStats(
  file: File,
  qualityOrOptions?: number | CompressOptions,
): Promise<CompressionStats> {
  // 使用多工具压缩并返回详细统计
  return await compressWithMultipleToolsWithStats(file, {
    quality:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.quality || 0.6
        : qualityOrOptions || 0.6,
    mode:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.mode || 'keepSize'
        : 'keepSize',
    targetWidth:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.targetWidth
        : undefined,
    targetHeight:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.targetHeight
        : undefined,
    maxWidth:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.maxWidth
        : undefined,
    maxHeight:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.maxHeight
        : undefined,
    preserveExif:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.preserveExif || false
        : false,
    toolConfigs:
      typeof qualityOrOptions === 'object'
        ? qualityOrOptions.toolConfigs || []
        : [],
  })
}

// 带统计信息的多工具压缩函数
async function compressWithMultipleToolsWithStats(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
    toolConfigs?: ToolConfig[]
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<CompressionStats> {
  const totalStartTime = performance.now()

  // 根据文件类型选择工具
  let tools = file.type.includes('png')
    ? toolsCollections['png']
    : file.type.includes('gif')
      ? toolsCollections['gif']
      : file.type.includes('webp')
        ? toolsCollections['webp']
        : toolsCollections['others']

  // 如果在 toolConfigs 中配置了 TinyPNG，则添加到工具列表中
  const hasTinyPngConfig = options.toolConfigs?.some(
    (config) => config.name === 'tinypng',
  )
  if (
    hasTinyPngConfig &&
    ['png', 'webp', 'jpeg', 'jpg'].some((type) => file.type.includes(type))
  ) {
    tools = [...tools, 'tinypng']
  }

  // 当需要保留 EXIF 时，过滤掉不支持的工具
  if (options.preserveExif) {
    tools = tools.filter((tool) => EXIF_SUPPORTED_TOOLS.includes(tool))
    if (tools.length === 0) {
      throw new Error(
        'No EXIF-supporting tools available for this file type. Please disable preserveExif or use a different file format.',
      )
    }
    logger.log('preserveExif=true, filtered tools:', tools)
  }

  const attempts: CompressionAttempt[] = []

  // 并行运行所有压缩工具（复用现有逻辑）
  const promises = tools.map(async (tool) => {
    const startTime = performance.now()

    try {
      let compressedBlob: Blob

      // 查找工具对应的配置
      const toolConfig = findToolConfig(tool, options.toolConfigs || [])

      // 构建传入压缩工具的选项，合并工具特定配置
      const toolOptions = {
        quality: options.quality,
        mode: options.mode,
        targetWidth: options.targetWidth,
        targetHeight: options.targetHeight,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        preserveExif: options.preserveExif,
        ...toolConfig, // 合并工具特定配置
      }

      // 使用动态导入获取压缩工具
      const compressorFunction = await getCompressorTool(tool)
      compressedBlob = await runWithAbortAndTimeout(
        () => compressorFunction(file, toolOptions),
        options.signal,
        options.timeoutMs,
      )

      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        tool,
        blob: compressedBlob,
        size: compressedBlob.size,
        success: true,
        duration,
      } as CompressionAttempt
    } catch (error) {
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        tool,
        blob: file,
        size: file.size,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      } as CompressionAttempt
    }
  })

  const results = await Promise.allSettled(promises)

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      attempts.push(result.value)
    }
  })

  const successfulAttempts = attempts.filter((attempt) => attempt.success)
  const bestAttempt =
    successfulAttempts.length > 0
      ? successfulAttempts.reduce((best, current) =>
          current.size < best.size ? current : best,
        )
      : {
          tool: 'none',
          blob: file,
          size: file.size,
          success: false,
          duration: 0,
        }

  const totalEndTime = performance.now()
  const totalDuration = Math.round(totalEndTime - totalStartTime)

  return {
    bestTool: bestAttempt.tool,
    compressedFile: bestAttempt.blob,
    originalSize: file.size,
    compressedSize: bestAttempt.size,
    compressionRatio: ((file.size - bestAttempt.size) / file.size) * 100,
    totalDuration,
    toolsUsed: attempts.map((attempt) => ({
      tool: attempt.tool,
      size: attempt.size,
      duration: attempt.duration,
      compressionRatio: ((file.size - attempt.size) / file.size) * 100,
      success: attempt.success,
      error: attempt.error,
    })),
  }
}

export default compress
