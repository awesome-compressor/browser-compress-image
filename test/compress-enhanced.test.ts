import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressEnhanced } from '../src/compressEnhanced'
import { compressionQueue } from '../src/utils/compressionQueue'
import { compressionWorkerManager } from '../src/utils/compressionWorker'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('compressEnhanced', () => {
  it('defaults to main-thread compression when useWorker is omitted', async () => {
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

  it('routes queued compression through the worker-aware executor', async () => {
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
})
