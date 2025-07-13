export { compress, compressWithStats, type CompressionStats } from './compress'
export * from './types'
export {
  clearTinyPngCache,
  getTinyPngCacheSize,
  getTinyPngCacheInfo,
  configureTinyPngCache,
} from './tools/compressWithTinyPng'
export { LRUCache } from './utils/lruCache'
