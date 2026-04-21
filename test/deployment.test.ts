import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  configureCompressionDeployment,
  getCompressionDeploymentConfig,
  ToolRegistry,
  compressWithTools,
} from '../src'

afterEach(() => {
  configureCompressionDeployment({})
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('deployment configuration', () => {
  it('[DEPLOY-004] forwards a global browser-image-compression libURL when per-call config is omitted', async () => {
    configureCompressionDeployment({
      browserImageCompression: {
        libURL: '/vendor/browser-image-compression.js',
      },
    })

    const imageCompression = vi
      .fn()
      .mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))

    const toolRegistry = new ToolRegistry()
    toolRegistry.registerTool('browser-image-compression', imageCompression, [
      'jpeg',
    ])

    const file = new File(['x'.repeat(1000)], 'test.jpg', {
      type: 'image/jpeg',
    })

    await compressWithTools(file, {
      quality: 0.8,
      mode: 'keepSize',
      toolRegistry,
    })

    expect(imageCompression).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        libURL: '/vendor/browser-image-compression.js',
      }),
    )
  })

  it('[DEPLOY-004] keeps per-call browser-image-compression libURL ahead of the global deployment config', async () => {
    configureCompressionDeployment({
      browserImageCompression: {
        libURL: '/vendor/global-browser-image-compression.js',
      },
    })

    const imageCompression = vi
      .fn()
      .mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))

    const toolRegistry = new ToolRegistry()
    toolRegistry.registerTool('browser-image-compression', imageCompression, [
      'jpeg',
    ])

    const file = new File(['x'.repeat(1000)], 'test.jpg', {
      type: 'image/jpeg',
    })

    await compressWithTools(file, {
      quality: 0.8,
      mode: 'keepSize',
      toolRegistry,
      toolConfigs: [
        {
          name: 'browser-image-compression',
          libURL: '/vendor/local-browser-image-compression.js',
        },
      ],
    })

    expect(imageCompression).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        libURL: '/vendor/local-browser-image-compression.js',
      }),
    )
  })

  it('[DEPLOY-006][DEPLOY-007] disables tinypng under offline-strict deployment mode', async () => {
    configureCompressionDeployment({
      mode: 'offline-strict',
    })

    const toolRegistry = new ToolRegistry()
    toolRegistry.registerTool(
      'tinypng',
      vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' })),
      ['png'],
    )

    const file = new File(['x'.repeat(1000)], 'test.png', {
      type: 'image/png',
    })

    await expect(
      compressWithTools(file, {
        quality: 0.8,
        mode: 'keepSize',
        toolRegistry,
        toolConfigs: [
          {
            name: 'tinypng',
            key: 'secret',
          },
        ],
      }),
    ).rejects.toThrow(
      'No compression tools available. Please register at least one compression tool.',
    )
  })

  it('[DEPLOY-003] exposes the current resolved deployment config snapshot', () => {
    configureCompressionDeployment({
      mode: 'offline-preferred',
      browserImageCompression: {
        libURL: '/vendor/browser-image-compression.js',
      },
      wasm: {
        baseUrl: '/vendor/wasm/',
        useLocal: true,
        allowCdnFallback: false,
      },
      networkTools: {
        allowTinyPng: false,
      },
    })

    expect(getCompressionDeploymentConfig()).toEqual({
      mode: 'offline-preferred',
      browserImageCompression: {
        libURL: '/vendor/browser-image-compression.js',
      },
      wasm: {
        baseUrl: '/vendor/wasm/',
        useLocal: true,
        allowCdnFallback: false,
      },
      networkTools: {
        allowTinyPng: false,
      },
    })
  })

  it('[DEPLOY-005][DEPLOY-008] does not fall back to CDN when local WASM loading fails in offline-strict deployment mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    )

    const { configureCompressionDeployment } = await import('../src/deployment')
    const { ensureWasmLoaded } = await import(
      '../src/tools/compressWithJsquash'
    )

    configureCompressionDeployment({
      mode: 'offline-strict',
      wasm: {
        useLocal: true,
        baseUrl: '/vendor/wasm/',
        allowCdnFallback: false,
      },
    })

    await expect(ensureWasmLoaded('png')).rejects.toThrow(
      'Local WASM file not found: /vendor/wasm/squoosh_png_bg.wasm',
    )
  })
})
