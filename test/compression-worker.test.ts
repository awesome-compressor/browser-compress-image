import { afterEach, describe, expect, it, vi } from 'vitest'

type WorkerProbeResponse =
  | { type: 'result'; data: { initialized: boolean } }
  | { type: 'error'; data: { message: string } }

function stubWorkerProbe(response: WorkerProbeResponse) {
  const createObjectURL = vi.fn(() => 'blob:worker')
  const revokeObjectURL = vi.fn()
  const terminate = vi.fn()

  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null

    constructor(_url: string) {}

    postMessage(message: { id: string }) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            id: message.id,
            ...response,
          },
        } as MessageEvent)
      })
    }

    terminate = terminate
    addEventListener() {}
    removeEventListener() {}
  }

  vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)
  vi.stubGlobal('URL', {
    createObjectURL,
    revokeObjectURL,
  } as unknown as typeof URL)

  return {
    createObjectURL,
    revokeObjectURL,
    terminate,
  }
}

function stubWorkerLifecycle(
  compressResponse:
    | { type: 'result'; data: { buffer: ArrayBuffer; type: string } }
    | { type: 'error'; data: { message: string } },
) {
  const createObjectURL = vi.fn(() => 'blob:worker')
  const revokeObjectURL = vi.fn()
  const terminate = vi.fn()

  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    private listeners: Record<
      'message' | 'error',
      Array<(event: any) => void>
    > = {
      message: [],
      error: [],
    }

    constructor(_url: string) {}

    postMessage(message: { id: string; type: string }) {
      queueMicrotask(() => {
        if (message.type === 'init') {
          this.onmessage?.({
            data: {
              id: message.id,
              type: 'result',
              data: { initialized: true },
            },
          } as MessageEvent)
          return
        }

        if (message.type === 'compress') {
          this.listeners.message.forEach((listener) =>
            listener({
              data: {
                id: message.id,
                ...compressResponse,
              },
            } as MessageEvent),
          )
        }
      })
    }

    terminate = terminate

    addEventListener(
      type: 'message' | 'error',
      listener: (event: any) => void,
    ) {
      this.listeners[type].push(listener)
    }

    removeEventListener(
      type: 'message' | 'error',
      listener: (event: any) => void,
    ) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener)
    }
  }

  vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)
  vi.stubGlobal('URL', {
    createObjectURL,
    revokeObjectURL,
  } as unknown as typeof URL)

  return {
    createObjectURL,
    revokeObjectURL,
    terminate,
  }
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('compressionWorkerManager', () => {
  it('does not mark workers supported when init returns initialized=false', async () => {
    const url = stubWorkerProbe({
      type: 'result',
      data: { initialized: false },
    })

    const { compressionWorkerManager } = await import(
      '../src/utils/compressionWorker'
    )

    await compressionWorkerManager.waitForInitialization()

    expect(compressionWorkerManager.isSupported()).toBe(false)
    expect(url.createObjectURL).toHaveBeenCalledTimes(1)
    expect(url.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(url.terminate).toHaveBeenCalledTimes(1)
  })

  it('marks workers supported only when init confirms initialized=true', async () => {
    const url = stubWorkerProbe({
      type: 'result',
      data: { initialized: true },
    })

    const { compressionWorkerManager } = await import(
      '../src/utils/compressionWorker'
    )

    await compressionWorkerManager.waitForInitialization()

    expect(compressionWorkerManager.isSupported()).toBe(true)
    expect(url.createObjectURL).toHaveBeenCalledTimes(1)
    expect(url.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(url.terminate).toHaveBeenCalledTimes(1)
  })

  it('cleans up the worker and blob URL after a successful compression task', async () => {
    const responseBuffer = new TextEncoder().encode('worker').buffer
    const url = stubWorkerLifecycle({
      type: 'result',
      data: { buffer: responseBuffer, type: 'image/png' },
    })

    const { compressionWorkerManager } = await import(
      '../src/utils/compressionWorker'
    )

    await compressionWorkerManager.waitForInitialization()

    const file = new File(['input'], 'test.png', { type: 'image/png' })
    const result = await compressionWorkerManager.compressInWorker(file, {})

    expect(await result.text()).toBe('worker')
    expect(url.createObjectURL).toHaveBeenCalledTimes(2)
    expect(url.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(url.terminate).toHaveBeenCalledTimes(2)
  })

  it('cleans up the worker and blob URL after a failed compression task', async () => {
    const url = stubWorkerLifecycle({
      type: 'error',
      data: { message: 'boom' },
    })

    const { compressionWorkerManager } = await import(
      '../src/utils/compressionWorker'
    )

    await compressionWorkerManager.waitForInitialization()

    const file = new File(['input'], 'test.png', { type: 'image/png' })

    await expect(
      compressionWorkerManager.compressInWorker(file, {}),
    ).rejects.toThrow('boom')

    expect(url.createObjectURL).toHaveBeenCalledTimes(2)
    expect(url.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(url.terminate).toHaveBeenCalledTimes(2)
  })
})
