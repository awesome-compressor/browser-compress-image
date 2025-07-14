# 工具配置指南

本文档展示了如何根据不同场景选择和配置压缩工具，以优化打包体积和性能。

## 配置策略概览

### 1. 最小体积配置 (≈8-10KB)

适用于移动端应用、博客等对打包体积敏感的场景。

```typescript
import { compressWithTools, registerCanvas } from 'browser-compress-image'

// 只注册 Canvas 工具
registerCanvas()

const result = await compressWithTools(file, {
  quality: 0.8,
  mode: 'keepSize',
})
```

**优点**: 体积最小，兼容性最好，无外部依赖  
**缺点**: 压缩效果一般，功能有限  
**适用场景**: 移动端、博客、简单 Web 应用

### 2. 平衡配置 (≈40-50KB)

适用于大多数 Web 应用，平衡体积和质量。

```typescript
import {
  compressWithTools,
  registerCanvas,
  registerCompressorJS,
} from 'browser-compress-image'

registerCanvas()
registerCompressorJS()

const result = await compressWithTools(file, {
  quality: 0.8,
  mode: 'keepSize',
})
```

**优点**: 体积适中，JPEG 压缩效果好，功能较全  
**缺点**: 比最小配置稍大  
**适用场景**: 大多数 Web 应用、电商网站

### 3. 高质量配置 (≈100-150KB)

适用于图片处理应用，提供最佳压缩质量。

```typescript
import {
  compressWithTools,
  registerJsquash,
  registerCompressorJS,
  registerCanvas,
} from 'browser-compress-image'

registerJsquash()
registerCompressorJS()
registerCanvas()

const result = await compressWithTools(file, {
  quality: 0.9,
  mode: 'keepQuality',
})
```

**优点**: 压缩质量最佳，支持现代格式，算法先进  
**缺点**: 体积较大，需要 WASM 支持  
**适用场景**: 图片编辑器、专业图片处理应用

## 动态加载策略

### 按需加载工具

根据文件类型动态加载对应的压缩工具：

```typescript
import { compressWithTools } from 'browser-compress-image'

async function smartCompress(file: File) {
  // 根据文件类型动态加载工具
  if (file.type.includes('jpeg')) {
    const { registerCompressorJS } = await import('browser-compress-image')
    registerCompressorJS()
  } else if (file.type.includes('gif')) {
    const { registerGifsicle } = await import('browser-compress-image')
    registerGifsicle()
  } else {
    const { registerCanvas } = await import('browser-compress-image')
    registerCanvas()
  }

  return compressWithTools(file, { quality: 0.8 })
}
```

### 渐进式加载

从基础工具开始，根据需要逐步加载更多工具：

```typescript
class ProgressiveCompressor {
  private toolsLoaded = new Set<string>()

  async compress(file: File, quality: 'basic' | 'good' | 'excellent' = 'good') {
    // 基础工具总是可用
    if (!this.toolsLoaded.has('canvas')) {
      const { registerCanvas } = await import('browser-compress-image')
      registerCanvas()
      this.toolsLoaded.add('canvas')
    }

    // 根据质量要求加载额外工具
    if (quality === 'good' && !this.toolsLoaded.has('compressorjs')) {
      const { registerCompressorJS } = await import('browser-compress-image')
      registerCompressorJS()
      this.toolsLoaded.add('compressorjs')
    }

    if (quality === 'excellent' && !this.toolsLoaded.has('jsquash')) {
      const { registerJsquash } = await import('browser-compress-image')
      registerJsquash()
      this.toolsLoaded.add('jsquash')
    }

    return compressWithTools(file, { quality: 0.8 })
  }
}
```

## 环境特定配置

### Web 应用配置

```typescript
// webpack.config.js 或 vite.config.js 中配置代码分割
export default {
  build: {
    rollupOptions: {
      external: ['@jsquash/*'], // 可选：将 JSQuash 作为外部依赖
      output: {
        manualChunks: {
          'compression-tools': [
            'browser-compress-image/compressWithCanvas',
            'browser-compress-image/compressWithCompressorJS',
          ],
        },
      },
    },
  },
}
```

### Node.js 配置

Node.js 环境下不需要考虑打包体积，可以使用完整配置：

```typescript
import { registerAllTools, compressWithTools } from 'browser-compress-image'

// 注册所有工具
registerAllTools()

// 添加 TinyPNG 配置
const result = await compressWithTools(file, {
  quality: 0.8,
  toolConfigs: [
    {
      name: 'tinypng',
      apiKey: process.env.TINYPNG_API_KEY,
      enableCache: true,
      maxCacheSize: 1000,
    },
  ],
})
```

## 自定义工具注册表

### 创建独立的压缩实例

```typescript
import {
  ToolRegistry,
  compressWithTools,
  compressWithCanvas,
  compressWithCompressorJS,
} from 'browser-compress-image'

class CustomCompressor {
  private registry = new ToolRegistry()

  constructor() {
    // 只注册需要的工具
    this.registry.registerTool('canvas', compressWithCanvas)
    this.registry.registerTool('compressorjs', compressWithCompressorJS)

    // 设置工具优先级
    this.registry.setToolPriority('jpeg', ['compressorjs', 'canvas'])
    this.registry.setToolPriority('png', ['canvas'])
  }

  async compress(file: File, options = {}) {
    return compressWithTools(file, {
      quality: 0.8,
      ...options,
      toolRegistry: this.registry,
    })
  }
}
```

## 性能优化建议

### 1. 预加载关键工具

```typescript
// 在应用启动时预加载关键工具
import { registerCanvas } from 'browser-compress-image'

// 立即注册基础工具
registerCanvas()

// 延迟加载其他工具
setTimeout(async () => {
  const { registerCompressorJS } = await import('browser-compress-image')
  registerCompressorJS()
}, 1000)
```

### 2. 使用 Web Workers

```typescript
// worker.js
import { compressWithTools, registerCanvas } from 'browser-compress-image'

registerCanvas()

self.onmessage = async (e) => {
  const { file, options } = e.data
  const result = await compressWithTools(file, options)
  self.postMessage(result)
}
```

### 3. 缓存压缩结果

```typescript
class CachedCompressor {
  private cache = new Map()

  async compress(file: File, options = {}) {
    const key = `${file.name}-${file.size}-${JSON.stringify(options)}`

    if (this.cache.has(key)) {
      return this.cache.get(key)
    }

    const result = await compressWithTools(file, options)
    this.cache.set(key, result)
    return result
  }
}
```

## 体积分析表

| 配置       | 体积估算 | 包含工具                         | 适用场景       |
| ---------- | -------- | -------------------------------- | -------------- |
| 最小配置   | ~8KB     | Canvas                           | 移动端、博客   |
| 基础配置   | ~20KB    | Canvas + CompressorJS            | 企业官网       |
| 平衡配置   | ~50KB    | 上述 + Browser-Image-Compression | Web 应用       |
| 高质量配置 | ~150KB   | 上述 + JSQuash                   | 图片处理应用   |
| 完整配置   | ~200KB+  | 所有工具                         | 专业图片编辑器 |

## 最佳实践

1. **按需加载**: 根据实际使用的功能动态导入工具
2. **工具优先级**: 为不同文件格式设置合适的工具优先级
3. **环境检测**: 根据浏览器能力和网络状况选择工具
4. **渐进增强**: 从基础功能开始，逐步增强
5. **性能监控**: 监控压缩性能，优化工具组合

通过合理的配置策略，可以在保证功能的同时显著减少打包体积，提升应用性能。
