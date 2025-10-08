// 主要的压缩函数 - 保持向后兼容
export { compress, compressWithStats } from './compress'
// ...type exports consolidated below

// Enhanced compression with queue and worker support (NEW)
export {
  clearCompressionQueue,
  compressEnhanced,
  compressEnhancedBatch,
  configureCompression,
  getCompressionStats,
  waitForCompressionInitialization,
} from './compressEnhanced'
// ...type exports consolidated below

// 新的可配置压缩系统
export {
  compressWithTools,
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
  PerformanceDetector,
} from './utils/compressionQueue'

export {
  CompressionWorkerManager,
  compressionWorkerManager,
} from './utils/compressionWorker'

// 工具函数
export { LRUCache } from './utils/lruCache'

// Memory management
export {
  checkMemoryBeforeOperation,
  MemoryManager,
  memoryManager,
} from './utils/memoryManager'

// Expose internal logger so consumers can enable debug logs at runtime
export { default as logger, setLogger, resetLogger } from './utils/logger'

// Image preprocessing
export { preprocessImage } from './utils/preprocessImage'

// Image conversion (including SVG support)
export {
  convertImage,
  renderSvgToCanvas,
  encodeSvgToFormat,
  detectFileFormat,
  isSvgContent,
} from './conversion'
export type {
  TargetFormat,
  SourceFormat,
  ImageConvertOptions,
  ImageConvertResult,
} from './conversion'

// JSQuash WASM helpers (for PWA warm-up and diagnostics)
export {
  ensureWasmLoaded,
  configureWasmLoading,
  diagnoseJsquashAvailability,
  downloadWasmFiles,
} from './tools/compressWithJsquash'

// Centralized type-only exports for clarity
export type { CompressionStats } from './compress'
export type { EnhancedCompressOptions } from './compressEnhanced'
export type {
  CompressorFunction,
  CompressorTool,
  CompressWithToolsOptions,
} from './compressWithTools'
export type { CompressionTask, QueueStats } from './utils/compressionQueue'
export type { WorkerMessage, WorkerTask } from './utils/compressionWorker'
export type { MemoryStats, MemoryThresholds } from './utils/memoryManager'
export type { PreprocessOptions, CropRect, ResizeOptions } from './types'
