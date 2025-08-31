// Compression queue manager for performance optimization
export interface CompressionTask {
  id: string
  file: File
  options: any
  resolve: (result: Blob) => void
  reject: (error: Error) => void
  priority?: number // Higher number = higher priority
  // Optional cancel listener used to cleanup when task is started or removed
  cancelListener?: () => void
}

export interface QueueStats {
  pending: number
  running: number
  completed: number
  failed: number
  maxConcurrency: number
}

// Device performance detection and concurrency calculation
export class PerformanceDetector {
  private static instance: PerformanceDetector
  private deviceInfo: {
    isMobile: boolean
    cpuCores: number
    memoryGB: number
    estimatedPerformance: 'low' | 'medium' | 'high'
  } | null = null

  private constructor() {}

  static getInstance(): PerformanceDetector {
    if (!PerformanceDetector.instance) {
      PerformanceDetector.instance = new PerformanceDetector()
    }
    return PerformanceDetector.instance
  }

  detectDevice() {
    if (this.deviceInfo) return this.deviceInfo

    // Defensive checks for non-browser environments (Node tests, SSR)
    const hasNavigator = typeof navigator !== 'undefined'
    const hasWindow = typeof window !== 'undefined'

    // Detect if mobile device (safe guards)
    const userAgent =
      hasNavigator && (navigator as any).userAgent
        ? (navigator as any).userAgent
        : ''
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent,
      ) || (hasWindow ? window.innerWidth <= 768 : false)

    // Get CPU cores (with fallback)
    const cpuCores =
      (hasNavigator && (navigator as any).hardwareConcurrency) ||
      (isMobile ? 4 : 8)

    // Estimate memory (with fallback)
    const memory = hasNavigator ? (navigator as any).deviceMemory : undefined
    const memoryGB = memory || (isMobile ? 2 : 8)

    // Estimate performance level
    let estimatedPerformance: 'low' | 'medium' | 'high' = 'medium'
    if (isMobile || cpuCores <= 2 || memoryGB <= 2) {
      estimatedPerformance = 'low'
    } else if (cpuCores >= 8 && memoryGB >= 8) {
      estimatedPerformance = 'high'
    }

    this.deviceInfo = {
      isMobile,
      cpuCores,
      memoryGB,
      estimatedPerformance,
    }

    import('../utils/logger')
      .then((m) => m.default.log('Device detected:', this.deviceInfo))
      .catch(() => {})
    return this.deviceInfo
  }

  calculateOptimalConcurrency(): number {
    const device = this.detectDevice()

    // User-specified fallback values
    if (device.isMobile) {
      return 2 // Mobile devices: limit to 2 concurrent tasks
    }

    // Desktop/tablet: dynamic calculation based on performance
    switch (device.estimatedPerformance) {
      case 'low':
        return 2
      case 'medium':
        return 3
      case 'high':
        return Math.min(5, Math.max(2, Math.floor(device.cpuCores / 2)))
      default:
        return 3
    }
  }
}

export class CompressionQueue {
  private static instance: CompressionQueue
  private queue: CompressionTask[] = []
  private running: Map<string, CompressionTask> = new Map()
  private completed: number = 0
  private failed: number = 0
  private maxConcurrency: number
  private performanceDetector: PerformanceDetector

  private constructor() {
    this.performanceDetector = PerformanceDetector.getInstance()
    this.maxConcurrency = this.performanceDetector.calculateOptimalConcurrency()
    import('../utils/logger')
      .then((m) =>
        m.default.log(
          `Compression queue initialized with concurrency: ${this.maxConcurrency}`,
        ),
      )
      .catch(() => {})
  }

  static getInstance(): CompressionQueue {
    if (!CompressionQueue.instance) {
      CompressionQueue.instance = new CompressionQueue()
    }
    return CompressionQueue.instance
  }

  // Add task to queue
  addTask(task: CompressionTask): void {
    // Add priority if not specified (higher priority for smaller files)
    if (task.priority === undefined) {
      task.priority = Math.max(
        1,
        100 - Math.floor(task.file.size / (1024 * 1024)),
      ) // Larger files get lower priority
    }

    // Insert task in priority order
    const insertIndex = this.queue.findIndex(
      (t) => (t.priority || 0) < task.priority!,
    )
    if (insertIndex === -1) {
      this.queue.push(task)
    } else {
      this.queue.splice(insertIndex, 0, task)
    }

    this.processQueue()
  }

