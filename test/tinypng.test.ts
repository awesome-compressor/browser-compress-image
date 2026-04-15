import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearTinyPngCache,
  compressWithTinyPng,
} from '../src/tools/compressWithTinyPng'

afterEach(() => {
  clearTinyPngCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.TINYPNG_API_KEY
})

function stubBtoa() {
  vi.stubGlobal('btoa', (value: string) =>
    Buffer.from(value, 'binary').toString('base64'),
  )
}

describe('compressWithTinyPng', () => {
  it('keys the cache by file content instead of metadata only', async () => {
    stubBtoa()

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', {
          status: 201,
          headers: { Location: 'https://example.com/output/1' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(['A'], { type: 'image/png' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response('', {
          status: 201,
          headers: { Location: 'https://example.com/output/2' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(['B'], { type: 'image/png' }), {
          status: 200,
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const fileA = new File(['AAAA'], 'same.png', {
      type: 'image/png',
      lastModified: 1,
    })
    const fileB = new File(['BBBB'], 'same.png', {
      type: 'image/png',
      lastModified: 1,
    })

    const resultA = await compressWithTinyPng(fileA, {
      quality: 0.8,
      mode: 'keepSize',
      key: 'api-key',
    })
    const resultB = await compressWithTinyPng(fileB, {
      quality: 0.8,
      mode: 'keepSize',
      key: 'api-key',
    })

    expect(await resultA.text()).toBe('A')
    expect(await resultB.text()).toBe('B')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('reads the API key from window when options.key is omitted', async () => {
    stubBtoa()

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', {
          status: 201,
          headers: { Location: 'https://example.com/output/1' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(['A'], { type: 'image/png' }), {
          status: 200,
        }),
      )

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', {
      TINYPNG_API_KEY: 'window-key',
    })

    const file = new File(['AAAA'], 'same.png', {
      type: 'image/png',
    })

    await compressWithTinyPng(file, {
      quality: 0.8,
      mode: 'keepSize',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tinify.com/shrink',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa('api:window-key')}`,
        }),
      }),
    )
  })
})
