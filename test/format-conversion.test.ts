import { describe, it, expect } from 'vitest'
import {
  convertImage,
  detectFileFormat,
  isSvgContent,
  renderSvgToCanvas,
  encodeSvgToFormat,
} from '../src/conversion'

// Mock DOM APIs for Node.js environment
global.Image = class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src: string = ''
  width: number = 200
  height: number = 200
  naturalWidth: number = 200
  naturalHeight: number = 200

  set src(value: string) {
    this._src = value
    // Simulate immediate successful load for testing
    if (this.onload) {
      // Use a microtask to ensure the function is properly set up
      queueMicrotask(() => {
        if (this.onload) {
          this.onload()
        }
      })
    }
  }

  get src() {
    return this._src
  }
} as any

global.HTMLCanvasElement = class MockCanvas {
  width: number = 200
  height: number = 200

  getContext(contextId: string) {
    if (contextId === '2d') {
      return {
        clearRect: () => {},
        drawImage: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray(200 * 200 * 4),
          width: 200,
          height: 200,
        }),
      }
    }
    return null
  }

  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number) {
    // Create a simple mock blob based on type
    let mimeType = 'image/png'
    if (type === 'image/jpeg') mimeType = 'image/jpeg'
    else if (type === 'image/webp') mimeType = 'image/webp'
    
    const mockBlob = new Blob(['mock-image-data'], { type: mimeType })
    // Use microtask for immediate callback
    queueMicrotask(() => callback(mockBlob))
  }
} as any

global.document = {
  createElement: (tagName: string) => {
    if (tagName === 'canvas') {
      return new HTMLCanvasElement()
    }
    return {} as any
  },
} as any

global.URL = {
  createObjectURL: () => 'mock-object-url',
  revokeObjectURL: () => {},
} as any

const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect x="10" y="10" width="180" height="180" fill="#ff6b6b" stroke="#4ecdc4" stroke-width="4"/>
  <circle cx="100" cy="100" r="50" fill="#4ecdc4"/>
  <text x="100" y="100" text-anchor="middle" dominant-baseline="central" fill="white" font-size="16">SVG Test</text>
</svg>`

describe('SVG format detection', () => {
  it('should detect SVG file format correctly', () => {
    const svgFile = new File([testSvg], 'test.svg', { type: 'image/svg+xml' })
    const format = detectFileFormat(svgFile)
    expect(format).toBe('svg')
  })

  it('should detect SVG by file extension when mime type is missing', () => {
    const svgFile = new File([testSvg], 'test.svg', { type: '' })
    const format = detectFileFormat(svgFile)
    expect(format).toBe('svg')
  })

  it('should detect other image formats correctly', () => {
    const pngFile = new File(['fake-png'], 'test.png', { type: 'image/png' })
    expect(detectFileFormat(pngFile)).toBe('png')

    const jpegFile = new File(['fake-jpeg'], 'test.jpg', { type: 'image/jpeg' })
    expect(detectFileFormat(jpegFile)).toBe('jpeg')

    const webpFile = new File(['fake-webp'], 'test.webp', { type: 'image/webp' })
    expect(detectFileFormat(webpFile)).toBe('webp')
  })
})

describe('SVG content validation', () => {
  it('should correctly identify valid SVG content', () => {
    expect(isSvgContent(testSvg)).toBe(true)
    expect(isSvgContent('<svg></svg>')).toBe(true)
    expect(isSvgContent('  <svg xmlns="...">content</svg>  ')).toBe(true)
  })

  it('should reject invalid SVG content', () => {
    expect(isSvgContent('')).toBe(false)
    expect(isSvgContent('not svg content')).toBe(false)
    expect(isSvgContent('<div>html content</div>')).toBe(false)
  })

  it('should handle SVG content with embedded SVG tags', () => {
    const complexSvg = `<html><body><svg width="100">content</svg></body></html>`
    expect(isSvgContent(complexSvg)).toBe(true)
  })
})

describe('SVG canvas rendering', () => {
  it('should render SVG to canvas with default dimensions', async () => {
    const canvas = await renderSvgToCanvas(testSvg)
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBe(200) // From mock
    expect(canvas.height).toBe(200) // From mock
  })

  it('should render SVG to canvas with custom dimensions', async () => {
    const canvas = await renderSvgToCanvas(testSvg, 400, 300)
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(300)
  })
})

describe('SVG to format encoding', () => {
  it('should convert SVG to PNG', async () => {
    const blob = await encodeSvgToFormat(testSvg, 'png')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
  })

  it('should convert SVG to JPEG with quality', async () => {
    const blob = await encodeSvgToFormat(testSvg, 'jpeg', { 
      targetFormat: 'jpeg',
      quality: 0.9 
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/jpeg')
  })

  it('should convert SVG to WebP', async () => {
    const blob = await encodeSvgToFormat(testSvg, 'webp')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/webp')
  })

  it('should convert SVG to ICO format', async () => {
    const blob = await encodeSvgToFormat(testSvg, 'ico')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/x-icon')
  })

  it('should handle custom dimensions in conversion', async () => {
    const blob = await encodeSvgToFormat(testSvg, 'png', { 
      targetFormat: 'png',
      width: 500, 
      height: 400 
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
  })
})

describe('Full SVG conversion workflow', () => {
  it('should convert SVG file to PNG through convertImage function', async () => {
    const svgFile = new File([testSvg], 'test.svg', { type: 'image/svg+xml' })
    
    const result = await convertImage(svgFile, { targetFormat: 'png' })
    
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.mime).toBe('image/png')
    expect(result.duration).toBeGreaterThan(0)
  })

  it('should convert SVG file to JPEG with quality settings', async () => {
    const svgFile = new File([testSvg], 'test.svg', { type: 'image/svg+xml' })
    
    const result = await convertImage(svgFile, { 
      targetFormat: 'jpeg',
      quality: 0.8
    })
    
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.mime).toBe('image/jpeg')
    expect(result.duration).toBeGreaterThan(0)
  })

  it('should convert SVG file to WebP', async () => {
    const svgFile = new File([testSvg], 'test.svg', { type: 'image/svg+xml' })
    
    const result = await convertImage(svgFile, { targetFormat: 'webp' })
    
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.mime).toBe('image/webp')
    expect(result.duration).toBeGreaterThan(0)
  })

  it('should handle SVG with custom render dimensions', async () => {
    const svgFile = new File([testSvg], 'test.svg', { type: 'image/svg+xml' })
    
    const result = await convertImage(svgFile, { 
      targetFormat: 'png',
      width: 800,
      height: 600
    })
    
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.mime).toBe('image/png')
    expect(result.duration).toBeGreaterThan(0)
  })
})

describe('Error handling', () => {
  it('should handle invalid SVG content gracefully', async () => {
    const invalidSvgFile = new File(['not svg content'], 'test.svg', { 
      type: 'image/svg+xml' 
    })
    
    await expect(convertImage(invalidSvgFile, { targetFormat: 'png' }))
      .rejects
      .toThrow(/SVG conversion failed/)
  })

  it('should handle unsupported target formats', async () => {
    await expect(encodeSvgToFormat(testSvg, 'gif' as any))
      .rejects
      .toThrow(/Unsupported target format/)
  })
})

// Legacy placeholder test to maintain compatibility
describe('format conversion placeholder', () => {
  it('placeholder test - keeps test runner happy', () => {
    expect(true).toBe(true)
  })
})
