import { describe, it, expect, vi } from 'vitest'
import compressWithGifsicle from '../src/tools/compressWithGifsicle'

// Mock gifsicle-wasm-browser
vi.mock('gifsicle-wasm-browser', () => ({
  default: {
    run: vi.fn(),
  },
}))

describe('compressWithGifsicle - 文件大小保护测试', () => {
  it('当压缩后文件更大时应返回原文件', async () => {
    const gifsicle = await import('gifsicle-wasm-browser')

    // 创建模拟的原文件
    const originalFile = new File(['original content'], 'test.gif', {
      type: 'image/gif',
    })

    // 创建模拟的压缩后文件（更大）
    const compressedBlob = new Blob(
      ['compressed content that is much larger'],
      {
        type: 'image/gif',
      },
    )

    // Mock gifsicle.run 返回更大的文件
    vi.mocked(gifsicle.default.run).mockResolvedValue([compressedBlob])

    const options = {
      quality: 0.8,
      mode: 'keepSize',
    }

    const result = await compressWithGifsicle(originalFile, options)

    // 应该返回原文件，因为压缩后文件更大
    expect(result).toBe(originalFile)
    expect(result.size).toBe(originalFile.size)
  })

  it('当压缩后文件更小时应返回压缩后的文件', async () => {
    const gifsicle = await import('gifsicle-wasm-browser')

    // 创建模拟的原文件
    const originalFile = new File(
      ['original content that is much larger'],
      'test.gif',
      {
        type: 'image/gif',
      },
    )

    // 创建模拟的压缩后文件（更小）
    const compressedBlob = new Blob(['small'], {
      type: 'image/gif',
    })

    // Mock gifsicle.run 返回更小的文件
    vi.mocked(gifsicle.default.run).mockResolvedValue([compressedBlob])

    const options = {
      quality: 0.8,
      mode: 'keepSize',
    }

    const result = await compressWithGifsicle(originalFile, options)

    // 应该返回压缩后的文件，因为它更小
    expect(result).toBe(compressedBlob)
    expect(result.size).toBe(compressedBlob.size)
  })

  it('当压缩后文件略小但在阈值内时应返回原文件', async () => {
    const gifsicle = await import('gifsicle-wasm-browser')

    // 创建模拟的原文件（1000 bytes）
    const originalContent = 'x'.repeat(1000)
    const originalFile = new File([originalContent], 'test.gif', {
      type: 'image/gif',
    })

    // 创建模拟的压缩后文件（990 bytes，节省不到 2%）
    const compressedContent = 'x'.repeat(990)
    const compressedBlob = new Blob([compressedContent], {
      type: 'image/gif',
    })

    // Mock gifsicle.run 返回略小的文件
    vi.mocked(gifsicle.default.run).mockResolvedValue([compressedBlob])

    const options = {
      quality: 0.8,
      mode: 'keepSize',
    }

    const result = await compressWithGifsicle(originalFile, options)

    // 应该返回原文件，因为压缩效果不明显（在 98% 阈值内）
    expect(result).toBe(originalFile)
  })
})
