import type { ResizeOptions } from '../types'

export function hasResizeOptions(
  resize?: Pick<
    ResizeOptions,
    'targetWidth' | 'targetHeight' | 'maxWidth' | 'maxHeight'
  >,
): boolean {
  return Boolean(
    resize &&
    (resize.targetWidth ||
      resize.targetHeight ||
      resize.maxWidth ||
      resize.maxHeight),
  )
}

export function resolveResizeDimensions(
  srcW: number,
  srcH: number,
  resize?: ResizeOptions,
): { width: number; height: number } {
  if (!resize) return { width: srcW, height: srcH }

  const {
    targetWidth,
    targetHeight,
    maxWidth,
    maxHeight,
    fit = 'contain',
  } = resize

  if (targetWidth && targetHeight) {
    return { width: targetWidth, height: targetHeight }
  }

  if (targetWidth && !targetHeight) {
    const scale = targetWidth / srcW
    return { width: targetWidth, height: Math.round(srcH * scale) }
  }

  if (!targetWidth && targetHeight) {
    const scale = targetHeight / srcH
    return { width: Math.round(srcW * scale), height: targetHeight }
  }

  let width = srcW
  let height = srcH

  if (maxWidth || maxHeight) {
    const maxW = maxWidth ?? Number.POSITIVE_INFINITY
    const maxH = maxHeight ?? Number.POSITIVE_INFINITY

    if (fit === 'cover') {
      if (maxWidth && maxHeight) {
        return { width: maxWidth, height: maxHeight }
      }

      if (maxWidth) {
        const scale = maxWidth / srcW
        return { width: maxWidth, height: Math.round(srcH * scale) }
      }

      if (maxHeight) {
        const scale = maxHeight / srcH
        return { width: Math.round(srcW * scale), height: maxHeight }
      }
    }

    const scale = Math.min(maxW / srcW, maxH / srcH, 1)

    if (fit === 'scale-down') {
      if (scale < 1) {
        width = Math.round(srcW * scale)
        height = Math.round(srcH * scale)
      }
    } else if (fit === 'contain') {
      width = Math.round(srcW * scale)
      height = Math.round(srcH * scale)
    }
  }

  return { width, height }
}
