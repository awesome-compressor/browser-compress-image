// Compression worker system for offloading heavy computation
export interface WorkerMessage {
  id: string
  type: 'compress' | 'result' | 'error'
  data?: any
}

export interface WorkerTask {
  id: string
  file: File
  options: any
  resolve: (result: Blob) => void
  reject: (error: Error) => void
}

// Worker-compatible tools (don't use DOM APIs)
const WORKER_COMPATIBLE_TOOLS = [
  'browser-image-compression',
  'compressorjs',
  'gifsicle',
  'tinypng',
  // Note: 'canvas' and 'jsquash' use DOM APIs and aren't worker-compatible
]

// DOM-dependent tools that need main thread
const DOM_DEPENDENT_TOOLS = ['canvas', 'jsquash']

export class CompressionWorkerManager {
  private static instance: CompressionWorkerManager
  private workers: Worker[] = []
  private workerTasks: Map<string, WorkerTask> = new Map()
  private workerPool: Worker[] = []
  private workerUrls: WeakMap<Worker, string> = new WeakMap()
  private isWorkerSupported: boolean = false
  private workerScript: string | null = null
  private initPromise: Promise<void> | null = null

  private constructor() {
    this.initPromise = this.initializeWorkerSupport()
  }

  static getInstance(): CompressionWorkerManager {
    if (!CompressionWorkerManager.instance) {
      CompressionWorkerManager.instance = new CompressionWorkerManager()
    }
    return CompressionWorkerManager.instance
  }

  private async initializeWorkerSupport(): Promise<void> {
    try {
      // Check if Worker is available
      if (typeof Worker === 'undefined') {
        import('../utils/logger')
          .then((m) =>
            m.default.log('Web Workers not supported in this environment'),
          )
          .catch(() => {})
        return
      }

      // Create worker script blob
      this.workerScript = this.createWorkerScript()

      // Test worker functionality with a simple task
      await this.testWorkerSupport()

      this.isWorkerSupported = true
      import('../utils/logger')
        .then((m) =>
          m.default.log('Compression workers initialized successfully'),
        )
        .catch(() => {})
    } catch (error) {
      import('../utils/logger')
        .then((m) =>
          m.default.warn('Worker support initialization failed:', error),
        )
        .catch(() => {})
      this.isWorkerSupported = false
    }
  }

  private createWorkerScript(): string {
    return `
// Compression worker script
let compressionFunctions = null;

// Import compression tools dynamically
async function initializeTools() {
  try {
    // Real worker-side tool bootstrapping is not implemented yet.
    // Report failure so the main thread can fall back instead of
    // routing work onto a placeholder worker path.
    return false;
  } catch (error) {
  console.error('Failed to initialize compression tools in worker:', error);
    return false;
  }
}

// Handle compression requests
async function compressFile(fileData, options) {
  try {
    // Reconstruct File object from transferred data
    const file = new File([fileData.buffer], fileData.name, { type: fileData.type });
    
    // For worker-compatible tools, we need to implement compression logic here
    // This is a simplified version - in production you'd import and use actual tools
    
    // Fallback to basic compression if advanced tools aren't available
    return await basicCompress(file, options);
    
  } catch (error) {
    throw new Error('Worker compression failed: ' + error.message);
  }
}

// Basic compression fallback (simplified implementation)
async function basicCompress(file, options) {
  // This is a placeholder - real implementation would use proper compression
  // For now, just return the original file data
  const arrayBuffer = await file.arrayBuffer();
  return {
    buffer: arrayBuffer,
    size: arrayBuffer.byteLength,
    type: file.type
  };
}

// Worker message handler
self.onmessage = async function(e) {
  const { id, type, data } = e.data;
  
  try {
    if (type === 'compress') {
      const result = await compressFile(data.file, data.options);
      
      // Send result back to main thread
      self.postMessage({
        id,
        type: 'result',
        data: result
      }, [result.buffer]); // Transfer the buffer
      
    } else if (type === 'init') {
      const initialized = await initializeTools();
      self.postMessage({
        id,
        type: 'result',
        data: { initialized }
      });
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      data: { message: error.message }
    });
  }
};

console.log('Compression worker ready');
`
  }

  private async testWorkerSupport(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.workerScript) {
        reject(new Error('Worker script not created'))
        return
      }

      const blob = new Blob([this.workerScript], {
        type: 'application/javascript',
      })
      const workerUrl = URL.createObjectURL(blob)

