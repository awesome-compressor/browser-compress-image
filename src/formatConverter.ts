import type { CompressOptions, CompressResult, CompressResultType, MultipleCompressResults } from './types'
import { compress } from './compress'
import { convertImage, convertCompressedImage, convertWithCompressionComparison, getSupportedFormats, isSupportedFormat } from './imageConvert'
import type { SupportedConvertFormat, ConvertResult } from './imageConvert'

// Enhanced conversion result interface
export interface EnhancedConvertResult<T extends CompressResultType = 'blob'> {
  format: SupportedConvertFormat
  compressFirstResult: CompressResult<T>
  convertFirstResult: CompressResult<T>
  compressFirstSize: number
  convertFirstSize: number
  bestStrategy: 'compress-first' | 'convert-first'
  bestResult: CompressResult<T>
  bestSize: number
  efficiencyScore: number // 0-100, higher is better
  qualityRatio: number // estimated quality preservation
}

// Batch conversion options
export interface BatchConvertOptions extends CompressOptions {
  formats?: SupportedConvertFormat[]
  includeOriginal?: boolean
  analyzeEfficiency?: boolean
  maxConcurrent?: number
}

// Conversion comparison result
export interface ConversionComparisonResult<T extends CompressResultType = 'blob'> {
  originalFile: File
  conversions: EnhancedConvertResult<T>[]
  recommendedFormat: SupportedConvertFormat
  bestOverallResult: CompressResult<T>
  sizeSavings: number
  conversionSummary: {
    totalFormats: number
    successfulFormats: number
    averageEfficiency: number
    bestEfficiency: number
  }
}

/**
 * Enhanced format converter for compressed images with strategy comparison
 * Supports both compress-first and convert-first approaches with efficiency analysis
 */
