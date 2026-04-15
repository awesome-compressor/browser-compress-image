import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('buildConversionColumn', () => {
  it('marks the T→C flow as failed when all post-conversion compressions fail', async () => {
    vi.doMock('../src/conversion', () => ({
      convertImage: vi.fn().mockResolvedValue({
        blob: new Blob(['converted'], { type: 'image/webp' }),
        mime: 'image/webp',
        duration: 5,
      }),
    }))

    const compress = vi
      .fn()
      .mockResolvedValueOnce({
        allResults: [
          {
            tool: 'canvas',
            result: new Blob(['ok'], { type: 'image/webp' }),
            compressedSize: 10,
            duration: 3,
            success: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        allResults: [
          {
            tool: 'canvas',
            result: new Blob(['failed'], { type: 'image/webp' }),
            compressedSize: 20,
            duration: 4,
            success: false,
            error: 'boom',
          },
          {
            tool: 'browser-image-compression',
            result: new Blob(['failed-2'], { type: 'image/webp' }),
            compressedSize: 18,
            duration: 5,
            success: false,
            error: 'still boom',
          },
        ],
      })

    vi.doMock('../src/compress', () => ({
      compress,
    }))

    const { buildConversionColumn } = await import(
      '../src/orchestrators/compareConversion'
    )

    const file = new File(['original'], 'test.png', { type: 'image/png' })
    const result = await buildConversionColumn({
      file,
      compressOptions: {
        quality: 0.7,
        mode: 'keepSize',
        returnAllResults: true,
      },
      convertOptions: {
        targetFormat: 'webp',
      },
    })

    const tToCItem = result.items.find((item) => item.meta.flow === 'T→C')

    expect(tToCItem).toEqual(
      expect.objectContaining({
        success: false,
        error: 'boom',
      }),
    )
  })
})
