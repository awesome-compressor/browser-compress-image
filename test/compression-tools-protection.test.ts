import { describe, it, expect, vi } from 'vitest'

describe('压缩工具文件大小保护测试', () => {
  describe('compressWithBrowserImageCompression', () => {
    it('当压缩后文件更大时应返回原文件', async () => {
      // Mock browser-image-compression 返回更大的文件
      vi.doMock('browser-image-compression', () => ({
        default: vi
          .fn()
          .mockResolvedValue(
            new Blob(
              [
                'very large compressed content that is much bigger than original',
              ],
              { type: 'image/jpeg' },
            ),
          ),
      }))

      const { default: compressWithBrowserImageCompression } = await import(
        '../src/tools/compressWithBrowserImageCompression'
      )

      const originalFile = new File(['small'], 'test.jpg', {
        type: 'image/jpeg',
      })
      const options = { quality: 0.8, mode: 'keepSize' }

      const result = await compressWithBrowserImageCompression(
        originalFile,
        options,
      )

      // 应该返回原文件，因为压缩后文件更大
      expect(result).toBe(originalFile)
      expect(result.size).toBe(originalFile.size)
    })

    it('当压缩后文件显著更小时应返回压缩后的文件', async () => {
      // Mock browser-image-compression 返回显著更小的文件
      vi.doMock('browser-image-compression', () => ({
        default: vi.fn().mockImplementation((file) => {
          // 返回比原文件小得多的文件（50%）
          const smallerContent = 'x'.repeat(Math.floor(file.size * 0.5))
          return Promise.resolve(
            new Blob([smallerContent], { type: 'image/jpeg' }),
          )
        }),
      }))

      const { default: compressWithBrowserImageCompression } = await import(
        '../src/tools/compressWithBrowserImageCompression'
      )

      const originalContent = 'x'.repeat(1000)
      const originalFile = new File([originalContent], 'test.jpg', {
        type: 'image/jpeg',
      })
      const options = { quality: 0.8, mode: 'keepSize' }

      const result = await compressWithBrowserImageCompression(
        originalFile,
        options,
      )

      // 应该返回压缩后的文件，因为它显著更小
      expect(result).not.toBe(originalFile)
      expect(result.size).toBeLessThan(originalFile.size * 0.98)
    })
  })

  describe('compressWithCompressorJS', () => {
    it('当压缩后文件更大时应返回原文件', async () => {
      // Mock Compressor constructor
      vi.doMock('compressorjs', () => ({
        default: vi.fn().mockImplementation((file, options) => {
          // 模拟压缩后文件更大的情况
          const largeBlob = new Blob(
            ['very large compressed content that is much bigger than original'],
            { type: 'image/jpeg' },
          )
          setTimeout(() => options.success(largeBlob), 0)
        }),
      }))

      const { default: compressWithCompressorJS } = await import(
        '../src/tools/compressWithCompressorJS'
      )

      const originalFile = new File(['small'], 'test.jpg', {
        type: 'image/jpeg',
      })
      const options = { quality: 0.8, mode: 'keepSize' }

      const result = await compressWithCompressorJS(originalFile, options)

      // 应该返回原文件，因为压缩后文件更大
      expect(result).toBe(originalFile)
    })

    it('当压缩后文件显著更小时应返回压缩后的文件', async () => {
      vi.doMock('compressorjs', () => ({
        default: vi.fn().mockImplementation((file, options) => {
          // 返回比原文件小得多的文件（50%）
          const smallerContent = 'x'.repeat(Math.floor(file.size * 0.5))
          const smallBlob = new Blob([smallerContent], { type: 'image/jpeg' })
          setTimeout(() => options.success(smallBlob), 0)
        }),
      }))

      const { default: compressWithCompressorJS } = await import(
        '../src/tools/compressWithCompressorJS'
      )

      const originalContent = 'x'.repeat(1000)
      const originalFile = new File([originalContent], 'test.jpg', {
        type: 'image/jpeg',
      })
      const options = { quality: 0.8, mode: 'keepSize' }

      const result = await compressWithCompressorJS(originalFile, options)

      // 应该返回压缩后的文件，因为它显著更小
      expect(result).not.toBe(originalFile)
      expect(result.size).toBeLessThan(originalFile.size * 0.98)
    })

    it('应该拒绝非JPEG文件', async () => {
      const { default: compressWithCompressorJS } = await import(
        '../src/tools/compressWithCompressorJS'
      )

      const pngFile = new File(['png content'], 'test.png', {
        type: 'image/png',
      })
      const options = { quality: 0.8, mode: 'keepSize' }

      await expect(compressWithCompressorJS(pngFile, options)).rejects.toThrow(
        'CompressorJS is optimized for JPEG files',
      )
    })
  })
})
