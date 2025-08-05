import type { CompressOptions, CompressResult, CompressResultType } from './types'
import { compress } from './compress'
import convertBlobToType from './convertBlobToType'

export type SupportedConvertFormat = 'jpeg' | 'jpg' | 'png' | 'webp'

export interface ConvertOptions {
  quality?: number
  type?: CompressResultType
}

export interface ConvertResult<T extends CompressResultType = 'blob'> {
  format: SupportedConvertFormat
  result: CompressResult<T>
  originalSize: number
  convertedSize: number
  success: boolean
  error?: string
}

export interface ConvertWithCompressionResult<T extends CompressResultType = 'blob'> {
  format: SupportedConvertFormat
  compressFirstResult: CompressResult<T>
  convertFirstResult: CompressResult<T>
  compressFirstSize: number
  convertFirstSize: number
  bestStrategy: 'compress-first' | 'convert-first'
  bestResult: CompressResult<T>
}

export function isSupportedFormat(mimeType: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType)
}

export function getSupportedFormats(originalFormat: string): SupportedConvertFormat[] {
  const allFormats: SupportedConvertFormat[] = ['jpeg', 'jpg', 'png', 'webp']
  
  if (originalFormat.includes('jpeg') || originalFormat.includes('jpg')) {
    return allFormats.filter(f => f !== 'jpeg' && f !== 'jpg')
  }
  if (originalFormat.includes('png')) {
    return allFormats.filter(f => f !== 'png')
  }
  if (originalFormat.includes('webp')) {
    return allFormats.filter(f => f !== 'webp')
  }
  
  return allFormats
}

async function convertImageFormat(
  file: File | Blob,
  targetFormat: SupportedConvertFormat,
  quality: number = 0.9
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0)

      const mimeType = targetFormat === 'jpg' || targetFormat === 'jpeg' 
        ? 'image/jpeg' 
        : `image/${targetFormat}`

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert image'))
          }
        },
        mimeType,
        quality
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

