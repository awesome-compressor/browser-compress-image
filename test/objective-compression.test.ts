import { afterEach, describe, expect, it, vi } from 'vitest'

function mockBuiltInCompressors(
  implementation?: (file: File, options: { quality: number }) => Promise<Blob>,
) {
  const compressor = vi.fn().mockImplementation(
    implementation ||
      (async (_file: File, options: { quality: number }) =>
        new Blob(['x'.repeat(Math.max(1, Math.round(options.quality * 100)))], {
          type: 'image/jpeg',
        })),
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

describe('objective compression', () => {
  it('[OBJ-001][OBJ-003][OBJ-005] compress selects the first passing balanced candidate and returns objectiveDecision', async () => {
    mockBuiltInCompressors()

    const { compress } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const result = await compress(file, {
      objective: {
        targetBytes: 75,
        goal: 'balanced',
      },
      returnAllResults: true,
      type: 'blob',
    })

    expect(result.bestResult).toBeInstanceOf(Blob)
    expect((result.bestResult as Blob).size).toBe(74)
    expect(result.bestTool).toBe('jsquash')
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

  it('[OBJ-003][OBJ-005] compressWithStats falls back to the smallest candidate when targetBytes cannot be met', async () => {
    mockBuiltInCompressors()

    const { compressWithStats } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const result = await compressWithStats(file, {
      objective: {
        targetBytes: 10,
        goal: 'balanced',
      },
    })

    expect(result.compressedSize).toBe(34)
    expect(result.bestTool).toBe('jsquash')
    expect(result.objectiveDecision).toEqual(
      expect.objectContaining({
        selectedQuality: 0.34,
        usedFallback: true,
        candidatesEvaluated: 8,
      }),
    )
  })

  it('[OBJ-003] fastest goal chooses an earlier acceptable candidate than balanced', async () => {
    mockBuiltInCompressors()

    const { compressWithStats } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const fastest = await compressWithStats(file, {
      objective: {
        targetBytes: 75,
        goal: 'fastest',
      },
    })
    const balanced = await compressWithStats(file, {
      objective: {
        targetBytes: 75,
        goal: 'balanced',
      },
    })

    expect(fastest.objectiveDecision).toEqual(
      expect.objectContaining({
        selectedQuality: 0.72,
      }),
    )
    expect(balanced.objectiveDecision).toEqual(
      expect.objectContaining({
        selectedQuality: 0.74,
      }),
    )
  })

  it('[OBJ-001] compressWithTools rejects objective mode explicitly', async () => {
    const { ToolRegistry, compressWithTools } =
      await import('../src/compressWithTools')

    const registry = new ToolRegistry()
    registry.registerTool(
      'browser-image-compression',
      vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' })),
      ['jpeg'],
    )

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    await expect(
      compressWithTools(file, {
        objective: {
          targetBytes: 50,
        },
        toolRegistry: registry,
      }),
    ).rejects.toThrow(
      'objective mode is currently supported only on compress(), compressDecision(), compressWithStats(), compressEnhanced(), and compressJob().',
    )
  })

  it('[OBJ-008] rejects when objective.targetBytes is not positive', async () => {
    const { compressWithStats } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    await expect(
      compressWithStats(file, {
        objective: {
          targetBytes: 0,
        },
      }),
    ).rejects.toThrow('objective.targetBytes must be a positive number.')
  })
})
