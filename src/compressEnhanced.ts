import type {
  CompressOptions,
  CompressResult,
  CompressResultType,
} from './types'
import convertBlobToType from './convertBlobToType'
import { compressionQueue } from './utils/compressionQueue'
import { compressionWorkerManager } from './utils/compressionWorker'

// Enhanced compression options with queue and worker support
export interface EnhancedCompressOptions extends CompressOptions {
  /**
   * Whether to use worker for compression (when available)
   * @default true
   */
  useWorker?: boolean

  /**
   * Priority for queue processing (higher = processed first)
   * @default calculated based on file size
   */
  priority?: number

  /**
   * Whether to use the compression queue for concurrency control
   * @default true
   */
  useQueue?: boolean

  /**
   * Maximum time to wait for compression (in ms)
   * @default 30000 (30 seconds)
   */
  timeout?: number
}

/**
 * Enhanced compression function with queue management and worker support
 * This is the new recommended way to compress images for better performance
 */
export async function compressEnhanced<T extends CompressResultType = 'blob'>(
  file: File,
  options: EnhancedCompressOptions = {},
): Promise<CompressResult<T>> {
  const {
    useWorker = true,
    useQueue = true,
    priority,
    timeout = 30000,
    type = 'blob' as T,
    ...compressOptions
  } = options

  // Input validation
  if (!file || !(file instanceof File)) {
    throw new Error('Invalid file input')
  }

  // For single file compression, use direct compression if queue is disabled
  if (!useQueue) {
    return (await compressDirectly(file, compressOptions, useWorker, type)) as CompressResult<T>
  }

  // Use queue for concurrency control
  const compressPromise = compressionQueue.compress(
    file,
    {
      ...compressOptions,
      useWorker,
      type: 'blob', // Always get blob from queue, convert later if needed
    },
    priority,
  )

  // Add timeout wrapper
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Compression timeout after ${timeout}ms`))
    }, timeout)
  })

  try {
    const blob = await Promise.race([compressPromise, timeoutPromise])
    return (await convertBlobToType(blob, type)) as CompressResult<T>
  }
  catch (error) {
    throw error instanceof Error ? error : new Error('Compression failed')
  }
}

/**
 * Direct compression without queue (for internal use and non-queued operations)
 */
async function compressDirectly<T extends CompressResultType>(
  file: File,
  options: CompressOptions,
  useWorker: boolean,
  type: T,
): Promise<CompressResult<T>> {
  let compressedBlob: Blob

  // Determine if we should use worker
  const shouldUseWorker
    = useWorker
      && compressionWorkerManager.isSupported()
      && canUseWorkerForFile(file, options)

  if (shouldUseWorker) {
    try {
      // Try worker compression first
      compressedBlob = await compressionWorkerManager.compressInWorker(
        file,
        options,
      )
      console.log('Used worker compression for', file.name)
    }
    catch (error) {
      console.warn(
        'Worker compression failed, falling back to main thread:',
        error,
      )
      // Fallback to main thread compression
      compressedBlob = await compressInMainThread(file, options)
    }
  }
  else {
    // Use main thread compression directly
    compressedBlob = await compressInMainThread(file, options)
  }

  return (await convertBlobToType(compressedBlob, type)) as CompressResult<T>
}

/**
 * Main thread compression using the original compress function
 */
async function compressInMainThread(
  file: File,
  options: CompressOptions,
): Promise<Blob> {
  const { compress } = await import('./compress')
  const result = await compress(file, {
    ...options,
    type: 'blob',
    returnAllResults: false, // Ensure we get a direct blob result
  })

  // Result should be Blob when returnAllResults is false
  return result as Blob
}

/**
 * Check if worker can be used for this file and options
 */
function canUseWorkerForFile(file: File, options: CompressOptions): boolean {
  // Worker limitations:
  // 1. Some tools require DOM APIs (canvas, jsquash)
  // 2. Large files might hit worker transfer limits
  // 3. EXIF preservation might require specific tools

  // Check file size (avoid transferring very large files to worker)
  const maxWorkerFileSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxWorkerFileSize) {
    console.log('File too large for worker, using main thread')
    return false
  }

  // Check if EXIF preservation is required (might limit tool choice)
  if (options.preserveExif) {
    // EXIF preservation might require specific tools that work better in main thread
    console.log(
      'EXIF preservation required, may use main thread for better compatibility',
    )
    return true // Still try worker, but tools will be filtered appropriately
  }

  return true
}

/**
 * Batch compression with enhanced queue management
 */
export async function compressEnhancedBatch(
  files: File[],
  options: EnhancedCompressOptions = {},
): Promise<CompressResult<'blob'>[]> {
  if (!files || files.length === 0) {
    return []
  }

  // Create compression promises for all files
  const compressionPromises = files.map((file, index) => {
    // Calculate priority: smaller files and earlier in list get higher priority
    const sizePriority = Math.max(
      1,
      100 - Math.floor(file.size / (1024 * 1024)),
    )
    const indexPriority = Math.max(1, files.length - index)
    const calculatedPriority
      = options.priority || Math.floor((sizePriority + indexPriority) / 2)

    return compressEnhanced(file, {
      ...options,
      priority: calculatedPriority,
      type: 'blob',
    })
  })

  // Wait for all compressions to complete
  const results = await Promise.allSettled(compressionPromises)

  // Process results and handle failures
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    else {
      console.error(
        `Compression failed for file ${files[index].name}:`,
        result.reason,
      )
      throw result.reason
    }
  })
}

/**
 * Wait for compression system initialization to complete
 */
export async function waitForCompressionInitialization(): Promise<void> {
  await compressionWorkerManager.waitForInitialization()
}

/**
 * Get compression queue statistics
 */
export function getCompressionStats() {
  return {
    queue: compressionQueue.getStats(),
    worker: {
      supported: compressionWorkerManager.isSupported(),
      domDependentTools: compressionWorkerManager.getDOMDependentTools(),
    },
  }
}

/**
 * Configure compression system
 */
export function configureCompression(config: { maxConcurrency?: number }) {
  if (config.maxConcurrency !== undefined) {
    compressionQueue.setMaxConcurrency(config.maxConcurrency)
  }
}

/**
 * Clear compression queue (cancel pending tasks)
 */
export function clearCompressionQueue() {
  compressionQueue.clearQueue()
}

// Export the enhanced compress function as the main export
export default compressEnhanced
