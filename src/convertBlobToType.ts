import type { CompressResult, CompressResultType } from './types'

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/x-icon': 'ico',
}

function resolveOutputFileName(
  originalFileName: string | undefined,
  mimeType: string,
): string {
  if (!originalFileName) {
    return 'compressed'
  }

  const extension = MIME_TYPE_TO_EXTENSION[mimeType.toLowerCase()]
  if (!extension) {
    return originalFileName
  }

  const baseName = originalFileName.replace(/\.[^./\\]+$/, '')
  return `${baseName}.${extension}`
}

// 辅助函数：将 Blob 转换为不同格式
export default async function convertBlobToType<T extends CompressResultType>(
  blob: Blob,
  type: T,
  originalFileName?: string,
): Promise<CompressResult<T>> {
  switch (type) {
    case 'blob':
      return blob as CompressResult<T>
    case 'file':
      return new File(
        [blob],
        resolveOutputFileName(originalFileName, blob.type),
        {
          type: blob.type,
        },
      ) as CompressResult<T>
    case 'base64':
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as CompressResult<T>)
        reader.readAsDataURL(blob)
      })
    case 'arrayBuffer':
      return blob.arrayBuffer() as Promise<CompressResult<T>>
    default:
      throw new Error(`Unsupported type: ${type}`)
  }
}
