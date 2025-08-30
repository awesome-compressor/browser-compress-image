// Memory management and optimization utilities
export interface MemoryStats {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
  memoryUsagePercentage: number
}

export interface MemoryThresholds {
  warning: number // Memory usage percentage to show warning
  critical: number // Memory usage percentage to trigger cleanup
  maxFileSize: number // Maximum single file size to process
  maxTotalSize: number // Maximum total files size in queue
}

export class MemoryManager {
  private static instance: MemoryManager
  private objectUrls: Set<string> = new Set()
  private imageElements: Set<HTMLImageElement> = new Set()
  private canvasElements: Set<HTMLCanvasElement> = new Set()
  private thresholds: MemoryThresholds

  private constructor() {
    this.thresholds = {
      warning: 70, // 70% memory usage warning
      critical: 85, // 85% memory usage triggers cleanup
      maxFileSize: 100 * 1024 * 1024, // 100MB max file size
      maxTotalSize: 500 * 1024 * 1024, // 500MB total queue size
    }

    // Setup periodic cleanup
    this.setupPeriodicCleanup()

    // Setup memory pressure monitoring
    this.setupMemoryMonitoring()
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }

  // Get current memory statistics
  getMemoryStats(): MemoryStats {
    // Check if performance.memory is available (Chrome) and guard non-browser envs
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        memoryUsagePercentage:
          (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      }
    }

