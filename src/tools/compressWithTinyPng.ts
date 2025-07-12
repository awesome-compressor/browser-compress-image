export function compressWithTinyPng(
  file: File,
  options: {
    quality: number
    mode: string
    targetWidth?: number
    targetHeight?: number
    maxWidth?: number
    maxHeight?: number
    preserveExif?: boolean
    key?: string
  },
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      // 检查是否提供了 TinyPNG API 密钥
      const apiKey = options.key

      if (!apiKey) {
        throw new Error(
          'TinyPNG API key is required. Please set TINYPNG_API_KEY environment variable or window.TINYPNG_API_KEY',
        )
      }

      // 验证文件类型
      const supportedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ]
      if (!supportedTypes.includes(file.type)) {
        throw new Error(
          `Unsupported file type: ${file.type}. TinyPNG supports JPEG, PNG, and WebP images.`,
        )
      }

      // 步骤1: 上传图片到 TinyPNG 进行压缩
      const uploadResponse = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
          'Content-Type': file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(
          `TinyPNG upload failed: ${uploadResponse.status} - ${errorText}`,
        )
      }

      const uploadResult = await uploadResponse.json()
      const outputUrl = uploadResponse.headers.get('Location')

      if (!outputUrl) {
        throw new Error('No output URL received from TinyPNG')
      }

      // 如果需要调整尺寸，构建调整选项
      let resizeOptions: any = null
      if (
        options.mode === 'keepQuality' &&
        (options.targetWidth ||
          options.targetHeight ||
          options.maxWidth ||
          options.maxHeight)
      ) {
        resizeOptions = {}

        if (options.targetWidth && options.targetHeight) {
          resizeOptions.method = 'fit'
          resizeOptions.width = options.targetWidth
          resizeOptions.height = options.targetHeight
        } else if (options.maxWidth && options.maxHeight) {
          resizeOptions.method = 'scale'
          resizeOptions.width = options.maxWidth
          resizeOptions.height = options.maxHeight
        } else if (options.targetWidth) {
          resizeOptions.method = 'scale'
          resizeOptions.width = options.targetWidth
        } else if (options.targetHeight) {
          resizeOptions.method = 'scale'
          resizeOptions.height = options.targetHeight
        }
      }

      let finalUrl = outputUrl

      // 步骤2: 如果需要调整尺寸，发送调整请求
      if (resizeOptions) {
        const resizeResponse = await fetch(outputUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resize: resizeOptions,
          }),
        })

        if (!resizeResponse.ok) {
          const errorText = await resizeResponse.text()
          throw new Error(
            `TinyPNG resize failed: ${resizeResponse.status} - ${errorText}`,
          )
        }

        finalUrl = resizeResponse.headers.get('Location') || outputUrl
      }

      // 步骤3: 下载压缩后的图片
      const downloadResponse = await fetch(finalUrl, {
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        },
      })

      if (!downloadResponse.ok) {
        throw new Error(
          `Failed to download compressed image: ${downloadResponse.status}`,
        )
      }

      const compressedBlob = await downloadResponse.blob()

      // 检查压缩效果
      if (compressedBlob.size >= file.size * 0.98) {
        console.warn(
          'TinyPNG compression did not significantly reduce file size, returning original file',
        )
        resolve(file)
      } else {
        // 创建一个新的 Blob，确保正确的 MIME 类型
        const finalBlob = new Blob([compressedBlob], { type: file.type })
        resolve(finalBlob)
      }
    } catch (error) {
      console.error('TinyPNG compression error:', error)
      reject(error)
    }
  })
}