  // Remove task from queue (if not running)
  removeTask(taskId: string): boolean {
    const queueIndex = this.queue.findIndex((t) => t.id === taskId)
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1)
      return true
    }
    return false
  }

  // Get current queue statistics
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      running: this.running.size,
      completed: this.completed,
      failed: this.failed,
      maxConcurrency: this.maxConcurrency,
    }
  }

  // Update max concurrency (useful for manual adjustment)
  setMaxConcurrency(newMax: number): void {
    this.maxConcurrency = Math.max(1, Math.min(10, newMax)) // Limit between 1-10
    import('../utils/logger')
      .then((m) =>
        m.default.log(`Concurrency updated to: ${this.maxConcurrency}`),
      )
      .catch(() => {})
    this.processQueue()
  }

  // Clear all pending tasks
  clearQueue(): void {
    this.queue.forEach((task) => {
      task.reject(new Error('Task cancelled: queue cleared'))
    })
    this.queue = []
  }

  // Process queue - start tasks if slots available
  private async processQueue(): Promise<void> {
    while (this.running.size < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.running.set(task.id, task)

      // Execute task
      this.executeTask(task).catch((error) => {
        import('../utils/logger')
          .then((m) => m.default.error('Task execution error:', error))
          .catch(() => {})
      })
    }
  }

  // Execute a single compression task
  private async executeTask(task: CompressionTask): Promise<void> {
    try {
      import('../utils/logger')
        .then((m) => m.default.log(`Starting compression task: ${task.id}`))
        .catch(() => {})

      // Remove any cancel listener since task is now running
      if (task.cancelListener) {
        try {
          task.cancelListener()
        } catch (e) {
          /* ignore */
        }
        task.cancelListener = undefined
      }

      // Import compress function dynamically to avoid circular dependency
      const { compress } = await import('../compress')

      const result = await compress(task.file, {
        ...task.options,
        type: 'blob',
      })

      // Extract the actual blob from the result (compress may return MultipleCompressResults)
      const blob =
        typeof result === 'object' && 'bestResult' in result
          ? result.bestResult
          : result

      this.running.delete(task.id)
      this.completed++

      import('../utils/logger')
        .then((m) => m.default.log(`Task completed: ${task.id}`))
        .catch(() => {})
      task.resolve(blob as Blob)
    } catch (error) {
      this.running.delete(task.id)
      this.failed++
      import('../utils/logger')
        .then((m) => m.default.error(`Task failed: ${task.id}`, error))
        .catch(() => {})
      task.reject(
        error instanceof Error ? error : new Error('Compression failed'),
      )
    }

    // Continue processing queue
    this.processQueue()
  }

  // Utility: Create a promise-based compression task
  compress(file: File, options: any, priority?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const taskId = `${file.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const task: CompressionTask = {
        id: taskId,
        file,
        options,
        resolve,
        reject,
        priority,
      }

      // If caller provided an AbortSignal in options, wire it to cancel this queued task
      if (options && options.signal) {
        const sig = options.signal as AbortSignal
        const onAbort = () => {
          import('../utils/logger')
            .then((m) =>
              m.default.log(
                'compressionQueue: abort signal received for task',
                taskId,
              ),
            )
            .catch(() => {})
          // If task still in queue, remove and reject
          const removed = this.removeTask(taskId)
          if (removed) {
            import('../utils/logger')
              .then((m) =>
                m.default.log(
                  'compressionQueue: task removed from queue due to abort',
                  taskId,
                ),
              )
              .catch(() => {})
            try {
              reject(new Error('Task cancelled'))
            } catch (e) {
              /* ignore */
            }
          } else {
            import('../utils/logger')
              .then((m) =>
                m.default.log(
                  'compressionQueue: abort received but task already started or not in queue',
                  taskId,
                ),
              )
              .catch(() => {})
          }
        }

        // Attach listener and keep a cleanup function on the task
        sig.addEventListener('abort', onAbort, { once: true })
        task.cancelListener = () => {
          try {
            sig.removeEventListener('abort', onAbort)
          } catch (e) {
            /* ignore */
          }
        }
      }

      this.addTask(task)
    })
  }
}

// Export singleton instance for easy access
export const compressionQueue = CompressionQueue.getInstance()
