// 主要的压缩函数 - 保持向后兼容
export { compress, type CompressionStats, compressWithStats } from './compress'

// Enhanced compression with queue and worker support (NEW)
export {
  clearCompressionQueue,
  compressEnhanced,
  compressEnhancedBatch,
  configureCompression,
  type EnhancedCompressOptions,
  getCompressionStats,
  waitForCompressionInitialization,
} from './compressEnhanced'

// 新的可配置压缩系统
export {
  type CompressorFunction,
  type CompressorTool,
  compressWithTools,
  type CompressWithToolsOptions,
  globalToolRegistry,
  ToolRegistry,
} from './compressWithTools'

// 按需导入的工具和注册函数
export * from './tools'

// TinyPNG 相关工具
export {
  clearTinyPngCache,
  configureTinyPngCache,
  getTinyPngCacheInfo,
  getTinyPngCacheSize,
} from './tools/compressWithTinyPng'

// 类型定义
export * from './types'

// Queue and worker utilities
export {
  CompressionQueue,
  compressionQueue,
  type CompressionTask,
  PerformanceDetector,
  type QueueStats,
} from './utils/compressionQueue'

export {
  CompressionWorkerManager,
  compressionWorkerManager,
  type WorkerMessage,
  type WorkerTask,
} from './utils/compressionWorker'

// 工具函数
export { LRUCache } from './utils/lruCache'

// Memory management
export {
  checkMemoryBeforeOperation,
  MemoryManager,
  memoryManager,
  type MemoryStats,
  type MemoryThresholds,
} from './utils/memoryManager'

// Image preprocessing
export { preprocessImage } from './utils/preprocessImage'
export type { PreprocessOptions, CropRect, ResizeOptions } from './types'
