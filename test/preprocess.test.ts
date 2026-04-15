import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveResizeDimensions } from '../src/utils/resize'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('preprocess cover resize', () => {
  it('returns the exact target box for cover mode', () => {
    expect(
      resolveResizeDimensions(400, 200, {
        maxWidth: 100,
        maxHeight: 100,
        fit: 'cover',
      }),
    ).toEqual({ width: 100, height: 100 })
  })

  it('scales and crops to fill the cover box without distortion', async () => {
    const canvases: Array<{
      width: number
      height: number
      drawImageCalls: any[][]
      clearRectCalls: any[][]
    }> = []

    class MockImage {
      naturalWidth = 400
      naturalHeight = 200
      width = 400
      height = 200
      crossOrigin = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    vi.stubGlobal('Image', MockImage as unknown as typeof Image)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL)
    vi.stubGlobal('document', {
      createElement: (tagName: string) => {
        if (tagName !== 'canvas') {
          return {} as any
        }

        const record = {
          width: 0,
          height: 0,
          drawImageCalls: [] as any[][],
          clearRectCalls: [] as any[][],
        }
        const canvas = {
          get width() {
            return record.width
          },
          set width(value: number) {
            record.width = value
          },
          get height() {
            return record.height
          },
          set height(value: number) {
            record.height = value
          },
          getContext: () => ({
            save: () => {},
            restore: () => {},
            translate: () => {},
            rotate: () => {},
            scale: () => {},
            drawImage: (...args: any[]) => {
              record.drawImageCalls.push(args)
            },
            clearRect: (...args: any[]) => {
              record.clearRectCalls.push(args)
            },
          }),
          toBlob: (callback: (blob: Blob | null) => void, type?: string) => {
            queueMicrotask(() => callback(new Blob(['processed'], { type })))
          },
        }

        canvases.push(record)
        return canvas as any
      },
    } as unknown as Document)

    const { preprocessImage } = await import('../src/utils/preprocessImage')
    const file = new File(['input'], 'test.png', { type: 'image/png' })

    const result = await preprocessImage(file, {
      resize: {
        maxWidth: 100,
        maxHeight: 100,
        fit: 'cover',
      },
      outputType: 'image/png',
    })

    expect(result.width).toBe(100)
    expect(result.height).toBe(100)

    const outputCanvas = canvases[0]
    const finalDraw = outputCanvas.drawImageCalls[0]

    expect(finalDraw[1]).toBe(-50)
    expect(finalDraw[2]).toBe(0)
    expect(finalDraw[3]).toBe(200)
    expect(finalDraw[4]).toBe(100)
  })
})
