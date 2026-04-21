import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('buildConversionColumn', () => {
  it('[EVAL-006] marks the T→C flow as failed when all post-conversion compressions fail', async () => {
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

    const { buildConversionColumn } =
      await import('../src/orchestrators/compareConversion')

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

  it('[EVAL-003][EVAL-004] uses the configured evaluation baseline when computing evaluationRatio', async () => {
    vi.doMock('../src/conversion', () => ({
      convertImage: vi.fn().mockResolvedValue({
        blob: new Blob(['x'.repeat(25)], { type: 'image/webp' }),
        mime: 'image/webp',
        duration: 5,
      }),
    }))

    vi.doMock('../src/utils/imageQuality', () => ({
      assessQuality: vi.fn(),
    }))

    const { buildConversionColumn } =
      await import('../src/orchestrators/compareConversion')

    const file = new File(['o'.repeat(100)], 'test.png', { type: 'image/png' })
    const baseline = new File(['b'.repeat(50)], 'baseline.webp', {
      type: 'image/webp',
    })

    const result = await buildConversionColumn({
      file,
      convertOptions: {
        targetFormat: 'webp',
      },
      evaluation: {
        baseline,
        label: 'delivery',
      },
    })

    const convertOnlyItem = result.items.find((item) => item.meta.flow === 'T')

    expect(convertOnlyItem).toEqual(
      expect.objectContaining({
        success: true,
        compressionRatio: 75,
        evaluationRatio: 50,
        evaluationLabel: 'delivery',
      }),
    )
  })

  it('[EVAL-005] attaches quality metrics against the evaluation baseline when requested', async () => {
    const assessQuality = vi.fn().mockResolvedValue({
      ssim: 0.98,
      psnr: 41.2,
    })

    vi.doMock('../src/conversion', () => ({
      convertImage: vi.fn().mockResolvedValue({
        blob: new Blob(['x'.repeat(20)], { type: 'image/webp' }),
        mime: 'image/webp',
        duration: 5,
      }),
    }))

    vi.doMock('../src/utils/imageQuality', () => ({
      assessQuality,
    }))

    const { buildConversionColumn } =
      await import('../src/orchestrators/compareConversion')

    const file = new File(['o'.repeat(100)], 'test.png', { type: 'image/png' })
    const baseline = new File(['b'.repeat(80)], 'baseline.webp', {
      type: 'image/webp',
    })

    const result = await buildConversionColumn({
      file,
      convertOptions: {
        targetFormat: 'webp',
      },
      evaluation: {
        baseline,
        includeQualityMetrics: true,
        includeHeatmap: false,
        maxDimension: 256,
      },
    })

    const convertOnlyItem = result.items.find((item) => item.meta.flow === 'T')

    expect(assessQuality).toHaveBeenCalledWith(
      baseline,
      expect.any(Blob),
      expect.objectContaining({
        includeHeatmap: false,
        maxDimension: 256,
      }),
    )
    expect(convertOnlyItem).toEqual(
      expect.objectContaining({
        success: true,
        evaluationLabel: 'baseline',
        qualityMetrics: {
          ssim: 0.98,
          psnr: 41.2,
        },
      }),
    )
  })
})
