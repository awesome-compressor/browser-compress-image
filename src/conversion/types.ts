export type TargetFormat = 'png' | 'jpeg' | 'webp' | 'ico'

export interface ImageConvertOptions {
  targetFormat: TargetFormat
  quality?: number // 0-1，仅 lossy 生效（jpeg/webp）
  preserveExif?: boolean // 仅 jpeg 有效；跨格式多数情况下会被剥离
  // 预留：位深/调色盘/多尺寸（ico）等
  [k: string]: any
}

export interface ImageConvertResult {
  blob: Blob
  mime: string
  duration: number
}
