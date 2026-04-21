# 性能与执行模型

这份文档解释当前实现的执行模型，以及今天最值得默认采用的用法。

## 当前推荐

基于当前实现，最稳妥的默认策略是：

- 业务默认入口优先用 `compressDecision()`
- 只拿结果、不关心解释面时再用 `compress()`
- 需要按业务目标压体积时优先用 `objective.targetBytes`
- 需要队列化批处理时用 `compressEnhanced()`
- 除非你在明确测试实验路径，否则先不要默认打开 `useWorker`

这和当前的
[`specs/001-core-api-contract.md`](../specs/001-core-api-contract.md)、
[`specs/002-worker-job-lifecycle.md`](../specs/002-worker-job-lifecycle.md)
保持一致。

## 执行模型

### `compress()`

- 根据输入 MIME 类型选择内建工具集合
- 并行跑多个工具尝试
- 返回最小的成功结果
- `returnAllResults: true` 时可以返回全部候选结果
- 只缓存单结果路径
- `objective` 打开后会改为沿固定质量梯度搜索，并在命中 `targetBytes` 时提前停止

### `compressDecision()`

- 复用 `compressWithStats()` 的压缩决策
- 直接返回最终结果载体，不需要你自己再做二次转换
- 默认把 `bestTool`、`compressionRatio`、`totalDuration`、`toolsUsed` 一起带回
- `output` 和 `objective` 打开时，也会把解释结果一并带回

### `compressEnhanced()`

- 提供 `preprocess` 时会先做预处理
- 默认走共享队列
- `useQueue: false` 时可以绕过队列
- Worker 执行是 best-effort，不是 worker-only
- Worker 被跳过或失败时会回退到主线程路径

### `compressEnhancedBatch()`

- 每个文件都会提交一个增强压缩调用
- 会为每个文件推导一个队列优先级
- 会先等待所有任务 settle，再重新抛出失败

## 队列建议

对于拖拽上传、文件夹上传、多文件压缩这类更大的 UI 流程，当前最适合生产使用
的路径仍然是队列化执行。

You can inspect the shared queue:

```ts
import {
  clearCompressionQueue,
  configureCompression,
  getCompressionStats,
} from '@awesome-compressor/browser-compress-image'

configureCompression({ maxConcurrency: 3 })

console.log(getCompressionStats().queue)

clearCompressionQueue()
```

## Worker 状态

Worker 路径仍然是实验性的。

当前行为：

- `useWorker: true` 是 best-effort
- 只有 worker 探测确认支持后才会尝试
- 大于 `50MB` 的文件会跳过 worker 路径
- worker 失败时会回退到主线程压缩

这意味着 worker 还不是当前库的性能基线。如果你想要可预期行为，优先使用队
列化主线程路径。

## 工具加载与打包预期

当前发布包会产出一个共享根入口和若干懒加载 chunk。公开 subpath 入口目前仍
然解析到同一个根构建输出。

实际含义：

- 注册 API 主要帮助你控制运行时使用哪些工具
- 它们 **不会** 自动保证最终 bundle 一定更小
- 如果你很在意 bundle size，还是要在自己的 bundler 里验证

补充阅读：

- [`docs/tree-shaking-guide.md`](./tree-shaking-guide.md)
- [`specs/003-packaging-and-release-contract.md`](../specs/003-packaging-and-release-contract.md)

## 观测与调试

当你想默认拿“结果 + 解释”时，用 `compressDecision()`。

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
console.log(decision.outputDecision)
console.log(decision.objectiveDecision)
```

如果你只想检查决策结果、自己处理最终结果载体，用 `compressWithStats()`。

```ts
import { compressWithStats } from '@awesome-compressor/browser-compress-image'

const stats = await compressWithStats(file, {
  quality: 0.8,
  output: 'auto',
})

console.log(stats.bestTool)
console.log(stats.totalDuration)
console.log(stats.toolsUsed)
console.log(stats.outputDecision)
```

如果你想检查 targetBytes 搜索过程，用 `objectiveDecision`：

```ts
const stats = await compressWithStats(file, {
  objective: {
    targetBytes: 300 * 1024,
    goal: 'balanced',
  },
})

console.log(stats.objectiveDecision)
```

当你想打开运行时可观测性时，用 logger 钩子：

```ts
import {
  logger,
  resetLogger,
  setLogger,
} from '@awesome-compressor/browser-compress-image'

logger.enable()

setLogger({
  enabled: true,
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
})

resetLogger()
```

## 评估基线

如果你不想只和原图比较，可以把评估基线显式传进来。

```ts
import {
  assessQuality,
  buildConversionColumn,
} from '@awesome-compressor/browser-compress-image'

const quality = await assessQuality(referenceBlob, candidateBlob, {
  includeHeatmap: false,
})

const column = await buildConversionColumn({
  file,
  convertOptions: {
    targetFormat: 'webp',
  },
  evaluation: {
    baseline: referenceBlob,
    label: 'delivery',
    includeQualityMetrics: true,
    includeHeatmap: false,
  },
})

console.log(column.items[0]?.compressionRatio)
console.log(column.items[0]?.evaluationRatio)
console.log(column.items[0]?.qualityMetrics)
```

当前口径：

- `compressionRatio` 继续相对原图
- `evaluationRatio` 相对你选的 baseline
- `qualityMetrics` 只在 `includeQualityMetrics: true` 时计算

## 状态入口

生成的能力矩阵和导出状态页见 [`docs/status.md`](./status.md)。
