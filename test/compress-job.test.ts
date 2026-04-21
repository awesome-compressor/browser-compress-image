import { afterEach, describe, expect, it, vi } from 'vitest'

const { compressMock } = vi.hoisted(() => {
  return {
    compressMock: vi.fn(async () => {
      return new Blob(['job-result'], { type: 'image/png' })
    }),
  }
})

vi.mock('../src/compress', () => {
  return {
    compress: compressMock,
  }
})

import { clearCompressionQueue, compressJob } from '../src/compressEnhanced'
import { compressionQueue } from '../src/utils/compressionQueue'

afterEach(() => {
  clearCompressionQueue()
  vi.restoreAllMocks()
  compressMock.mockReset()
  compressMock.mockResolvedValue(
    new Blob(['job-result'], { type: 'image/png' }),
  )
})

describe('compressJob', () => {
  it('[JOB-001][JOB-003][JOB-005][JOB-008] exposes a stable handle and emits lifecycle events for queued work', async () => {
    vi.spyOn(compressionQueue, 'compress').mockImplementation(
      (file, options, priority, execute) => {
        expect(priority).toBeUndefined()
        expect(options).toEqual(
          expect.objectContaining({
            quality: 0.6,
            mode: 'keepSize',
            useWorker: false,
            type: 'blob',
          }),
        )
        return execute!(file, options)
      },
    )

    const file = new File(['queued-work'], 'queued.png', {
      type: 'image/png',
    })

    const job = compressJob(file, {
      quality: 0.6,
      mode: 'keepSize',
      useQueue: true,
      type: 'blob',
    })

    const stages: string[] = []
    const progressValues: number[] = []
    const metricsSnapshots: Array<Record<string, number | undefined>> = []

    job.onStageChange((stage) => {
      stages.push(stage)
    })
    job.onProgress((progress) => {
      progressValues.push(progress)
    })
    job.onMetrics((metrics) => {
      metricsSnapshots.push({
        originalSize: metrics.originalSize,
        compressedSize: metrics.compressedSize,
        startedAt: metrics.startedAt,
        finishedAt: metrics.finishedAt,
        durationMs: metrics.durationMs,
      })
    })

    const result = await job.promise

    expect(job.id).toContain('queued.png')
    expect(stages).toEqual(['queued', 'compressing', 'converting', 'done'])
    expect(progressValues[0]).toBe(0.1)
    expect(progressValues).toContain(0.7)
    expect(progressValues).toContain(0.9)
    expect(progressValues.at(-1)).toBe(1)
    expect(metricsSnapshots[0]).toEqual(
      expect.objectContaining({
        originalSize: file.size,
        compressedSize: undefined,
      }),
    )
    expect(metricsSnapshots.at(-1)).toEqual(
      expect.objectContaining({
        originalSize: file.size,
        compressedSize: 10,
      }),
    )
    expect(await result.text()).toBe('job-result')
  })

  it('[JOB-005] best-effort cancel rejects pending work and moves the job to cancelled', async () => {
    vi.spyOn(compressionQueue, 'compress').mockImplementation(
      (_file, options) => {
        return new Promise<Blob>((_resolve, reject) => {
          const signal = options.signal as AbortSignal

          if (signal.aborted) {
            reject(new Error('Task cancelled'))
            return
          }

          signal.addEventListener(
            'abort',
            () => reject(new Error('Task cancelled')),
            { once: true },
          )
        })
      },
    )

    const file = new File(['pending-work'], 'pending.png', {
      type: 'image/png',
    })
    const job = compressJob(file, {
      quality: 0.6,
      mode: 'keepSize',
      useQueue: true,
    })

    const stages: string[] = []
    job.onStageChange((stage) => {
      stages.push(stage)
    })

    job.cancel()

    await expect(job.promise).rejects.toThrow('Task cancelled')
    expect(job.status).toBe('cancelled')
    expect(stages).toEqual(['queued', 'cancelled'])
  })

  it('[JOB-006] retry creates a new job with a new id and reuses the original input/options', async () => {
    vi.spyOn(compressionQueue, 'compress').mockImplementation(
      (file, options, priority, execute) => {
        expect(priority).toBeUndefined()
        return execute!(file, options)
      },
    )

    const file = new File(['retry-work'], 'retry.png', {
      type: 'image/png',
    })
    const job = compressJob(file, {
      quality: 0.6,
      mode: 'keepSize',
      useQueue: true,
    })

    await expect(job.promise).resolves.toBeInstanceOf(Blob)

    const retriedJob = job.retry()

    expect(retriedJob.id).not.toBe(job.id)
    await expect(retriedJob.promise).resolves.toBeInstanceOf(Blob)
    expect(compressMock).toHaveBeenCalledTimes(2)
  })

  it("[CORE-003][JOB-001] preserves the original basename on `type: 'file'` job results", async () => {
    compressMock.mockResolvedValue(
      new Blob(['job-result'], { type: 'image/webp' }),
    )

    vi.spyOn(compressionQueue, 'compress').mockImplementation(
      (file, options, priority, execute) => {
        expect(priority).toBeUndefined()
        return execute!(file, options)
      },
    )

    const file = new File(['queued-work'], 'queued.png', {
      type: 'image/png',
    })

    const job = compressJob(file, {
      quality: 0.6,
      mode: 'keepSize',
      useQueue: true,
      type: 'file',
    })

    const result = await job.promise

    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('queued.webp')
  })
})
