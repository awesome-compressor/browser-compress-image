import { isSvgContent } from '../../../src'

function extractSvgMarkup(text: string): string | undefined {
  const trimmed = text.trim()

  if (!trimmed)
    return undefined

  if (trimmed.startsWith('<svg') && isSvgContent(trimmed))
    return trimmed

  return trimmed.match(/<svg[\s\S]*<\/svg>/i)?.[0]
}

export function createSvgFileFromClipboardText(text: string): File | undefined {
  const svgText = extractSvgMarkup(text)

  if (!svgText)
    return undefined

  return new File([svgText], 'pasted-image.svg', {
    type: 'image/svg+xml',
  })
}
