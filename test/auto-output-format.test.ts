import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('auto output format', () => {
  it('[AUTOFMT-001][CORE-003] converts explicit output formats and updates file extensions', async () => {
    const convertImage = vi.fn().mockResolvedValue({
      blob: new Blob(['converted-webp'], { type: 'image/webp' }),
      mime: 'image/webp',
      duration: 5,
    })

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const { ToolRegistry, compressWithTools } =
      await import('../src/compressWithTools')

    const registry = new ToolRegistry()
    registry.registerTool(
      'browser-image-compression',
      vi
        .fn()
        .mockResolvedValue(
          new Blob(['compressed-jpeg'], { type: 'image/jpeg' }),
        ),
      ['jpeg'],
    )

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const result = await compressWithTools(file, {
      quality: 0.8,
      mode: 'keepSize',
      output: 'webp',
      type: 'file',
      toolRegistry: registry,
    })

    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('photo.webp')
    expect(convertImage).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({
        targetFormat: 'webp',
        quality: 0.8,
      }),
    )
  })

  it('[AUTOFMT-007] auto output picks the smallest successful candidate and exposes a decision summary', async () => {
    const convertImage = vi.fn().mockImplementation(async (_blob, options) => {
      if (options.targetFormat === 'webp') {
        return {
          blob: new Blob(['w'.repeat(8)], { type: 'image/webp' }),
          mime: 'image/webp',
          duration: 4,
        }
      }

      if (options.targetFormat === 'png') {
        return {
          blob: new Blob(['p'.repeat(12)], { type: 'image/png' }),
          mime: 'image/png',
          duration: 4,
        }
      }

      throw new Error(`Unexpected target format: ${options.targetFormat}`)
    })

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const { ToolRegistry, compressWithTools } =
      await import('../src/compressWithTools')

    const registry = new ToolRegistry()
    registry.registerTool(
      'browser-image-compression',
      vi
        .fn()
        .mockResolvedValue(new Blob(['j'.repeat(16)], { type: 'image/jpeg' })),
      ['jpeg'],
    )

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    const result = await compressWithTools(file, {
      quality: 0.8,
      mode: 'keepSize',
      output: 'auto',
      returnAllResults: true,
      type: 'blob',
      toolRegistry: registry,
    })

    expect(result.bestResult.type).toBe('image/webp')
    expect(result.outputDecision).toEqual(
      expect.objectContaining({
        requested: 'auto',
        selected: 'webp',
        selectedTool: 'browser-image-compression',
        usedFallback: false,
      }),
    )
    expect(result.outputDecision?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          format: 'jpeg',
          size: 16,
          selected: false,
        }),
        expect.objectContaining({
          format: 'png',
          size: 12,
          selected: false,
        }),
        expect.objectContaining({
          format: 'webp',
          size: 8,
          selected: true,
        }),
      ]),
    )
  })

  it('[AUTOFMT-005] auto output avoids JPEG candidates for PNG sources', async () => {
    const convertImage = vi.fn().mockResolvedValue({
      blob: new Blob(['webp-result'], { type: 'image/webp' }),
      mime: 'image/webp',
      duration: 4,
    })

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const { ToolRegistry, compressWithTools } =
      await import('../src/compressWithTools')

    const registry = new ToolRegistry()
    registry.registerTool(
      'browser-image-compression',
      vi
        .fn()
        .mockResolvedValue(new Blob(['png-source'], { type: 'image/png' })),
      ['png'],
    )

    const file = new File(['x'.repeat(1000)], 'image.png', {
      type: 'image/png',
    })

    await compressWithTools(file, {
      quality: 0.8,
      mode: 'keepSize',
      output: 'auto',
      returnAllResults: true,
      type: 'blob',
      toolRegistry: registry,
    })

    expect(convertImage).toHaveBeenCalledTimes(1)
    expect(convertImage).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({
        targetFormat: 'webp',
      }),
    )
  })

  it('[AUTOFMT-008] auto output falls back to preserve for GIF sources', async () => {
    const convertImage = vi.fn()

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const { ToolRegistry, compressWithTools } =
      await import('../src/compressWithTools')

    const registry = new ToolRegistry()
    registry.registerTool(
      'gifsicle',
      vi.fn().mockResolvedValue(new Blob(['gif-data'], { type: 'image/gif' })),
      ['gif'],
    )

    const file = new File(['x'.repeat(1000)], 'anim.gif', {
      type: 'image/gif',
    })

    const result = await compressWithTools(file, {
      quality: 0.8,
      mode: 'keepSize',
      output: 'auto',
      returnAllResults: true,
      type: 'blob',
      toolRegistry: registry,
    })

    expect(result.bestResult.type).toBe('image/gif')
    expect(result.outputDecision).toEqual(
      expect.objectContaining({
        requested: 'auto',
        selected: 'preserve',
        usedFallback: true,
      }),
    )
    expect(convertImage).not.toHaveBeenCalled()
  })

  it('[AUTOFMT-006] rejects explicit cross-format output when preserveExif is enabled', async () => {
    const convertImage = vi.fn()

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const { ToolRegistry, compressWithTools } =
      await import('../src/compressWithTools')

    const registry = new ToolRegistry()
    registry.registerTool(
      'browser-image-compression',
      vi
        .fn()
        .mockResolvedValue(new Blob(['jpeg-data'], { type: 'image/jpeg' })),
      ['jpeg'],
    )

    const file = new File(['x'.repeat(1000)], 'photo.jpg', {
      type: 'image/jpeg',
    })

    await expect(
      compressWithTools(file, {
        quality: 0.8,
        mode: 'keepSize',
        preserveExif: true,
        output: 'webp',
        type: 'blob',
        toolRegistry: registry,
      }),
    ).rejects.toThrow(
      'Output format conversion is not supported when preserveExif is enabled.',
    )

    expect(convertImage).not.toHaveBeenCalled()
  })

  it('[AUTOFMT-001][CORE-010] caches compressed results separately for each output format', async () => {
    const convertImage = vi.fn().mockImplementation(async (_blob, options) => ({
      blob: new Blob([options.targetFormat], {
        type: `image/${options.targetFormat}`,
      }),
      mime: `image/${options.targetFormat}`,
      duration: 3,
    }))

    vi.doMock('../src/conversion', () => ({
      convertImage,
    }))

    const compressor = vi
      .fn()
      .mockResolvedValue(
        new Blob(['base-compressed-jpeg'], { type: 'image/jpeg' }),
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

    const { compress } = await import('../src/compress')

    const file = new File(['x'.repeat(1000)], 'cache.jpg', {
      type: 'image/jpeg',
    })

    const webpResult = await compress(file, {
      quality: 0.8,
      mode: 'keepSize',
      output: 'webp',
      type: 'blob',
    })
    const pngResult = await compress(file, {
      quality: 0.8,
      mode: 'keepSize',
      output: 'png',
      type: 'blob',
    })

    expect(webpResult.type).toBe('image/webp')
    expect(pngResult.type).toBe('image/png')
    expect(convertImage).toHaveBeenCalledTimes(2)
    expect(convertImage).toHaveBeenNthCalledWith(
      1,
      expect.any(Blob),
      expect.objectContaining({
        targetFormat: 'webp',
      }),
    )
    expect(convertImage).toHaveBeenNthCalledWith(
      2,
      expect.any(Blob),
      expect.objectContaining({
        targetFormat: 'png',
      }),
    )
  })
})
