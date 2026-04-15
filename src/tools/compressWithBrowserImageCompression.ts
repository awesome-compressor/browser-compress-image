import imageCompression, { Options } from 'browser-image-compression'
import { hasResizeOptions, resolveResizeDimensions } from '../utils/resize'

const runImageCompression = imageCompression as unknown as (
  file: File,
  options: Options,
) => Promise<File>

// browser-image-compression 工具
export default async function compressWithBrowserImageCompression(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
    libURL?: string
  },
): Promise<Blob> {
  const {
    quality,
    mode,
    targetWidth,
    targetHeight,
    maxWidth,
    maxHeight,
    preserveExif = false,
    libURL,
  } = options

  let maxWidthOrHeight: number | undefined

  if (
    mode === 'keepQuality' &&
    hasResizeOptions({ targetWidth, targetHeight, maxWidth, maxHeight })
  ) {
    const { width: originalWidth, height: originalHeight } =
      await getImageDimensions(file)
    const { width, height } = resolveResizeDimensions(
      originalWidth,
      originalHeight,
      {
        targetWidth,
        targetHeight,
        maxWidth,
        maxHeight,
      },
    )
    maxWidthOrHeight = Math.max(width, height)
  }

  const compressionOptions: Options = {
    useWebWorker: true,
    initialQuality: quality,
    alwaysKeepResolution: mode === 'keepSize',
    exifOrientation: 1,
    fileType: file.type,
    preserveExif: preserveExif,
    maxSizeMB: (file.size * 0.8) / (1024 * 1024), // 设置为原始文件大小的 MB
    maxWidthOrHeight,
    libURL,
  }

  const compressedBlob = await runImageCompression(file, compressionOptions)

  // 如果压缩后文件大于或接近原文件大小，返回原文件
  // 使用 98% 阈值，避免微小的压缩效果
  if (compressedBlob.size >= file.size * 0.98) {
    return file
  }

  return compressedBlob
}

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
