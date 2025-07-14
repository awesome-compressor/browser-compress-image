# 按需导入压缩工具

这个文档展示了如何使用新的可配置压缩系统，只导入你需要的压缩工具，减少打包体积。

## 基本用法

### 1. 使用特定的压缩工具

```typescript
// 只导入你需要的工具
import {
  compressWithTools,
  globalToolRegistry,
  registerCanvas,
  registerCompressorJS,
} from 'browser-compress-image'

// 注册你需要的工具
registerCanvas()
registerCompressorJS()

// 使用压缩
const compressedFile = await compressWithTools(file, {
  quality: 0.8,
  mode: 'keepSize',
})
```

### 2. 手动注册工具

```typescript
import {
  compressWithTools,
  globalToolRegistry,
  compressWithCanvas,
  compressWithCompressorJS,
} from 'browser-compress-image'

// 手动注册工具
globalToolRegistry.registerTool('canvas', compressWithCanvas, [
  'png',
  'jpeg',
  'webp',
])
globalToolRegistry.registerTool('compressorjs', compressWithCompressorJS, [
  'jpeg',
])

// 使用压缩
const result = await compressWithTools(file, { quality: 0.8 })
```

### 3. 使用自定义工具注册表

```typescript
import {
  compressWithTools,
  ToolRegistry,
  compressWithCanvas,
} from 'browser-compress-image'

// 创建自定义工具注册表
const customRegistry = new ToolRegistry()
customRegistry.registerTool('canvas', compressWithCanvas)

// 使用自定义注册表
const result = await compressWithTools(file, {
  quality: 0.8,
  toolRegistry: customRegistry,
})
```

## 工具注册函数

### 预设注册函数

```typescript
import {
  registerAllTools, // 注册所有工具
  registerBrowserImageCompression,
  registerCompressorJS,
  registerCanvas,
  registerGifsicle,
  registerJsquash,
  registerTinyPng,
} from 'browser-compress-image'

// 注册所有工具（如果你想要完整功能）
registerAllTools()

// 或者只注册你需要的工具
registerCanvas()
registerCompressorJS()
```

### 设置工具优先级

```typescript
import { globalToolRegistry } from 'browser-compress-image'

// 为 JPEG 文件设置工具优先级
globalToolRegistry.setToolPriority('jpeg', ['compressorjs', 'canvas'])

// 为 PNG 文件设置工具优先级
globalToolRegistry.setToolPriority('png', ['canvas'])
```

## 打包体积优化示例

### 最小化配置（只使用 Canvas）

```typescript
// 文件大小: ~10KB (仅包含 Canvas 压缩)
import { compressWithTools, registerCanvas } from 'browser-compress-image'

registerCanvas()

const result = await compressWithTools(file, { quality: 0.8 })
```

### 中等配置（Canvas + CompressorJS）

```typescript
// 文件大小: ~50KB (Canvas + CompressorJS)
import {
  compressWithTools,
  registerCanvas,
  registerCompressorJS,
} from 'browser-compress-image'

registerCanvas()
registerCompressorJS()

const result = await compressWithTools(file, { quality: 0.8 })
```

### 完整配置（所有工具）

```typescript
// 文件大小: ~200KB+ (包含所有压缩工具)
import { compressWithTools, registerAllTools } from 'browser-compress-image'

registerAllTools()

const result = await compressWithTools(file, { quality: 0.8 })
```

## 动态加载工具

如果你想要进一步优化，可以动态加载压缩工具：

```typescript
import { compressWithTools, globalToolRegistry } from 'browser-compress-image'

// 动态加载函数
async function loadCompressionTool(toolName: string) {
  switch (toolName) {
    case 'canvas':
      const { registerCanvas } = await import('browser-compress-image')
      registerCanvas()
      break
    case 'compressorjs':
      const { registerCompressorJS } = await import('browser-compress-image')
      registerCompressorJS()
      break
    // ... 其他工具
  }
}

// 根据需要动态加载
async function smartCompress(file: File) {
  if (file.type.includes('jpeg')) {
    await loadCompressionTool('compressorjs')
  } else {
    await loadCompressionTool('canvas')
  }

  return compressWithTools(file, { quality: 0.8 })
}
```

## 向后兼容

原来的 `compress` 函数仍然可用，它会自动加载所有必要的工具：

```typescript
import { compress } from 'browser-compress-image'

// 这仍然有效，但会包含所有工具
const result = await compress(file, 0.8)
```

## 建议的使用策略

1. **Web 应用**: 根据实际需求选择最少的工具组合
2. **Node.js 应用**: 可以使用完整配置，因为打包体积不是主要考虑因素
3. **移动端应用**: 优先使用 Canvas，它体积最小且兼容性好
4. **高质量需求**: 组合使用 CompressorJS 和 Canvas
5. **现代浏览器**: 可以考虑添加 JSQuash 获得更好的压缩效果

## 工具特点对比

| 工具                      | 体积 | 速度 | 质量 | 格式支持      | 特点           |
| ------------------------- | ---- | ---- | ---- | ------------- | -------------- |
| Canvas                    | 最小 | 最快 | 中等 | JPEG/PNG/WebP | 浏览器原生支持 |
| CompressorJS              | 小   | 快   | 高   | JPEG          | 专门优化 JPEG  |
| Browser-Image-Compression | 中   | 中   | 中   | 全格式        | 功能全面       |
| JSQuash                   | 大   | 慢   | 最高 | 现代格式      | WASM，最新算法 |
| Gifsicle                  | 中   | 中   | 高   | GIF           | GIF 专用       |
| TinyPNG                   | 小   | 快   | 高   | PNG/JPEG/WebP | 在线服务       |