export async function convertImage<T extends CompressResultType = 'blob'>(
  file: File,
  targetFormat: SupportedConvertFormat,
  options: ConvertOptions & { type?: T } = {}
): Promise<ConvertResult<T>> {
  const { quality = 0.9, type = 'blob' as T } = options

  if (!isSupportedFormat(file.type)) {
    throw new Error(`Unsupported source format: ${file.type}. Only JPEG, PNG, and WebP are supported.`)
  }

  try {
    const convertedBlob = await convertImageFormat(file, targetFormat, quality)
    const result = await convertBlobToType(convertedBlob, type, `converted.${targetFormat}`)

    return {
      format: targetFormat,
      result,
      originalSize: file.size,
      convertedSize: convertedBlob.size,
      success: true
    }
  } catch (error) {
    return {
      format: targetFormat,
      result: await convertBlobToType(file, type, file.name) as CompressResult<T>,
      originalSize: file.size,
      convertedSize: file.size,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function convertToAllFormats<T extends CompressResultType = 'blob'>(
  file: File,
  options: ConvertOptions & { type?: T } = {}
): Promise<ConvertResult<T>[]> {
  const supportedFormats = getSupportedFormats(file.type)
  
  if (supportedFormats.length === 0) {
    throw new Error(`No conversion formats available for ${file.type}`)
  }

  const promises = supportedFormats.map(format => 
    convertImage(file, format, options)
  )

  return await Promise.all(promises)
}

export async function convertCompressedImage<T extends CompressResultType = 'blob'>(
  compressedResults: any,
  targetFormat: SupportedConvertFormat,
  options: ConvertOptions & { type?: T } = {}
): Promise<ConvertResult<T>[]> {
  if (!compressedResults.allResults) {
    throw new Error('Input must be compressed results with allResults property')
  }

  const convertPromises = compressedResults.allResults
    .filter((result: any) => result.success)
    .map(async (compressedResult: any) => {
      try {
        const blob = compressedResult.result instanceof Blob 
          ? compressedResult.result 
          : new Blob([compressedResult.result])
        
        const file = new File([blob], `compressed-${compressedResult.tool}.img`, { 
          type: blob.type || 'image/jpeg' 
        })
        
        const convertResult = await convertImage(file, targetFormat, options)
        
        return {
          ...convertResult,
          tool: compressedResult.tool,
          originalCompressedSize: compressedResult.compressedSize
        }
      } catch (error) {
        return {
          format: targetFormat,
          result: compressedResult.result,
          originalSize: compressedResult.originalSize,
          convertedSize: compressedResult.compressedSize,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          tool: compressedResult.tool,
          originalCompressedSize: compressedResult.compressedSize
        }
      }
    })

  return await Promise.all(convertPromises)
}

export async function convertWithCompressionComparison<T extends CompressResultType = 'blob'>(
  file: File,
  targetFormat: SupportedConvertFormat,
  options: (ConvertOptions & CompressOptions & { type?: T }) = {}
): Promise<ConvertWithCompressionResult<T>> {
  const { type = 'blob' as T, ...compressAndConvertOptions } = options

  const [compressFirstResult, convertFirstResult] = await Promise.all([
    compressFirstThenConvert(file, targetFormat, { ...compressAndConvertOptions, type }),
    convertFirstThenCompress(file, targetFormat, { ...compressAndConvertOptions, type })
  ])

  const bestStrategy = compressFirstResult.convertedSize <= convertFirstResult.convertedSize 
    ? 'compress-first' 
    : 'convert-first'

  const bestResult = bestStrategy === 'compress-first' 
    ? compressFirstResult.result 
    : convertFirstResult.result

  return {
    format: targetFormat,
    compressFirstResult: compressFirstResult.result,
    convertFirstResult: convertFirstResult.result,
    compressFirstSize: compressFirstResult.convertedSize,
    convertFirstSize: convertFirstResult.convertedSize,
    bestStrategy,
    bestResult
  }
}

async function compressFirstThenConvert<T extends CompressResultType = 'blob'>(
  file: File,
  targetFormat: SupportedConvertFormat,
  options: ConvertOptions & CompressOptions & { type?: T }
): Promise<ConvertResult<T>> {
  const compressResult = await compress(file, options)
  const compressedBlob = compressResult instanceof Blob ? compressResult : new Blob([compressResult])
  const compressedFile = new File([compressedBlob], file.name, { type: compressedBlob.type || file.type })
  
  return await convertImage(compressedFile, targetFormat, options)
}

async function convertFirstThenCompress<T extends CompressResultType = 'blob'>(
  file: File,
  targetFormat: SupportedConvertFormat,
  options: ConvertOptions & CompressOptions & { type?: T }
): Promise<ConvertResult<T>> {
  const convertResult = await convertImage(file, targetFormat, { quality: options.quality, type: 'blob' })
  
  if (!convertResult.success) {
    return {
      ...convertResult,
      result: await convertBlobToType(file, options.type || 'blob' as T, file.name) as CompressResult<T>
    }
  }

  const convertedBlob = convertResult.result as Blob
  const convertedFile = new File([convertedBlob], `converted.${targetFormat}`, { 
    type: `image/${targetFormat === 'jpg' ? 'jpeg' : targetFormat}` 
  })
  
  const compressResult = await compress(convertedFile, options)
  const finalResult = await convertBlobToType(
    compressResult instanceof Blob ? compressResult : new Blob([compressResult]),
    options.type || 'blob' as T,
    `converted-compressed.${targetFormat}`
  )

  return {
    format: targetFormat,
    result: finalResult,
    originalSize: file.size,
    convertedSize: (compressResult instanceof Blob ? compressResult : new Blob([compressResult])).size,
    success: true
  }
}

export default {
  convertImage,
  convertToAllFormats,
  convertCompressedImage,
  convertWithCompressionComparison,
  isSupportedFormat,
  getSupportedFormats
}