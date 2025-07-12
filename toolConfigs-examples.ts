// 使用示例：如何使用 toolConfigs 功能

import { compress } from './src/compress'

// 示例 1: 使用 TinyPNG 工具配置
async function compressWithTinyPNG(file: File) {
  const result = await compress(file, {
    quality: 0.8,
    mode: 'keepQuality',
    maxWidth: 1920,
    maxHeight: 1080,
    toolConfigs: [
      {
        name: 'tinypng',
        key: 'your-tinypng-api-key-here',
      },
    ],
  })

  return result
}

// 示例 2: 配置多个工具
async function compressWithMultipleToolConfigs(file: File) {
  const result = await compress(file, {
    quality: 0.7,
    mode: 'keepSize',
    toolConfigs: [
      {
        name: 'tinypng',
        key: 'your-tinypng-api-key',
        customOption: 'value',
      },
      {
        name: 'other-tool',
        apiKey: 'other-api-key',
        setting: 'high-quality',
      },
    ],
  })

  return result
}

// 示例 3: 获取所有工具的压缩结果
async function getAllCompressionResults(file: File) {
  const results = await compress(file, {
    quality: 0.8,
    returnAllResults: true,
    toolConfigs: [
      {
        name: 'tinypng',
        key: 'your-api-key',
      },
    ],
  })

  console.log('Best tool:', results.bestTool)
  console.log('All results:', results.allResults)

  return results
}

export {
  compressWithTinyPNG,
  compressWithMultipleToolConfigs,
  getAllCompressionResults,
}
