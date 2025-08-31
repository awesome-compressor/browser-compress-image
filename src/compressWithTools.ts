import type {
  CompressOptions,
  CompressResult,
  CompressResultType,
  MultipleCompressResults,
  CompressResultItem,
  ToolConfig,
} from './types'
import convertBlobToType from './convertBlobToType'
import { runWithAbortAndTimeout } from './utils/abort'
import logger from './utils/logger'

// runWithAbortAndTimeout moved to `src/utils/abort.ts`

// 压缩工具类型定义
export type CompressorTool =
  | 'browser-image-compression'
  | 'compressorjs'
  | 'gifsicle'
  | 'canvas'
  | 'jsquash'
  | 'original'
  | 'tinypng'

// 压缩工具函数类型
export type CompressorFunction = (file: File, options: any) => Promise<Blob>

// 工具注册表
export class ToolRegistry {
  private tools = new Map<CompressorTool, CompressorFunction>()
  private toolsCollections: Record<string, CompressorTool[]> = {
    png: [],
    gif: [],
    webp: [],
    jpeg: [],
    others: [],
  }

  // 注册压缩工具
  registerTool(
    name: CompressorTool,
    func: CompressorFunction,
    formats?: string[],
  ): void {
    this.tools.set(name, func)

    // 如果指定了格式，将工具添加到对应格式的工具集合中
    if (formats && formats.length > 0) {
      formats.forEach((format) => {
        if (this.toolsCollections[format]) {
          if (!this.toolsCollections[format].includes(name)) {
            this.toolsCollections[format].push(name)
          }
        }
      })
    } else {
      // 如果没有指定格式，添加到所有格式（除了gif）
      Object.keys(this.toolsCollections).forEach((format) => {
        if (format !== 'gif' && !this.toolsCollections[format].includes(name)) {
          this.toolsCollections[format].push(name)
        }
      })
    }
  }

  // 获取压缩工具
  getTool(name: CompressorTool): CompressorFunction | undefined {
    return this.tools.get(name)
  }

  // 获取已注册的工具列表
  getRegisteredTools(): CompressorTool[] {
    return Array.from(this.tools.keys())
  }

  // 根据文件类型获取可用工具
  getToolsForFileType(fileType: string): CompressorTool[] {
    if (fileType.includes('png')) return [...this.toolsCollections.png]
    if (fileType.includes('gif')) return [...this.toolsCollections.gif]
    if (fileType.includes('webp')) return [...this.toolsCollections.webp]
    if (fileType.includes('jpeg') || fileType.includes('jpg'))
      return [...this.toolsCollections.jpeg]
    return [...this.toolsCollections.others]
  }

  // 设置工具优先级（重新排序）
  setToolPriority(fileType: string, tools: CompressorTool[]): void {
    if (this.toolsCollections[fileType]) {
      // 过滤出已注册的工具
      const registeredTools = tools.filter((tool) => this.tools.has(tool))
      this.toolsCollections[fileType] = registeredTools
    }
  }

  // 检查工具是否已注册
  isToolRegistered(name: CompressorTool): boolean {
    return this.tools.has(name)
  }
}

// 全局工具注册表实例
export const globalToolRegistry = new ToolRegistry()

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
  duration: number
}

// 可配置的压缩函数选项
export interface CompressWithToolsOptions extends CompressOptions {
  type?: CompressResultType
  returnAllResults?: boolean
  toolRegistry?: ToolRegistry // 允许传入自定义的工具注册表
}

// 重载：返回多结果
export async function compressWithTools<T extends CompressResultType = 'blob'>(
  file: File,
  options: CompressWithToolsOptions & { type?: T; returnAllResults: true },
): Promise<MultipleCompressResults<T>>

// 重载：返回单结果
export async function compressWithTools<T extends CompressResultType = 'blob'>(
  file: File,
  options: CompressWithToolsOptions & { type?: T; returnAllResults?: false },
): Promise<CompressResult<T>>

// 实现
export async function compressWithTools<T extends CompressResultType = 'blob'>(
  file: File,
  options: CompressWithToolsOptions & { type?: T },
): Promise<CompressResult<T> | MultipleCompressResults<T>> {
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
    toolRegistry = globalToolRegistry,
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

  // 根据文件类型选择合适的压缩工具组合
  let tools = toolRegistry.getToolsForFileType(file.type)

  // 如果在 toolConfigs 中配置了 TinyPNG，则添加到工具列表中
  const hasTinyPngConfig = toolConfigs.some(
    (config) => config.name === 'tinypng',
  )
  if (
    hasTinyPngConfig &&
    toolRegistry.isToolRegistered('tinypng') &&
    ['png', 'webp', 'jpeg', 'jpg'].some((type) => file.type.includes(type))
  ) {
    if (!tools.includes('tinypng')) {
      tools = [...tools, 'tinypng']
    }
  }

  // 过滤掉未注册的工具
  tools = tools.filter((tool) => toolRegistry.isToolRegistered(tool))

  if (tools.length === 0) {
    throw new Error(
      'No compression tools available. Please register at least one compression tool.',
    )
  }

  // 如果需要返回所有结果
  if (returnAllResults) {
    return await compressWithMultipleToolsAndReturnAll(
      file,
      compressionOptions,
      tools,
      resultType,
      toolRegistry,
    )
  }

  // 否则返回最佳结果
  const bestResult: Blob = await compressWithMultipleTools(
    file,
    compressionOptions,
    tools,
    toolRegistry,
  )

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
  toolRegistry: ToolRegistry,
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
  // 使用共享 AbortController，使任意失败/超时/外部取消能够中止所有正在运行的工具
  const sharedController = new AbortController()
  const sharedSignal = sharedController.signal

  // 如果外部传入 signal，则在外部 abort 时转发到 shared controller
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
      const compressorFunction = toolRegistry.getTool(tool)
      if (!compressorFunction) {
        throw new Error(`Tool ${tool} not registered`)
      }

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

      // 支持可取消/超时：如果外层传入了 signal 或 timeoutMs，则把它传给实现或通过 race 包装
      const runCompressor = () => compressorFunction(file, toolOptions)

      const compressedBlob = await runWithAbortAndTimeout(
        runCompressor,
        // 使用 sharedSignal，让单个工具响应共享取消
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
      // 如果某个工具失败（包括超时/取消），中止所有其他工具
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

  // 等待所有压缩尝试完成
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
  toolRegistry: ToolRegistry,
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

  // 并行运行所有压缩工具，使用共享 AbortController
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
      const compressorFunction = toolRegistry.getTool(tool)
      if (!compressorFunction) {
        throw new Error(`Tool ${tool} not registered`)
      }

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
        ...(toolConfig || {}), // 合并工具特定配置
        // 将 sharedSignal 传入工具实现，若其支持则可响应取消
        signal: sharedSignal,
      }

      const compressedBlob = await runWithAbortAndTimeout(
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
      // 某个工具失败（含超时/取消），中止其他工具
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

  // 找到最佳结果
  const successfulAttempts = attempts.filter((attempt) => attempt.success)
  let bestAttempt: CompressionAttempt

  if (successfulAttempts.length > 0) {
    bestAttempt = successfulAttempts.reduce((best, current) =>
      current.size < best.size ? current : best,
    )

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

  return {
    bestResult,
    bestTool: bestAttempt.tool,
    allResults,
    totalDuration,
  }
}
