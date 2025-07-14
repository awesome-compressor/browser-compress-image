// ========== 示例1: 最小化打包 - 只使用 Canvas 压缩 ==========
import {
  compressWithTools as compressWithToolsMinimal,
  globalToolRegistry as globalRegistryMinimal,
  compressWithCanvas,
} from '../src/index'

// 手动注册 Canvas 工具
globalRegistryMinimal.registerTool('canvas', compressWithCanvas, [
  'png',
  'jpeg',
  'webp',
])

export async function minimalCompress(file: File) {
  return compressWithToolsMinimal(file, {
    quality: 0.8,
    mode: 'keepSize',
  })
}

// ========== 示例2: 使用预设注册函数 ==========
import {
  compressWithTools as compressWithToolsOptimized,
  registerCanvas,
  registerCompressorJS,
} from '../src/index'

// 注册需要的工具
registerCanvas()
registerCompressorJS()

export async function optimizedCompress(file: File) {
  return compressWithToolsOptimized(file, {
    quality: 0.8,
    mode: 'keepSize',
  })
}

// ========== 示例3: 动态加载工具 ==========
import { compressWithTools as compressWithToolsSmart } from '../src/index'

async function loadToolForFileType(fileType: string) {
  if (fileType.includes('jpeg')) {
    // 动态导入 CompressorJS（专门优化 JPEG）
    const { registerCompressorJS } = await import('../src/index')
    registerCompressorJS()
  } else if (fileType.includes('gif')) {
    // 动态导入 Gifsicle（专门处理 GIF）
    const { registerGifsicle } = await import('../src/index')
    registerGifsicle()
  } else {
    // 其他格式使用 Canvas
    const { registerCanvas } = await import('../src/index')
    registerCanvas()
  }
}

export async function smartCompress(file: File) {
  // 根据文件类型动态加载最合适的工具
  await loadToolForFileType(file.type)

  return compressWithToolsSmart(file, {
    quality: 0.8,
    mode: 'keepSize',
  })
}

// ========== 示例4: 自定义工具注册表 ==========
import {
  compressWithTools as compressWithToolsCustom,
  ToolRegistry,
  compressWithCanvas as canvasTool,
  compressWithCompressorJS as compressorTool,
} from '../src/index'

export class CustomCompressor {
  private toolRegistry: ToolRegistry

  constructor() {
    this.toolRegistry = new ToolRegistry()

    // 只注册需要的工具
    this.toolRegistry.registerTool('canvas', canvasTool)
    this.toolRegistry.registerTool('compressorjs', compressorTool)

    // 设置优先级
    this.toolRegistry.setToolPriority('jpeg', ['compressorjs', 'canvas'])
    this.toolRegistry.setToolPriority('png', ['canvas'])
  }

  async compress(file: File, options = { quality: 0.8 }) {
    return compressWithToolsCustom(file, {
      ...options,
      toolRegistry: this.toolRegistry,
    })
  }
}

// ========== 示例5: 条件性工具加载 ==========
import { compressWithTools as compressWithToolsConditional } from '../src/index'

export class ConditionalCompressor {
  private toolsLoaded = new Set<string>()

  async ensureToolLoaded(toolName: string) {
    if (this.toolsLoaded.has(toolName)) return

    switch (toolName) {
      case 'canvas':
        const { registerCanvas } = await import('../src/index')
        registerCanvas()
        break
      case 'compressorjs':
        const { registerCompressorJS } = await import('../src/index')
        registerCompressorJS()
        break
      case 'jsquash':
        const { registerJsquash } = await import('../src/index')
        registerJsquash()
        break
    }

    this.toolsLoaded.add(toolName)
  }

  async compress(file: File, preferredTools: string[] = ['canvas']) {
    // 确保首选工具已加载
    for (const tool of preferredTools) {
      await this.ensureToolLoaded(tool)
    }

    return compressWithToolsConditional(file, {
      quality: 0.8,
      mode: 'keepSize',
    })
  }
}

// ========== 使用示例 ==========
export async function usageExamples() {
  const compressor = new ConditionalCompressor()

  // 这些是示例，实际使用时需要真实的 File 对象
  // const jpegFile = new File([], 'test.jpg', { type: 'image/jpeg' })
  // const pngFile = new File([], 'test.png', { type: 'image/png' })
  // const file = new File([], 'test.jpg', { type: 'image/jpeg' })

  // 压缩 JPEG 文件 - 只加载 CompressorJS
  // await compressor.compress(jpegFile, ['compressorjs'])

  // 压缩 PNG 文件 - 只加载 Canvas
  // await compressor.compress(pngFile, ['canvas'])

  // 需要高质量压缩 - 加载多个工具
  // await compressor.compress(file, ['jsquash', 'compressorjs', 'canvas'])
}
