export type TargetFormat = 'png' | 'jpeg' | 'webp' | 'ico'
export type SourceFormat =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'ico'
  | 'svg'
  | 'gif'
  | 'bmp'

export interface ImageConvertOptions {
  targetFormat: TargetFormat
  quality?: number // 0-1，仅 lossy 生效（jpeg/webp）
  preserveExif?: boolean // 仅 jpeg 有效；跨格式多数情况下会被剥离
  width?: number // SVG rendering width (defaults to SVG's intrinsic width)
  height?: number // SVG rendering height (defaults to SVG's intrinsic height)
  // 预留：位深/调色盘/多尺寸（ico）等
  [k: string]: any
}

export interface ImageConvertResult {
  blob: Blob
  mime: string
  duration: number
}
