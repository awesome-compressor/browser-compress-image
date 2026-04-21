import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCompressionQueue,
  compressEnhanced,
  compressEnhancedBatch,
  configureCompression,
  getCompressionStats,
  waitForCompressionInitialization,
} from '../src/compressEnhanced'
import { compressionQueue } from '../src/utils/compressionQueue'
import { compressionWorkerManager } from '../src/utils/compressionWorker'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('compressEnhanced', () => {
  it('[WORKER-006][WORKER-014] defaults to queue-backed main-thread compression when useWorker is omitted', async () => {
    const mainThreadResult = new Blob(['main'], { type: 'image/png' })

    const queueCompress = vi
      .spyOn(compressionQueue, 'compress')
      .mockImplementation((file, options, priority) => {
        expect(priority).toBeUndefined()
        expect(options).toEqual(
          expect.objectContaining({
            quality: 0.6,
            mode: 'keepSize',
            useWorker: false,
            type: 'blob',
          }),
        )
        return Promise.resolve(mainThreadResult)
      })

    const workerSupport = vi.spyOn(compressionWorkerManager, 'isSupported')
    const workerCompress = vi.spyOn(
      compressionWorkerManager,
      'compressInWorker',
    )

    const file = new File(['x'.repeat(1000)], 'test.png', {
      type: 'image/png',
    })

    const result = await compressEnhanced(file, {
      quality: 0.6,
      mode: 'keepSize',
      useQueue: true,
    })

    expect(queueCompress).toHaveBeenCalled()
    expect(workerSupport).not.toHaveBeenCalled()
    expect(workerCompress).not.toHaveBeenCalled()
    expect(await result.text()).toBe('main')
  })

  it('[WORKER-014][WORKER-016] routes queued compression through the worker-aware executor', async () => {
    const workerResult = new Blob(['worker'], { type: 'image/png' })

    const queueCompress = vi
      .spyOn(compressionQueue, 'compress')
      .mockImplementation((file, options, priority, execute) => {
        expect(priority).toBeUndefined()
        expect(execute).toEqual(expect.any(Function))
        return execute!(file, options)
      })

    const workerSupport = vi
      .spyOn(compressionWorkerManager, 'isSupported')
      .mockReturnValue(true)
    const workerCompress = vi
      .spyOn(compressionWorkerManager, 'compressInWorker')
      .mockResolvedValue(workerResult)

    const file = new File(['x'.repeat(1000)], 'test.png', {
      type: 'image/png',
    })

    const result = await compressEnhanced(file, {
      quality: 0.6,
      mode: 'keepSize',
      useQueue: true,
      useWorker: true,
    })

    expect(queueCompress).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        quality: 0.6,
        mode: 'keepSize',
        useWorker: true,
        type: 'blob',
      }),
      undefined,
      expect.any(Function),
    )
    expect(workerSupport).toHaveBeenCalled()
    expect(workerCompress).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        quality: 0.6,
        mode: 'keepSize',
      }),
    )
    expect(await result.text()).toBe('worker')
  })

  it("[CORE-003] preserves the original basename on `type: 'file'` results", async () => {
    vi.spyOn(compressionQueue, 'compress').mockResolvedValue(
      new Blob(['converted'], { type: 'image/webp' }),
    )

    const file = new File(['x'.repeat(1000)], 'test.png', {
      type: 'image/png',
    })

    const result = await compressEnhanced(file, {
      quality: 0.6,
      mode: 'keepSize',
      type: 'file',
    })

    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('test.webp')
  })

  it('[WORKER-007][WORKER-017] getCompressionStats exposes queue and worker state', () => {
    vi.spyOn(compressionQueue, 'getStats').mockReturnValue({
      pending: 2,
      running: 1,
      completed: 3,
      failed: 4,
      maxConcurrency: 5,
    })
    vi.spyOn(compressionWorkerManager, 'isSupported').mockReturnValue(true)
    vi.spyOn(compressionWorkerManager, 'getDOMDependentTools').mockReturnValue([
      'canvas',
      'jsquash',
    ])

    expect(getCompressionStats()).toEqual({
      queue: {
        pending: 2,
        running: 1,
        completed: 3,
        failed: 4,
        maxConcurrency: 5,
      },
      worker: {
        supported: true,
        domDependentTools: ['canvas', 'jsquash'],
      },
    })
  })

  it('[WORKER-001] waitForCompressionInitialization delegates to the worker support probe', async () => {
    const waitSpy = vi
      .spyOn(compressionWorkerManager, 'waitForInitialization')
      .mockResolvedValue(undefined)

    await expect(waitForCompressionInitialization()).resolves.toBeUndefined()
    expect(waitSpy).toHaveBeenCalledTimes(1)
  })

  it('[WORKER-009] configureCompression clamps queue concurrency through the shared queue', () => {
    const originalMaxConcurrency = getCompressionStats().queue.maxConcurrency

    try {
      configureCompression({ maxConcurrency: 99 })
      expect(getCompressionStats().queue.maxConcurrency).toBe(10)

      configureCompression({ maxConcurrency: 0 })
      expect(getCompressionStats().queue.maxConcurrency).toBe(1)
    } finally {
      configureCompression({ maxConcurrency: originalMaxConcurrency })
    }
  })

  it('[WORKER-013] rejects when the top-level compressEnhanced timeout expires', async () => {
    vi.useFakeTimers()

    vi.spyOn(compressionQueue, 'compress').mockReturnValue(
      new Promise(() => {}),
    )

    const file = new File(['x'.repeat(1000)], 'test.png', {
      type: 'image/png',
    })

    const resultPromise = compressEnhanced(file, {
      quality: 0.6,
      mode: 'keepSize',
      timeout: 25,
    })
    const assertion = expect(resultPromise).rejects.toThrow(
      'Compression timeout after 25ms',
    )

    await vi.advanceTimersByTimeAsync(25)

    await assertion
  })

  it('[WORKER-010] clearCompressionQueue rejects pending tasks without force-stopping running work', async () => {
    clearCompressionQueue()

    const originalMaxConcurrency = getCompressionStats().queue.maxConcurrency
    configureCompression({ maxConcurrency: 1 })

    let resolveRunning!: (blob: Blob) => void
    let runningSettled = false

    try {
      const runningFile = new File(['running'], 'running.png', {
        type: 'image/png',
      })
      const pendingFile = new File(['pending'], 'pending.png', {
        type: 'image/png',
      })

      const runningPromise = compressionQueue.compress(
        runningFile,
        {},
        10,
        () =>
          new Promise<Blob>((resolve) => {
            resolveRunning = resolve
          }),
      )
      void runningPromise.finally(() => {
        runningSettled = true
      })

      const pendingPromise = compressionQueue.compress(
        pendingFile,
        {},
        1,
        async () => new Blob(['pending-result'], { type: 'image/png' }),
      )

      await Promise.resolve()

      expect(getCompressionStats().queue.running).toBeGreaterThanOrEqual(1)
      expect(getCompressionStats().queue.pending).toBeGreaterThanOrEqual(1)

      clearCompressionQueue()

      await expect(pendingPromise).rejects.toThrow(
        'Task cancelled: queue cleared',
      )

      await Promise.resolve()
      expect(runningSettled).toBe(false)

      resolveRunning(new Blob(['running-result'], { type: 'image/png' }))
      await expect(runningPromise).resolves.toBeInstanceOf(Blob)
    } finally {
      clearCompressionQueue()
      configureCompression({ maxConcurrency: originalMaxConcurrency })
    }
  })

  it('[WORKER-018] returns an empty array for an empty batch', async () => {
    await expect(compressEnhancedBatch([])).resolves.toEqual([])
  })

  it('[WORKER-018] rejects a batch after settled per-file failures', async () => {
    const failure = new Error('boom')

    vi.spyOn(compressionQueue, 'compress').mockImplementation((file) => {
      if (file.name === 'bad.png') {
        return Promise.reject(failure)
      }

      return Promise.resolve(new Blob(['ok'], { type: 'image/png' }))
    })

    const files = [
      new File(['good'], 'good.png', { type: 'image/png' }),
      new File(['bad'], 'bad.png', { type: 'image/png' }),
    ]

    await expect(
      compressEnhancedBatch(files, {
        quality: 0.6,
        mode: 'keepSize',
      }),
    ).rejects.toThrow('boom')
  })
})
