import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolRegistry, compressWithTools } from '../src/compressWithTools'
import { resolveResizeDimensions } from '../src/utils/resize'

function stubImageDimensions(width: number, height: number) {
  class MockImage {
    width = width
    height = height
    onload: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    crossOrigin = ''

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.(new Event('load'))
      })
    }
  }

  vi.stubGlobal('Image', MockImage)
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('resize regressions', () => {
  it('keeps aspect ratio for a single target dimension', () => {
    expect(
      resolveResizeDimensions(400, 200, {
        targetWidth: 100,
      }),
    ).toEqual({ width: 100, height: 50 })
  })

  it('applies max bounds without upscaling', () => {
    expect(
      resolveResizeDimensions(400, 200, {
        maxWidth: 100,
        maxHeight: 100,
      }),
    ).toEqual({ width: 100, height: 50 })

    expect(
      resolveResizeDimensions(400, 200, {
        maxWidth: 1000,
      }),
    ).toEqual({ width: 400, height: 200 })
  })
})

describe('adapter regressions', () => {
  it('fails jsquash explicitly outside browser runtimes', async () => {
    const { default: compressWithJsquash } = await import(
      '../src/tools/compressWithJsquash'
    )

    const file = new File(['x'.repeat(1000)], 'test.jpg', {
      type: 'image/jpeg',
    })

    await expect(
      compressWithJsquash(file, {
        quality: 0.8,
        mode: 'keepSize',
      }),
    ).rejects.toThrow('JSQuash requires a browser environment')
  })

  it('passes a finite resize bound to browser-image-compression for one-sided resize', async () => {
    stubImageDimensions(400, 200)

    const imageCompression = vi
      .fn()
      .mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))

    vi.doMock('browser-image-compression', () => ({
      default: imageCompression,
    }))

    const { default: compressWithBrowserImageCompression } = await import(
      '../src/tools/compressWithBrowserImageCompression'
    )

    const file = new File(['x'.repeat(1000)], 'test.jpg', {
      type: 'image/jpeg',
    })

    await compressWithBrowserImageCompression(file, {
      quality: 0.8,
      mode: 'keepQuality',
      maxWidth: 100,
    })

    expect(imageCompression).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        maxWidthOrHeight: 100,
      }),
    )
  })

  it('uses proportional resize-fit for a single target GIF dimension', async () => {
    stubImageDimensions(400, 200)

    vi.doMock('gifsicle-wasm-browser', () => ({
      default: {
        run: vi
          .fn()
          .mockResolvedValue([new Blob(['x'], { type: 'image/gif' })]),
      },
    }))

    const gifsicle = await import('gifsicle-wasm-browser')
    const { default: compressWithGifsicle } = await import(
      '../src/tools/compressWithGifsicle'
    )

    const file = new File(['x'.repeat(1000)], 'test.gif', {
      type: 'image/gif',
    })

    await compressWithGifsicle(file, {
      quality: 0.8,
      mode: 'keepQuality',
      targetWidth: 100,
    })

    expect(vi.mocked(gifsicle.default.run)).toHaveBeenCalledWith(
      expect.objectContaining({
        command: [expect.stringContaining('--resize-fit 100x50')],
      }),
    )
  })

  it('uses bounded proportional resize-fit for single-axis GIF max constraints', async () => {
    stubImageDimensions(400, 200)

    vi.doMock('gifsicle-wasm-browser', () => ({
      default: {
        run: vi
          .fn()
          .mockResolvedValue([new Blob(['x'], { type: 'image/gif' })]),
      },
    }))

    const gifsicle = await import('gifsicle-wasm-browser')
    const { default: compressWithGifsicle } = await import(
      '../src/tools/compressWithGifsicle'
    )

    const file = new File(['x'.repeat(1000)], 'test.gif', {
      type: 'image/gif',
    })

    await compressWithGifsicle(file, {
      quality: 0.8,
      mode: 'keepQuality',
      maxWidth: 100,
    })

    expect(vi.mocked(gifsicle.default.run)).toHaveBeenCalledWith(
      expect.objectContaining({
        command: [expect.stringContaining('--resize-fit 100x50')],
      }),
    )
  })
})

describe('multi-tool regressions', () => {
  it('keeps healthy registered tools running when one tool fails', async () => {
    const registry = new ToolRegistry()

    registry.registerTool(
      'canvas',
      vi.fn().mockRejectedValue(new Error('boom')),
      ['png'],
    )
    registry.registerTool(
      'browser-image-compression',
      vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return new Blob(['ok'], { type: 'image/png' })
      }),
      ['png'],
    )

    const file = new File(['x'.repeat(1000)], 'test.png', {
      type: 'image/png',
    })

    const result = await compressWithTools(file, {
      quality: 0.6,
      mode: 'keepSize',
      toolRegistry: registry,
    })

    expect(await result.text()).toBe('ok')
  })

  it('keeps the main compress race alive when one tool fails', async () => {
    vi.doMock('../src/tools/compressWithCanvas', () => ({
      default: vi.fn().mockRejectedValue(new Error('boom')),
    }))
    vi.doMock('../src/tools/compressWithBrowserImageCompression', () => ({
      default: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return new Blob(['ok'], { type: 'image/webp' })
      }),
    }))

    const { compress } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'test.webp', {
      type: 'image/webp',
    })

    const result = await compress(file, {
      quality: 0.6,
      mode: 'keepSize',
    })

    expect(await result.text()).toBe('ok')
  })
})

describe('cache regressions', () => {
  it('does not reuse a cached result for different files with identical metadata', async () => {
    const gifsicleCompressor = vi
      .fn()
      .mockImplementation(async (file: File) => {
        const text = await file.text()
        return new Blob([text.slice(0, 1)], { type: file.type })
      })

    vi.doMock('../src/tools/compressWithGifsicle', () => ({
      default: gifsicleCompressor,
    }))

    const { compress } = await import('../src/compress')

    const fileA = new File(['AAAA'], 'same.gif', {
      type: 'image/gif',
      lastModified: 1,
    })
    const fileB = new File(['BBBB'], 'same.gif', {
      type: 'image/gif',
      lastModified: 1,
    })

    const resultA = await compress(fileA, {
      quality: 0.6,
      mode: 'keepSize',
    })
    const resultB = await compress(fileB, {
      quality: 0.6,
      mode: 'keepSize',
    })

    expect(await resultA.text()).toBe('A')
    expect(await resultB.text()).toBe('B')
    expect(gifsicleCompressor).toHaveBeenCalledTimes(2)
  })
})
