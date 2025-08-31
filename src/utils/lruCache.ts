/**
 * LRU (Least Recently Used) 缓存实现
 * 当缓存达到最大容量时，自动淘汰最久未使用的项目
 */
import logger from './logger'

export class LRUCache<K, V> {
  private cache: Map<K, V>
  private maxSize: number

  constructor(maxSize: number = 50) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  /**
   * 获取缓存项，如果存在则将其移到最新位置
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // 将访问的项移到最后（最新使用）
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  /**
   * 设置缓存项，如果超过最大容量则淘汰最久未使用的项
   */
  set(key: K, value: V): void {
    // 如果key已存在，先删除旧的
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // 如果缓存已满，删除最久未使用的项（第一个）
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
        logger.log(
          `LRU Cache: Removed least recently used entry for key: ${String(firstKey)}`,
        )
      }
    }

    this.cache.set(key, value)
  }

  /**
   * 检查缓存中是否存在指定的key
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取当前缓存大小
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * 获取最大缓存大小
   */
  get maxCapacity(): number {
    return this.maxSize
  }

  /**
   * 设置新的最大缓存大小
   */
  setMaxSize(newMaxSize: number): void {
    this.maxSize = newMaxSize

    // 如果当前缓存超过新的最大大小，淘汰多余的项
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
        logger.log(
          `LRU Cache: Removed entry due to size reduction: ${String(firstKey)}`,
        )
      }
    }
  }

  /**
   * 获取所有缓存条目的迭代器
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }

  /**
   * 获取所有缓存的key
   */
  keys(): IterableIterator<K> {
    return this.cache.keys()
  }

  /**
   * 获取所有缓存的value
   */
  values(): IterableIterator<V> {
    return this.cache.values()
  }

  /**
   * 删除指定的缓存项
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number
    maxSize: number
    usageRate: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usageRate: (this.cache.size / this.maxSize) * 100,
    }
  }
}