      try {
        const testWorker = new Worker(workerUrl)
        const testId = `test_${Date.now()}`

        const cleanup = () => {
          clearTimeout(timeout)
          testWorker.terminate()
          URL.revokeObjectURL(workerUrl)
        }

        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error('Worker test timeout'))
        }, 5000)

        testWorker.onmessage = (e) => {
          const { id, type, data } = e.data

          if (id !== testId) {
            return
          }

          cleanup()

          if (type === 'result' && data?.initialized === true) {
            resolve()
            return
          }

          if (type === 'error') {
            reject(new Error(data?.message || 'Worker initialization failed'))
            return
          }

          reject(new Error('Worker initialization failed'))
        }

        testWorker.onerror = (error) => {
          cleanup()
          reject(error)
        }

        // Send test message
        testWorker.postMessage({
          id: testId,
          type: 'init',
          data: {},
        })
      } catch (error) {
        URL.revokeObjectURL(workerUrl)
        reject(error)
      }
    })
  }

  // Wait for worker initialization to complete
  async waitForInitialization(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  // Check if workers are supported and available
  isSupported(): boolean {
    return this.isWorkerSupported
  }

  // Check if a compression tool can run in worker
  isToolWorkerCompatible(toolName: string): boolean {
    return WORKER_COMPATIBLE_TOOLS.includes(toolName)
  }

  // Get tools that need main thread execution
  getDOMDependentTools(): string[] {
    return [...DOM_DEPENDENT_TOOLS]
  }

  // Compress file using worker (if supported)
  async compressInWorker(file: File, options: any): Promise<Blob> {
    if (!this.isSupported()) {
      throw new Error('Workers not supported')
    }

    return new Promise((resolve, reject) => {
      const taskId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const task: WorkerTask = {
        id: taskId,
        file,
        options,
        resolve,
        reject,
      }

      this.workerTasks.set(taskId, task)

      try {
        // Get or create worker
        const worker = this.getAvailableWorker()
        const cleanup = () => {
          worker.removeEventListener('message', messageHandler)
          worker.removeEventListener('error', errorHandler)
          this.cleanupWorker(worker)
        }

        // Setup message handler for this task
        const messageHandler = (e: MessageEvent) => {
          const { id, type, data } = e.data

          if (id === taskId) {
            this.workerTasks.delete(taskId)
            cleanup()

            if (type === 'result') {
              // Reconstruct blob from transferred data
              const blob = new Blob([data.buffer], { type: data.type })
              resolve(blob)
            } else if (type === 'error') {
              reject(new Error(data.message))
            }
          }
        }

        const errorHandler = (error: Event) => {
          this.workerTasks.delete(taskId)
          cleanup()
          reject(
            error instanceof ErrorEvent
              ? error.error || new Error(error.message)
              : new Error('Worker compression failed'),
          )
        }

        worker.addEventListener('message', messageHandler)
        worker.addEventListener('error', errorHandler)

        // Send compression task to worker
        const fileData = {
          buffer: file.arrayBuffer(),
          name: file.name,
          type: file.type,
          size: file.size,
        }

        // Wait for file buffer to be ready
        fileData.buffer.then((buffer) => {
          worker.postMessage(
            {
              id: taskId,
              type: 'compress',
              data: {
                file: {
                  buffer,
                  name: file.name,
                  type: file.type,
                  size: file.size,
                },
                options,
              },
            },
            [buffer],
          )
        })
      } catch (error) {
        this.workerTasks.delete(taskId)
        reject(error)
      }
    })
  }

  private getAvailableWorker(): Worker {
    // For simplicity, create a new worker each time
    // In production, you might want to implement a proper pool
    if (!this.workerScript) {
      throw new Error('Worker script not available')
    }

    const blob = new Blob([this.workerScript], {
      type: 'application/javascript',
    })
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)
    this.workers.push(worker)
    this.workerUrls.set(worker, workerUrl)

    return worker
  }

  private cleanupWorker(worker: Worker): void {
    this.workers = this.workers.filter(
      (activeWorker) => activeWorker !== worker,
    )
    this.workerPool = this.workerPool.filter(
      (pooledWorker) => pooledWorker !== worker,
    )

    const workerUrl = this.workerUrls.get(worker)
    this.workerUrls.delete(worker)
    worker.terminate()

    if (workerUrl) {
      URL.revokeObjectURL(workerUrl)
    }
  }

  // Clean up resources
  destroy(): void {
    this.workers.forEach((worker) => this.cleanupWorker(worker))
    this.workers = []
    this.workerTasks.clear()
  }
}

// Export singleton instance
export const compressionWorkerManager = CompressionWorkerManager.getInstance()
