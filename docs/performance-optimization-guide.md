# 图片压缩性能优化指南

## 概述

本库已经实现了多项性能优化，解决了大量图片压缩时的性能瓶颈问题。主要优化包括：

1. **队列管理系统** - 控制并发数量，避免系统过载
2. **Worker支持** - 利用Web Workers进行后台压缩计算
3. **设备性能自适应** - 根据设备性能动态调整并发数量
4. **内存管理** - 智能资源管理和内存清理

## 使用方法

### 1. 增强的压缩函数（推荐）

使用新的 `compressEnhanced` 函数获得最佳性能：

```typescript
import { compressEnhanced } from 'browser-compress-image'

// 单个文件压缩
const result = await compressEnhanced(file, {
  quality: 0.8,
  useWorker: true, // 启用Worker支持
  useQueue: true, // 启用队列管理
  priority: 10, // 设置优先级（可选）
  timeout: 30000, // 设置超时时间
})

// 批量文件压缩
import { compressEnhancedBatch } from 'browser-compress-image'

const results = await compressEnhancedBatch(files, {
  quality: 0.8,
  useWorker: true,
  useQueue: true,
})
```

### 2. 兼容性说明

- **Worker支持**: 自动检测浏览器Worker支持，不支持时自动降级到主线程
- **DOM依赖工具**: `canvas` 和 `jsquash` 工具使用DOM API，在Worker中会自动降级到主线程
- **Worker兼容工具**: `browser-image-compression`, `compressorjs`, `gifsicle`, `tinypng` 支持Worker

## 性能特性

### 1. 智能并发控制

系统会根据设备性能自动调整并发数量：

- **移动设备**: 最多2个并发任务
- **低性能设备**: 2个并发任务
- **中等性能设备**: 3个并发任务
- **高性能设备**: 最多5个并发任务（基于CPU核心数）

```typescript
import {
  getCompressionStats,
  configureCompression,
} from 'browser-compress-image'

// 查看当前状态
const stats = getCompressionStats()
console.log('队列统计:', stats.queue)
console.log('Worker支持:', stats.worker.supported)

// 手动调整并发数量（可选）
configureCompression({ maxConcurrency: 3 })
```

### 2. 设备性能检测

```typescript
import { PerformanceDetector } from 'browser-compress-image'

const detector = PerformanceDetector.getInstance()
const deviceInfo = detector.detectDevice()

console.log('设备信息:', {
  isMobile: deviceInfo.isMobile,
  cpuCores: deviceInfo.cpuCores,
  memoryGB: deviceInfo.memoryGB,
  performance: deviceInfo.estimatedPerformance,
})

// 获取建议的并发数量
const optimalConcurrency = detector.calculateOptimalConcurrency()
```

### 3. 内存管理

```typescript
import {
  memoryManager,
  checkMemoryBeforeOperation,
} from 'browser-compress-image'

// 检查内存状态
const memoryStats = memoryManager.getMemoryStats()
console.log('内存使用率:', memoryStats.memoryUsagePercentage + '%')

// 在大操作前检查内存
if (checkMemoryBeforeOperation(fileSize)) {
  // 内存充足，可以继续
  await compressEnhanced(file, options)
} else {
  console.warn('内存不足，建议减少并发任务')
}

// 手动清理内存（通常不需要）
memoryManager.performCleanup()
```

## 在应用中集成

### 替换现有压缩调用

如果你当前使用的是：

```typescript
// 旧的方式
const compressed = await compress(file, { quality: 0.8 })
```

可以直接替换为：

```typescript
// 新的优化方式
const compressed = await compressEnhanced(file, {
  quality: 0.8,
  useWorker: true,
  useQueue: true,
})
```

### 批量处理优化

对于大量图片的处理：

```typescript
// 替换 App.vue 中的批量压缩
async function compressImages(items: ImageItem[]) {
  // 使用增强的批量压缩
  const files = items.map((item) => item.file)

  try {
    const results = await compressEnhancedBatch(files, {
      quality: globalQuality.value,
      preserveExif: preserveExif.value,
      toolConfigs: enabledToolConfigs,
      useWorker: true,
      useQueue: true,
    })

    // 处理结果
    results.forEach((result, index) => {
      const item = items[index]
      if (item.compressedUrl) {
        URL.revokeObjectURL(item.compressedUrl)
      }
      item.compressedUrl = URL.createObjectURL(result)
      item.compressedSize = result.size
      item.compressionRatio =
        ((item.originalSize - result.size) / item.originalSize) * 100
    })
  } catch (error) {
    console.error('批量压缩失败:', error)
  }
}
```

## 性能监控

### 队列统计

```typescript
import { getCompressionStats } from 'browser-compress-image'

// 定期检查队列状态
setInterval(() => {
  const stats = getCompressionStats()
  console.log(
    `队列状态: 等待${stats.queue.pending}, 运行${stats.queue.running}, 完成${stats.queue.completed}`,
  )
}, 5000)
```

### 内存监控

```typescript
import { memoryManager } from 'browser-compress-image'

// 监控内存使用
setInterval(() => {
  const stats = memoryManager.getMemoryStats()
  if (stats.memoryUsagePercentage > 80) {
    console.warn('内存使用率过高:', stats.memoryUsagePercentage + '%')
  }
}, 10000)
```

## 最佳实践

1. **总是使用增强的压缩函数**: `compressEnhanced` 和 `compressEnhancedBatch`
2. **启用Worker**: 设置 `useWorker: true` 来利用后台处理
3. **启用队列**: 设置 `useQueue: true` 来控制并发
4. **设置合适的超时**: 为大文件设置较长的超时时间
5. **监控性能**: 定期检查队列和内存状态
6. **清理资源**: 不再需要的对象URL要及时清理

## 故障排除

### Worker不工作

```typescript
import { compressionWorkerManager } from 'browser-compress-image'

if (!compressionWorkerManager.isSupported()) {
  console.log('Worker不支持，将使用主线程压缩')
}
```

### 内存不足

```typescript
import { memoryManager } from 'browser-compress-image'

if (memoryManager.isMemoryCritical()) {
  // 减少并发数量
  configureCompression({ maxConcurrency: 1 })

  // 或清理内存
  memoryManager.performCleanup()
}
```

### 队列阻塞

```typescript
import { clearCompressionQueue } from 'browser-compress-image'

// 清空队列中的待处理任务
clearCompressionQueue()
```

## 迁移指南

### 从旧版本升级

1. 安装最新版本
2. 导入新的压缩函数
3. 替换压缩调用
4. 测试性能改进

### 配置选项

```typescript
// 高性能配置（桌面端）
const highPerformanceConfig = {
  useWorker: true,
  useQueue: true,
  priority: 10,
  timeout: 60000,
}

// 移动端配置
const mobileConfig = {
  useWorker: true,
  useQueue: true,
  priority: 5,
  timeout: 30000,
}

// 选择合适的配置
const config = /Mobile|Android|iOS/.test(navigator.userAgent)
  ? mobileConfig
  : highPerformanceConfig

await compressEnhanced(file, { quality: 0.8, ...config })
```
