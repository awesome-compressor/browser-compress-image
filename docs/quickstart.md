# 快速开始

这份文档只解释“怎么用起来最快”，不是行为契约。当前公开规则请以
[`specs/001-core-api-contract.md`](../specs/001-core-api-contract.md) 和
[`specs/002-worker-job-lifecycle.md`](../specs/002-worker-job-lifecycle.md)、
[`specs/005-compress-job-api.md`](../specs/005-compress-job-api.md)、
[`specs/009-decision-api.md`](../specs/009-decision-api.md)
为准。

## 先选入口

当你想把“自动决策 + 结果解释”作为默认体验时，用 `compressDecision()`。

```ts
import { compressDecision } from '@awesome-compressor/browser-compress-image'

const decision = await compressDecision(file, {
  objective: {
    targetBytes: 300 * 1024,
    goal: 'balanced',
    output: 'auto',
  },
  type: 'file',
})

console.log(decision.result)
console.log(decision.bestTool)
console.log(decision.compressionRatio)
console.log(decision.outputDecision)
console.log(decision.objectiveDecision)
```

当你想直接使用内建工具选择和最小 API 面时，用 `compress()`。

```ts
import { compress } from '@awesome-compressor/browser-compress-image'

const result = await compress(file, {
  quality: 0.8,
  output: 'auto',
  type: 'blob',
})
```

当你想控制到底允许哪些工具参与压缩时，用 `compressWithTools()`。

```ts
import {
  compressWithTools,
  registerCanvas,
  registerCompressorJS,
} from '@awesome-compressor/browser-compress-image'

registerCanvas()
registerCompressorJS()

const result = await compressWithTools(file, {
  quality: 0.8,
  type: 'blob',
})
```

当你需要队列化执行和可选预处理时，用 `compressEnhanced()`。

```ts
import { compressEnhanced } from '@awesome-compressor/browser-compress-image'

const result = await compressEnhanced(file, {
  quality: 0.8,
  useQueue: true,
  preprocess: {
    maxWidth: 1920,
    maxHeight: 1080,
  },
})
```

当你需要任务句柄、取消和阶段订阅时，用 `compressJob()`。

```ts
import { compressJob } from '@awesome-compressor/browser-compress-image'

const job = compressJob(file, {
  quality: 0.8,
  useQueue: true,
})

job.onStageChange((stage) => {
  console.log('stage:', stage)
})

job.cancel()

const result = await job.promise
```

当你想直接表达“压到多大以内”时，用 phase-1 objective mode。

```ts
const result = await compress(file, {
  objective: {
    targetBytes: 300 * 1024,
    goal: 'balanced',
    output: 'auto',
  },
  type: 'blob',
})
```

## 常见用法

### 尽量保留 EXIF

```ts
const result = await compress(file, {
  quality: 0.8,
  preserveExif: true,
})
```

当前实现下需要注意：

- `preserveExif: true` 只会保留支持 EXIF 的内建工具
- GIF 当前没有可保留 EXIF 的路径，会直接 reject

### 获取所有候选结果

```ts
const result = await compress(file, {
  quality: 0.8,
  output: 'auto',
  returnAllResults: true,
  type: 'blob',
})

console.log(result.bestTool)
console.log(result.bestResult)
console.log(result.allResults)
console.log(result.outputDecision)
```

当你想看每个工具的候选结果，而不只是最终赢家时，这个模式更合适。

### 获取统计信息而不是只拿结果

```ts
import { compressWithStats } from '@awesome-compressor/browser-compress-image'

const stats = await compressWithStats(file, {
  quality: 0.8,
  output: 'auto',
})

console.log(stats.bestTool)
console.log(stats.compressionRatio)
console.log(stats.toolsUsed)
console.log(stats.outputDecision)
```

### 获取单结果并保留解释面

```ts
import { compressDecision } from '@awesome-compressor/browser-compress-image'

const decision = await compressDecision(file, {
  quality: 0.8,
  output: 'auto',
  type: 'file',
})

console.log(decision.result)
console.log(decision.bestTool)
console.log(decision.toolsUsed)
console.log(decision.outputDecision)
```

### 查看 objective 决策结果

```ts
import { compressWithStats } from '@awesome-compressor/browser-compress-image'

const stats = await compressWithStats(file, {
  objective: {
    targetBytes: 300 * 1024,
    goal: 'balanced',
    output: 'auto',
  },
})

console.log(stats.compressedSize)
console.log(stats.objectiveDecision)
```

当前 phase-1 只支持：

- `targetBytes`
- `goal: 'fastest' | 'balanced' | 'visually-lossless'`
- `output`

需要注意：

- `compressWithTools()` 当前不支持 objective mode
- 如果没有候选满足 `targetBytes`，系统会回退到已评估候选里最小的结果

### 对非原图 baseline 做评估

```ts
import {
  assessQuality,
  buildConversionColumn,
} from '@awesome-compressor/browser-compress-image'

const quality = await assessQuality(deliveryBaseline, candidateBlob, {
  maxDimension: 512,
  includeHeatmap: false,
})

const column = await buildConversionColumn({
  file,
  convertOptions: {
    targetFormat: 'webp',
  },
  evaluation: {
    baseline: deliveryBaseline,
    label: 'delivery',
    includeQualityMetrics: true,
    includeHeatmap: false,
  },
})

console.log(quality.ssim)
console.log(column.items[0]?.evaluationRatio)
console.log(column.items[0]?.qualityMetrics)
```

这里要注意：

- `compressionRatio` 仍然相对原始输入文件
- `evaluationRatio` 才相对你传入的 baseline
- `evaluation.label` 不传时，默认是 `original` 或 `baseline`

### 让系统决定最终图片格式

```ts
const result = await compress(file, {
  quality: 0.8,
  output: 'auto',
  type: 'blob',
})
```

当前 phase-1 支持：

- `'preserve'`
- `'auto'`
- `'jpeg'`
- `'png'`
- `'webp'`

需要注意：

- `type` 仍然只控制返回载体
- `output` 才控制最终图片 MIME 类型
- `preserveExif: true` 时不会做跨格式输出转换
- GIF 输入当前不会在压缩 API 里做输出格式转换

## 输出类型

主 API 当前支持这些结果载体：

- `'blob'`：适合上传和存储
- `'file'`：适合保留原文件 basename 的场景
- `'base64'`：适合直接预览
- `'arrayBuffer'`：适合二进制处理链路

```ts
const blob = await compress(file, 0.6, 'blob')
const nextFile = await compress(file, 0.6, 'file')
const base64 = await compress(file, 0.6, 'base64')
const buffer = await compress(file, 0.6, 'arrayBuffer')
```

## 当前注意点

- `compressEnhanced()` 默认是队列化的主线程压缩
- `compressEnhanced({ useWorker: true })` 仍然是实验性 best-effort 路径
- 能力矩阵和导出状态在 [`docs/status.md`](./status.md)
- 打包与导出保证在
  [`specs/003-packaging-and-release-contract.md`](../specs/003-packaging-and-release-contract.md)

## 下一步阅读

- 场景推荐组合： [`docs/presets.md`](./presets.md)
- 性能与执行模型： [`docs/performance.md`](./performance.md)
- 生成的能力矩阵： [`docs/status.md`](./status.md)
