export type CompressResultType = 'blob' | 'file' | 'base64' | 'arrayBuffer'

// JSQuash 支持的输出格式类型
export type OutputType = 'avif' | 'jpeg' | 'jxl' | 'png' | 'webp'

export type CompressResult<T extends CompressResultType> = T extends 'blob'
  ? Blob
  : T extends 'file'
    ? File
    : T extends 'base64'
      ? string
      : T extends 'arrayBuffer'
        ? ArrayBuffer
        : never

/**
 * 工具配置接口
 */
export interface ToolConfig {
  /**
   * 工具名称
   */
  name: string
  /**
   * API 密钥或其他配置参数
   */
  key?: string
  /**
   * 其他自定义配置参数
   */
  [key: string]: any
}

export interface CompressOptions {
  /**
   * 压缩质量 (0-1)
   * @default 0.6
   */
  quality?: number

  /**
   * 压缩模式
   * - 'keepSize': 保持图片尺寸不变 (如100x100输入，输出仍为100x100)，只改变文件大小
   * - 'keepQuality': 保持图片质量不变，但可以改变尺寸
   * @default 'keepSize'
   */
  mode?: 'keepSize' | 'keepQuality'

  /**
   * 目标宽度 (仅在 keepQuality 模式下生效)
   */
  targetWidth?: number

  /**
   * 目标高度 (仅在 keepQuality 模式下生效)
   */
  targetHeight?: number

  /**
   * 最大宽度 (仅在 keepQuality 模式下生效)
   */
  maxWidth?: number

  /**
   * 最大高度 (仅在 keepQuality 模式下生效)
   */
  maxHeight?: number

  /**
   * 是否保留 EXIF 信息
   * @default false
   */
  preserveExif?: boolean

  /**
   * 是否返回所有工具的压缩结果
   * @default false
   */
  returnAllResults?: boolean

  /**
   * 返回结果类型
   * @default 'blob'
   */
  type?: CompressResultType

  /**
   * 工具配置数组，用于传入各个工具的特定配置
   * @example
   * [
   *   { name: 'tinypng', key: 'your-api-key' },
   *   { name: 'other-tool', customConfig: 'value' }
   * ]
   */
  toolConfigs?: ToolConfig[]
}

// 预处理：裁剪/旋转/翻转/缩放 相关类型
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ResizeOptions {
  /** 期望输出宽度（可与高度同时设定，若仅设定一项则按等比缩放） */
  targetWidth?: number
  /** 期望输出高度（可与宽度同时设定，若仅设定一项则按等比缩放） */
  targetHeight?: number
  /** 最大宽度（仅在未设置 targetWidth/Height 时生效） */
  maxWidth?: number
  /** 最大高度（仅在未设置 targetWidth/Height 时生效） */
  maxHeight?: number
  /** 调整策略，默认 contain */
  fit?: 'contain' | 'cover' | 'scale-down'
}

export interface PreprocessOptions {
  /** 像素坐标系中的裁剪区域（相对于原图 natural 尺寸） */
  crop?: CropRect
  /** 旋转角度（度），顺时针，支持任意角度 */
  rotate?: number
  /** 水平翻转 */
  flipHorizontal?: boolean
  /** 垂直翻转 */
  flipVertical?: boolean
  /** 缩放/调整大小选项 */
  resize?: ResizeOptions
  /** 预处理阶段输出 MIME 类型（默认使用原图类型，若不支持则回退 PNG） */
  outputType?: 'image/png' | 'image/jpeg' | 'image/webp'
  /** 输出质量（仅 jpeg/webp 生效，0-1） */
  outputQuality?: number
}

export interface CompressResultItem<T extends CompressResultType> {
  tool: string
  result: CompressResult<T>
  originalSize: number
  compressedSize: number
  compressionRatio: number
  duration: number
  success: boolean
  error?: string
}

export interface MultipleCompressResults<T extends CompressResultType> {
  bestResult: CompressResult<T>
  bestTool: string
  allResults: CompressResultItem<T>[]
  totalDuration: number
}