    // Fallback for browsers without performance.memory
    return {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0,
      memoryUsagePercentage: 0,
    }
  }

  // Check if memory usage is critical
  isMemoryCritical(): boolean {
    const stats = this.getMemoryStats()
    return stats.memoryUsagePercentage > this.thresholds.critical
  }

  // Check if file size is acceptable
  isFileSizeAcceptable(fileSize: number): boolean {
    return fileSize <= this.thresholds.maxFileSize
  }

  // Check if total queue size is acceptable
  isTotalSizeAcceptable(totalSize: number): boolean {
    return totalSize <= this.thresholds.maxTotalSize
  }

  // Register object URL for cleanup
  registerObjectUrl(url: string): void {
    this.objectUrls.add(url)
  }

  // Register image element for cleanup
  registerImageElement(img: HTMLImageElement): void {
    this.imageElements.add(img)
  }

  // Register canvas element for cleanup
  registerCanvasElement(canvas: HTMLCanvasElement): void {
    this.canvasElements.add(canvas)
  }

  // Cleanup specific object URL
  cleanupObjectUrl(url: string): void {
    if (this.objectUrls.has(url)) {
      try {
        URL.revokeObjectURL(url)
        this.objectUrls.delete(url)
      } catch (error) {
        console.warn('Failed to revoke object URL:', error)
      }
    }
  }

  // Cleanup specific image element
  cleanupImageElement(img: HTMLImageElement): void {
    if (this.imageElements.has(img)) {
      try {
        img.src = ''
        img.onload = null
        img.onerror = null
        this.imageElements.delete(img)
      } catch (error) {
        console.warn('Failed to cleanup image element:', error)
      }
    }
  }

  // Cleanup specific canvas element
  cleanupCanvasElement(canvas: HTMLCanvasElement): void {
    if (this.canvasElements.has(canvas)) {
      try {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        canvas.width = 0
        canvas.height = 0
        this.canvasElements.delete(canvas)
      } catch (error) {
        console.warn('Failed to cleanup canvas element:', error)
      }
    }
  }

  // Perform comprehensive cleanup
  performCleanup(): void {
    console.log('Performing memory cleanup...')

    // Cleanup all tracked resources
    this.objectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.warn('Failed to revoke URL during cleanup:', error)
      }
    })
    this.objectUrls.clear()

    this.imageElements.forEach((img) => {
      try {
        img.src = ''
        img.onload = null
        img.onerror = null
      } catch (error) {
        console.warn('Failed to cleanup image during cleanup:', error)
      }
    })
    this.imageElements.clear()

    this.canvasElements.forEach((canvas) => {
      try {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        canvas.width = 0
        canvas.height = 0
      } catch (error) {
        console.warn('Failed to cleanup canvas during cleanup:', error)
      }
    })
    this.canvasElements.clear()

    // Suggest garbage collection if available (guard window)
    if (
      typeof window !== 'undefined' &&
      (window as any).gc &&
      typeof (window as any).gc === 'function'
    ) {
      try {
        ;(window as any).gc()
      } catch (error) {
        console.warn('Manual garbage collection failed:', error)
      }
    }

    console.log('Memory cleanup completed')
  }

  // Setup periodic cleanup every 30 seconds
  private setupPeriodicCleanup(): void {
    setInterval(() => {
      const stats = this.getMemoryStats()

      // Log memory stats in development
      if (
        typeof process !== 'undefined' &&
        process.env &&
        process.env.NODE_ENV === 'development'
      ) {
        console.log('Memory Stats:', stats)
      }

      // Perform cleanup if memory is critical
      if (stats.memoryUsagePercentage > this.thresholds.critical) {
        console.warn('Memory usage critical, performing cleanup')
        this.performCleanup()
      }
    }, 30000) // Every 30 seconds
  }

  // Setup memory pressure monitoring
  private setupMemoryMonitoring(): void {
    // Use observer if available (experimental API). Guard non-browser environments.
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry) => {
            if (
              entry.entryType === 'measure' &&
              entry.name.includes('memory')
            ) {
              console.log('Memory measurement:', entry)
            }
          })
        })

        observer.observe({ entryTypes: ['measure'] })
      } catch (error) {
        console.warn('Memory monitoring setup failed:', error)
      }
    }
  }

  // Update memory thresholds
  updateThresholds(newThresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds }
    console.log('Memory thresholds updated:', this.thresholds)
  }

  // Get current thresholds
  getThresholds(): MemoryThresholds {
    return { ...this.thresholds }
  }

  // Create managed object URL that auto-cleans
  createManagedObjectUrl(file: File | Blob): string {
    const url = URL.createObjectURL(file)
    this.registerObjectUrl(url)

    // Auto cleanup after 10 minutes as safety measure
    setTimeout(
      () => {
        this.cleanupObjectUrl(url)
      },
      10 * 60 * 1000,
    )

    return url
  }

  // Create managed image element
  createManagedImage(): HTMLImageElement {
    // Create image element with safe fallback for non-browser environments
    let img: any
    if (typeof Image !== 'undefined') {
      img = new Image()
    } else if (typeof document !== 'undefined') {
      img = document.createElement('img')
    } else {
      // Minimal stub to avoid crashes in Node tests
      img = { src: '', onload: null, onerror: null }
    }

    this.registerImageElement(img as HTMLImageElement)

    // Auto cleanup if not used for 5 minutes
    setTimeout(
      () => {
        try {
          this.cleanupImageElement(img as HTMLImageElement)
        } catch (e) {
          /* ignore */
        }
      },
      5 * 60 * 1000,
    )

    return img as HTMLImageElement
  }

  // Create managed canvas element
  createManagedCanvas(): HTMLCanvasElement {
    // Create canvas element with safe fallback for non-browser environments
    let canvas: any
    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas')
    } else {
      // Minimal stub implementing getContext for Node env
      canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          clearRect: () => {},
        }),
      }
    }

    this.registerCanvasElement(canvas as HTMLCanvasElement)

    // Auto cleanup if not used for 5 minutes
    setTimeout(
      () => {
        try {
          this.cleanupCanvasElement(canvas as HTMLCanvasElement)
        } catch (e) {
          /* ignore */
        }
      },
      5 * 60 * 1000,
    )

    return canvas as HTMLCanvasElement
  }

  // Destroy and cleanup all resources
  destroy(): void {
    this.performCleanup()
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance()

// Utility function to check memory before large operations
export function checkMemoryBeforeOperation(fileSize: number = 0): boolean {
  const manager = memoryManager
  const stats = manager.getMemoryStats()

  // Check if memory is already critical
  if (manager.isMemoryCritical()) {
    console.warn(
      'Memory usage is critical, consider reducing concurrent operations',
    )
    return false
  }

  // Check file size limits
  if (fileSize > 0 && !manager.isFileSizeAcceptable(fileSize)) {
    console.warn(`File size ${fileSize} bytes exceeds limit`)
    return false
  }

  return true
}