export class FormatConverter {
  private maxConcurrent: number

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent
  }

  /**
   * Convert compressed results to different formats
   * 接受压缩结果，转换成指定格式
   */
  async convertFromCompressedResults<T extends CompressResultType = 'blob'>(
    compressedResults: MultipleCompressResults<any>,
    targetFormats: SupportedConvertFormat[],
    options: { type?: T; quality?: number } = {}
  ): Promise<Array<{ format: SupportedConvertFormat; results: ConvertResult<T>[] }>> {
    const { type = 'blob' as T, quality = 0.9 } = options

    if (!compressedResults.allResults || compressedResults.allResults.length === 0) {
      throw new Error('No compressed results provided for conversion')
    }

    console.log(`Converting ${compressedResults.allResults.length} compressed results to ${targetFormats.length} formats`)

    const conversions = []
    
    for (const format of targetFormats) {
      try {
        const convertResults = await convertCompressedImage(
          compressedResults,
          format,
          { quality, type }
        )
        
        conversions.push({
          format,
          results: convertResults
        })
      } catch (error) {
        console.error(`Failed to convert to ${format}:`, error)
        conversions.push({
          format,
          results: []
        })
      }
    }

    return conversions
  }

  /**
   * Convert original file to multiple formats with compression strategy comparison
   * 支持原图转换+压缩策略比较
   */
  async convertWithStrategyComparison<T extends CompressResultType = 'blob'>(
    file: File,
    options: BatchConvertOptions & { type?: T } = {}
  ): Promise<ConversionComparisonResult<T>> {
    const {
      formats = this.getRecommendedFormats(file),
      type = 'blob' as T,
      quality = 0.6,
      analyzeEfficiency = true,
      ...compressOptions
    } = options

    console.log(`Starting strategy comparison for ${file.name} with ${formats.length} formats`)

    const conversions: EnhancedConvertResult<T>[] = []
    
    // Process formats with controlled concurrency
    const chunks = this.chunkArray(formats, this.maxConcurrent)
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (format) => {
        try {
          return await this.compareConversionStrategies(file, format, { 
            ...compressOptions, 
            quality, 
            type 
          })
        } catch (error) {
          console.error(`Strategy comparison failed for ${format}:`, error)
          return null
        }
      })
      
      const chunkResults = await Promise.all(chunkPromises)
      conversions.push(...chunkResults.filter(result => result !== null))
    }

    // Analyze results and find recommendations
    const analysis = this.analyzeConversionResults(conversions, file.size)
    
    return {
      originalFile: file,
      conversions,
      recommendedFormat: analysis.recommendedFormat,
      bestOverallResult: analysis.bestResult,
      sizeSavings: analysis.sizeSavings,
      conversionSummary: analysis.summary
    }
  }

  /**
   * Compare compress-first vs convert-first strategies for a specific format
   */
  private async compareConversionStrategies<T extends CompressResultType = 'blob'>(
    file: File,
    format: SupportedConvertFormat,
    options: CompressOptions & { type?: T } = {}
  ): Promise<EnhancedConvertResult<T>> {
    const { type = 'blob' as T } = options

    console.log(`Comparing strategies for ${format} conversion`)

    // Strategy 1: Compress first, then convert
    const compressFirst = await this.compressFirstThenConvert(file, format, options)
    
    // Strategy 2: Convert first, then compress  
    const convertFirst = await this.convertFirstThenCompress(file, format, options)

    // Determine best strategy
    const compressFirstSize = compressFirst.result instanceof Blob ? compressFirst.result.size : 0
    const convertFirstSize = convertFirst.result instanceof Blob ? convertFirst.result.size : 0
    
    const bestStrategy = compressFirstSize <= convertFirstSize ? 'compress-first' : 'convert-first'
    const bestResult = bestStrategy === 'compress-first' ? compressFirst.result : convertFirst.result
    const bestSize = Math.min(compressFirstSize, convertFirstSize)

    // Calculate efficiency metrics
    const efficiencyScore = this.calculateEfficiencyScore(file.size, bestSize, format)
    const qualityRatio = this.estimateQualityRatio(file, format, options.quality || 0.6)

    return {
      format,
      compressFirstResult: compressFirst.result,
      convertFirstResult: convertFirst.result,
      compressFirstSize,
      convertFirstSize,
      bestStrategy,
      bestResult,
      bestSize,
      efficiencyScore,
      qualityRatio
    }
  }

  /**
   * Compress first, then convert approach
   */
  private async compressFirstThenConvert<T extends CompressResultType = 'blob'>(
    file: File,
    format: SupportedConvertFormat,
    options: CompressOptions & { type?: T }
  ): Promise<ConvertResult<T>> {
    // First compress the original file
    const compressedBlob = await compress(file, options)
    const blob = compressedBlob instanceof Blob ? compressedBlob : new Blob([compressedBlob])
    
    // Create a new file from compressed blob
    const compressedFile = new File([blob], file.name, { type: blob.type || file.type })
    
    // Then convert the compressed file
    return await convertImage(compressedFile, format, { quality: options.quality, type: options.type })
  }

  /**
   * Convert first, then compress approach
   */
  private async convertFirstThenCompress<T extends CompressResultType = 'blob'>(
    file: File,
    format: SupportedConvertFormat,
    options: CompressOptions & { type?: T }
  ): Promise<ConvertResult<T>> {
    // First convert to target format
    const convertResult = await convertImage(file, format, { quality: options.quality, type: 'blob' })
    
    if (!convertResult.success || !(convertResult.result instanceof Blob)) {
      return {
        ...convertResult,
        result: convertResult.result as CompressResult<T>
      }
    }

    // Then compress the converted file
    const convertedFile = new File([convertResult.result], `converted.${format}`, {
      type: `image/${format === 'jpg' ? 'jpeg' : format}`
    })
    
    const compressedBlob = await compress(convertedFile, options)
    const finalBlob = compressedBlob instanceof Blob ? compressedBlob : new Blob([compressedBlob])
    
    // Convert back to requested type
    const result = options.type === 'blob' 
      ? finalBlob 
      : options.type === 'base64'
        ? await this.blobToBase64(finalBlob)
        : URL.createObjectURL(finalBlob)

    return {
      format,
      result: result as CompressResult<T>,
      originalSize: file.size,
      convertedSize: finalBlob.size,
      success: true
    }
  }

  /**
   * Get recommended formats for a file type
   */
  private getRecommendedFormats(file: File): SupportedConvertFormat[] {
    const availableFormats = getSupportedFormats(file.type)
    
    // Prioritize formats based on file type and use case
    const formatPriority: Record<string, SupportedConvertFormat[]> = {
      'image/png': ['webp', 'jpeg', 'jpg'],
      'image/jpeg': ['webp', 'png'],
      'image/jpg': ['webp', 'png'],
      'image/webp': ['jpeg', 'png'],
    }

    return formatPriority[file.type] || availableFormats
  }

  /**
   * Analyze conversion results and provide recommendations
   */
  private analyzeConversionResults<T extends CompressResultType = 'blob'>(
    conversions: EnhancedConvertResult<T>[],
    originalSize: number
  ) {
    const successful = conversions.filter(c => c.bestSize > 0)
    
    if (successful.length === 0) {
      throw new Error('No successful conversions found')
    }

    // Find best overall result by efficiency score
    const bestConversion = successful.reduce((best, current) => 
      current.efficiencyScore > best.efficiencyScore ? current : best
    )

    const totalEfficiency = successful.reduce((sum, c) => sum + c.efficiencyScore, 0)
    const averageEfficiency = totalEfficiency / successful.length
    const bestEfficiency = Math.max(...successful.map(c => c.efficiencyScore))

    const sizeSavings = ((originalSize - bestConversion.bestSize) / originalSize) * 100

    return {
      recommendedFormat: bestConversion.format,
      bestResult: bestConversion.bestResult,
      sizeSavings,
      summary: {
        totalFormats: conversions.length,
        successfulFormats: successful.length,
        averageEfficiency,
        bestEfficiency
      }
    }
  }

  /**
   * Calculate efficiency score (0-100)
   */
  private calculateEfficiencyScore(originalSize: number, compressedSize: number, format: SupportedConvertFormat): number {
    if (compressedSize <= 0 || originalSize <= 0) return 0

    const compressionRatio = (originalSize - compressedSize) / originalSize
    const baseScore = Math.max(0, compressionRatio * 100)

    // Format-specific bonus
    const formatBonus = {
      'webp': 10,
      'jpeg': 5,
      'jpg': 5,
      'png': 0
    }

    return Math.min(100, baseScore + (formatBonus[format] || 0))
  }

  /**
   * Estimate quality preservation ratio
   */
  private estimateQualityRatio(file: File, format: SupportedConvertFormat, quality: number): number {
    // Simple heuristic based on format characteristics
    const formatQuality = {
      'webp': 0.95,
      'jpeg': 0.85,
      'jpg': 0.85,
      'png': 1.0
    }

    return (formatQuality[format] || 0.85) * quality
  }

  /**
   * Utility to chunk array for concurrent processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Convert blob to base64
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
}

// Export singleton instance
export const formatConverter = new FormatConverter()

// Export main functions for easy import
export async function convertCompressedToFormats<T extends CompressResultType = 'blob'>(
  compressedResults: MultipleCompressResults<any>,
  targetFormats: SupportedConvertFormat[],
  options: { type?: T; quality?: number } = {}
) {
  return formatConverter.convertFromCompressedResults(compressedResults, targetFormats, options)
}

export async function analyzeFormatConversion<T extends CompressResultType = 'blob'>(
  file: File,
  options: BatchConvertOptions & { type?: T } = {}
) {
  return formatConverter.convertWithStrategyComparison(file, options)
}

// Utility functions
export function getOptimalFormats(file: File): SupportedConvertFormat[] {
  if (!isSupportedFormat(file.type)) {
    return []
  }

  const formatRecommendations = {
    'image/png': ['webp', 'jpeg'],
    'image/jpeg': ['webp'],
    'image/jpg': ['webp'],
    'image/webp': ['jpeg', 'png'],
  }

  return formatRecommendations[file.type as keyof typeof formatRecommendations] || []
}

export default {
  FormatConverter,
  formatConverter,
  convertCompressedToFormats,
  analyzeFormatConversion,
  getOptimalFormats
}