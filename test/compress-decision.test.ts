import { afterEach, describe, expect, it, vi } from 'vitest'

function mockBuiltInCompressors(
  implementation?: (file: File, options: { quality: number }) => Promise<Blob>,
) {
  const compressor = vi.fn().mockImplementation(
    implementation ||
      (async () => new Blob(['j'.repeat(16)], { type: 'image/jpeg' })),
  )

  vi.doMock('../src/tools/compressWithJsquash', () => ({
    default: compressor,
  }))
  vi.doMock('../src/tools/compressWithCompressorJS', () => ({
    default: compressor,
  }))
  vi.doMock('../src/tools/compressWithCanvas', () => ({
    default: compressor,
  }))
  vi.doMock('../src/tools/compressWithBrowserImageCompression', () => ({
    default: compressor,
  }))

  return compressor
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('compressDecision', () => {
  it('[DECIDE-001][DECIDE-003][DECIDE-004][AUTOFMT-008] returns the requested carrier together with decision metadata', async () => {
    mockBuiltInCompressors()

    const convertImage = vi.fn().mockResolvedValue({
      blob: new Blob(['w'.repeat(8)], { type: 'image/webp' }),
      mime: 'image/webp',
      duration: 4,
    })

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const { compressDecision } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const result = await compressDecision(file, {
      quality: 0.8,
      output: 'auto',
      type: 'file',
    })

    expect(result.result).toBeInstanceOf(File)
    expect(result.result.type).toBe('image/webp')
    expect(result.result.name).toBe('photo.webp')
    expect(result.bestTool).toBe('jsquash')
    expect(result.originalSize).toBe(1000)
    expect(result.compressedSize).toBe(8)
    expect(result.toolsUsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'jsquash',
          success: true,
        }),
      ]),
    )
    expect(result.outputDecision).toEqual(
      expect.objectContaining({
        requested: 'auto',
        selected: 'webp',
        selectedTool: 'jsquash',
        usedFallback: false,
      }),
    )
    expect(convertImage).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({
        targetFormat: 'webp',
        quality: 0.8,
      }),
    )
  })

  it('[DECIDE-002][DECIDE-004][OBJ-005] exposes objectiveDecision on the explainable single-result path', async () => {
    mockBuiltInCompressors(
      async (_file: File, options: { quality: number }) =>
        new Blob(['x'.repeat(Math.max(1, Math.round(options.quality * 100)))], {
          type: 'image/jpeg',
        }),
    )

    const { compressDecision } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const result = await compressDecision(file, {
      objective: {
        targetBytes: 75,
        goal: 'balanced',
      },
      type: 'blob',
    })

    expect(result.result).toBeInstanceOf(Blob)
    expect(result.result.size).toBe(74)
    expect(result.compressedSize).toBe(74)
    expect(result.objectiveDecision).toEqual(
      expect.objectContaining({
        goal: 'balanced',
        targetBytes: 75,
        selectedQuality: 0.74,
        selectedTool: 'jsquash',
        usedFallback: false,
        candidatesEvaluated: 3,
      }),
    )
  })
})
