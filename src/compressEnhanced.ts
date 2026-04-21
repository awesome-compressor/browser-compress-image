import type {
  CompressOptions,
  CompressResult,
  CompressResultType,
} from './types'
import convertBlobToType from './convertBlobToType'
import { compressionQueue } from './utils/compressionQueue'
import { compressionWorkerManager } from './utils/compressionWorker'
import { preprocessImage } from './utils/preprocessImage'
import type { PreprocessOptions } from './types'
import logger from './utils/logger'

export type CompressionJobStage =
  | 'queued'
  | 'preprocessing'
  | 'compressing'
  | 'converting'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface CompressionJobMetrics {
  originalSize: number
  compressedSize?: number
  startedAt?: number
  finishedAt?: number
  durationMs?: number
}

export interface CompressionJob<T = Blob> {
  id: string
  readonly status: CompressionJobStage
  promise: Promise<T>
  cancel: () => void
  retry: () => CompressionJob<T>
  onProgress: (listener: (progress: number) => void) => () => void
  onStageChange: (listener: (stage: CompressionJobStage) => void) => () => void
  onMetrics: (listener: (metrics: CompressionJobMetrics) => void) => () => void
}

// Enhanced compression options with queue and worker support
export interface EnhancedCompressOptions extends CompressOptions {
  /**
   * Whether to attempt worker compression.
   * Experimental and disabled by default until worker-side compression is fully implemented.
   * @default false
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

  /**
   * Optional preprocessing before compression (crop/rotate/flip/resize)
   */
  preprocess?: PreprocessOptions
}

/**
 * Enhanced compression function with queue management.
 * Queue-backed compression is the recommended default; worker compression remains opt-in.
 */
export async function compressEnhanced<T extends CompressResultType = 'blob'>(
  file: File,
  options: EnhancedCompressOptions & { type?: T } = {},
): Promise<CompressResult<T>> {
  const {
    useWorker = false,
    useQueue = true,
    priority,
    timeout = 30000,
    type = 'blob' as T,
    preprocess,
    ...compressOptions
  } = options

  // Input validation
  if (!file || !(file instanceof File)) {
    throw new Error('Invalid file input')
  }

  const compressionFile = await prepareCompressionFile(file, preprocess)
  const blob = await runBlobCompression(compressionFile, compressOptions, {
    useQueue,
    priority,
    timeout,
    useWorker,
  })

  try {
    return (await convertBlobToType(blob, type, file.name)) as CompressResult<T>
  } catch (error) {
    throw error instanceof Error ? error : new Error('Compression failed')
  }
}

export function compressJob<T extends CompressResultType = 'blob'>(
  file: File,
  options: EnhancedCompressOptions & { type?: T } = {},
): CompressionJob<CompressResult<T>> {
  if (!file || !(file instanceof File)) {
    throw new Error('Invalid file input')
  }

  const {
    useWorker = false,
    useQueue = true,
    priority,
    timeout = 30000,
    type = 'blob' as T,
    preprocess,
    signal: externalSignal,
    ...compressOptions
  } = options

  const jobId = createCompressionJobId(file)
  const startedAt = Date.now()
  const abortController = new AbortController()
  const initialStage: CompressionJobStage = preprocess
    ? 'preprocessing'
    : useQueue
      ? 'queued'
      : 'compressing'

  let status: CompressionJobStage = initialStage
  let progress = getProgressForStage(initialStage, 0)
  let metrics: CompressionJobMetrics = {
    originalSize: file.size,
    startedAt,
  }

  const progressListeners = new Set<(progress: number) => void>()
  const stageListeners = new Set<(stage: CompressionJobStage) => void>()
  const metricsListeners = new Set<
    (nextMetrics: CompressionJobMetrics) => void
  >()

  const emitProgress = () => {
    for (const listener of progressListeners) {
      try {
        listener(progress)
      } catch {}
    }
  }

  const emitStage = () => {
    for (const listener of stageListeners) {
      try {
        listener(status)
      } catch {}
    }
  }

  const emitMetrics = () => {
    const snapshot = { ...metrics }
    for (const listener of metricsListeners) {
      try {
        listener(snapshot)
      } catch {}
    }
  }

  const setStage = (nextStage: CompressionJobStage) => {
    if (status === nextStage) {
      return
    }

    status = nextStage
    progress = getProgressForStage(nextStage, progress)
    emitStage()
    emitProgress()
  }

  const setMetrics = (nextMetrics: Partial<CompressionJobMetrics>) => {
    metrics = {
      ...metrics,
      ...nextMetrics,
    }
    emitMetrics()
  }

  const syncExternalAbort = () => abortController.abort()

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort()
    } else {
      externalSignal.addEventListener('abort', syncExternalAbort, {
        once: true,
      })
    }
  }

  const promise = (async () => {
    try {
      const compressionFile = await prepareCompressionFile(file, preprocess)

      if (useQueue) {
        setStage('queued')
      } else {
        setStage('compressing')
      }

      const blob = await runBlobCompression(
        compressionFile,
        {
          ...compressOptions,
          signal: abortController.signal,
        },
        {
          useQueue,
          priority,
          timeout,
          useWorker,
          onQueued: () => setStage('queued'),
          onCompressing: () => setStage('compressing'),
        },
      )

      setStage('converting')

      const result = (await convertBlobToType(
        blob,
        type,
        file.name,
      )) as CompressResult<T>
      const finishedAt = Date.now()

      setMetrics({
        compressedSize: blob.size,
        finishedAt,
        durationMs: finishedAt - startedAt,
      })
      setStage('done')

      return result
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error('Compression failed')
      const finishedAt = Date.now()

      setMetrics({
        finishedAt,
        durationMs: finishedAt - startedAt,
      })
      setStage(isCancellationError(normalizedError) ? 'cancelled' : 'failed')

      throw normalizedError
    } finally {
      if (externalSignal) {
        try {
          externalSignal.removeEventListener('abort', syncExternalAbort)
        } catch {}
      }
    }
  })()

  return {
    id: jobId,
    get status() {
      return status
    },
    promise,
    cancel() {
      abortController.abort()
    },
    retry() {
      return compressJob<T>(file, options)
    },
    onProgress(listener) {
      progressListeners.add(listener)
      listener(progress)
      return () => {
        progressListeners.delete(listener)
      }
    },
    onStageChange(listener) {
      stageListeners.add(listener)
      listener(status)
      return () => {
        stageListeners.delete(listener)
      }
    },
    onMetrics(listener) {
      metricsListeners.add(listener)
      listener({ ...metrics })
      return () => {
        metricsListeners.delete(listener)
      }
    },
  }
}

