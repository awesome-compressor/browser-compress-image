// 主要的压缩函数 - 保持向后兼容
export { compress, compressWithStats, type CompressionStats } from './compress'

// 新的可配置压缩系统
export {
  compressWithTools,
  ToolRegistry,
  globalToolRegistry,
  type CompressorTool,
  type CompressorFunction,
  type CompressWithToolsOptions,
} from './compressWithTools'

// 按需导入的工具和注册函数
export * from './tools'

// 类型定义
export * from './types'

// TinyPNG 相关工具
export {
  clearTinyPngCache,
  getTinyPngCacheSize,
  getTinyPngCacheInfo,
  configureTinyPngCache,
} from './tools/compressWithTinyPng'

// 工具函数
export { LRUCache } from './utils/lruCache'
