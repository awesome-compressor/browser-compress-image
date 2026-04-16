import { describe, expect, it } from 'vitest'

import { createSvgFileFromClipboardText } from './svgClipboard'

describe('createSvgFileFromClipboardText', () => {
  it('creates an svg file when clipboard text is svg code', async () => {
    const file = createSvgFileFromClipboardText(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z" /></svg>',
    )

    expect(file).toBeInstanceOf(File)
    expect(file?.name).toBe('pasted-image.svg')
    expect(file?.type).toBe('image/svg+xml')
    await expect(file?.text()).resolves.toContain('<svg')
  })

  it('returns undefined for non-svg clipboard text', () => {
    expect(createSvgFileFromClipboardText('hello world')).toBeUndefined()
  })

  it('extracts svg markup from wrapped clipboard html', async () => {
    const file = createSvgFileFromClipboardText(
      '<div><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z" /></svg></div>',
    )

    await expect(file?.text()).resolves.toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z" /></svg>',
    )
  })
})