async function prepareCompressionFile(
  file: File,
  preprocess?: PreprocessOptions,
): Promise<File> {
  if (!preprocess) {
    return file
  }

  let inputForCompression: File | Blob = file

  try {
    let guessedOutType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png'
    if (preprocess.outputType) {
      guessedOutType = preprocess.outputType
    } else if (/jpe?g/i.test(file.type)) {
      guessedOutType = 'image/jpeg'
    } else if (/png/i.test(file.type)) {
      guessedOutType = 'image/png'
    } else if (/webp/i.test(file.type)) {
      guessedOutType = 'image/webp'
    }

    const pre = await preprocessImage(file, {
      ...preprocess,
      outputType: guessedOutType,
    })
    inputForCompression = pre.blob
  } catch (error) {
    logger.warn('Preprocess failed, fallback to original file:', error)
  }

  return inputForCompression instanceof File
    ? inputForCompression
    : new File([inputForCompression], file.name, {
        type: inputForCompression.type,
      })
}

async function runBlobCompression(
  file: File,
  options: CompressOptions,
  execution: {
    useQueue: boolean
    priority?: number
    timeout: number
    useWorker: boolean
    onQueued?: () => void
    onCompressing?: () => void
  },
): Promise<Blob> {
  const { useQueue, priority, timeout, useWorker, onQueued, onCompressing } =
    execution

  const compressPromise = useQueue
    ? (() => {
        onQueued?.()
        return compressionQueue.compress(
          file,
          {
            ...options,
            useWorker,
            type: 'blob',
          },
          priority,
          (queuedFile, queuedOptions) => {
            onCompressing?.()
            return compressBlob(queuedFile, queuedOptions, useWorker)
          },
        )
      })()
    : (() => {
        onCompressing?.()
        return compressBlob(file, options, useWorker)
      })()

  return raceWithTimeout(compressPromise, timeout)
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Compression timeout after ${timeout}ms`))
        }, timeout)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

function createCompressionJobId(file: File): string {
  return `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function getProgressForStage(
  stage: CompressionJobStage,
  currentProgress: number,
): number {
  switch (stage) {
    case 'queued':
      return 0.1
    case 'preprocessing':
      return 0.2
    case 'compressing':
      return 0.7
    case 'converting':
      return 0.9
    case 'done':
      return 1
    case 'failed':
    case 'cancelled':
      return currentProgress
    default:
      return currentProgress
  }
}

function isCancellationError(error: Error): boolean {
  return /cancelled|aborted/i.test(error.message)
}

async function compressBlob(
  file: File,
  options: CompressOptions,
  useWorker: boolean,
): Promise<Blob> {
  const shouldUseWorker =
    useWorker &&
    compressionWorkerManager.isSupported() &&
    canUseWorkerForFile(file, options)

  if (!shouldUseWorker) {
    return compressInMainThread(file, options)
  }

  try {
    const compressedBlob = await compressionWorkerManager.compressInWorker(
      file,
      options,
    )
    logger.log('Used worker compression for', file.name)
    return compressedBlob
  } catch (error) {
    logger.warn(
      'Worker compression failed, falling back to main thread:',
      error,
    )
    return compressInMainThread(file, options)
  }
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
    logger.log('File too large for worker, using main thread')
    return false
  }

  // Check if EXIF preservation is required (might limit tool choice)
  if (options.preserveExif) {
    // EXIF preservation might require specific tools that work better in main thread
    logger.log(
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
    const calculatedPriority =
      options.priority || Math.floor((sizePriority + indexPriority) / 2)

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
    } else {
      logger.error(
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
