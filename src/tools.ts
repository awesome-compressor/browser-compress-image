// 这个文件提供了各个压缩工具的独立导出，允许用户按需导入

export { default as compressWithBrowserImageCompression } from './tools/compressWithBrowserImageCompression'
export { default as compressWithCompressorJS } from './tools/compressWithCompressorJS'
export { default as compressWithCanvas } from './tools/compressWithCanvas'
export { default as compressWithGifsicle } from './tools/compressWithGifsicle'
export { default as compressWithJsquash } from './tools/compressWithJsquash'
export { compressWithTinyPng } from './tools/compressWithTinyPng'

// 导出工具注册相关
export {
  ToolRegistry,
  globalToolRegistry,
  compressWithTools,
  type CompressorTool,
  type CompressorFunction,
  type CompressWithToolsOptions,
} from './compressWithTools'

// 预设工具注册器
export function registerAllTools() {
  const { globalToolRegistry } = require('./compressWithTools')

  // 动态导入所有工具
  globalToolRegistry.registerTool(
    'browser-image-compression',
    require('./tools/compressWithBrowserImageCompression').default,
    ['png', 'jpeg', 'webp', 'others'],
  )

  globalToolRegistry.registerTool(
    'compressorjs',
    require('./tools/compressWithCompressorJS').default,
    ['jpeg', 'others'],
  )

  globalToolRegistry.registerTool(
    'canvas',
    require('./tools/compressWithCanvas').default,
    ['png', 'jpeg', 'webp', 'others'],
  )

  globalToolRegistry.registerTool(
    'gifsicle',
    require('./tools/compressWithGifsicle').default,
    ['gif'],
  )

  globalToolRegistry.registerTool(
    'jsquash',
    require('./tools/compressWithJsquash').default,
    ['png', 'jpeg', 'webp', 'others'],
  )

  // TinyPNG 需要配置，不自动注册
}

// 注册特定工具的便捷函数
export function registerBrowserImageCompression() {
  const { globalToolRegistry } = require('./compressWithTools')
  globalToolRegistry.registerTool(
    'browser-image-compression',
    require('./tools/compressWithBrowserImageCompression').default,
    ['png', 'jpeg', 'webp', 'others'],
  )
}

export function registerCompressorJS() {
  const { globalToolRegistry } = require('./compressWithTools')
  globalToolRegistry.registerTool(
    'compressorjs',
    require('./tools/compressWithCompressorJS').default,
    ['jpeg', 'others'],
  )
}

export function registerCanvas() {
  const { globalToolRegistry } = require('./compressWithTools')
  globalToolRegistry.registerTool(
    'canvas',
    require('./tools/compressWithCanvas').default,
    ['png', 'jpeg', 'webp', 'others'],
  )
}

export function registerGifsicle() {
  const { globalToolRegistry } = require('./compressWithTools')
  globalToolRegistry.registerTool(
    'gifsicle',
    require('./tools/compressWithGifsicle').default,
    ['gif'],
  )
}

export function registerJsquash() {
  const { globalToolRegistry } = require('./compressWithTools')
  globalToolRegistry.registerTool(
    'jsquash',
    require('./tools/compressWithJsquash').default,
    ['png', 'jpeg', 'webp', 'others'],
  )
}

export function registerTinyPng() {
  const { globalToolRegistry } = require('./compressWithTools')
  globalToolRegistry.registerTool(
    'tinypng',
    require('./tools/compressWithTinyPng').compressWithTinyPng,
    ['png', 'jpeg', 'webp'],
  )
}
