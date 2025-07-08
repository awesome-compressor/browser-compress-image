import imageCompression, { Options } from 'browser-image-compression'

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
  } = options

  const compressionOptions: Options = {
    useWebWorker: true,
    initialQuality: quality,
    alwaysKeepResolution: mode === 'keepSize',
    exifOrientation: 1,
    fileType: file.type,
    preserveExif: preserveExif,
    maxSizeMB: (file.size * 0.8) / (1024 * 1024), // 设置为原始文件大小的 MB
    maxWidthOrHeight:
      Math.min(maxWidth || targetWidth!, maxHeight || targetHeight!) ||
      undefined,
  }

  const compressedBlob = await imageCompression(file, compressionOptions)

  // 如果压缩后文件大于或接近原文件大小，返回原文件
  // 使用 98% 阈值，避免微小的压缩效果
  if (compressedBlob.size >= file.size * 0.98) {
    return file
  }

  return compressedBlob
}
