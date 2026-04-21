<div align="center">
  <img src="./assets/kv.png" width="120" alt="Browser Compress">

### Browser Compress Image

</div>

# Browser Compress Image

一个浏览器端图片压缩库，支持多压缩路径、多输出类型、目标驱动压缩、队列化增
强压缩，以及生成式状态页、行为契约文档和基线可选的评估流程。

<p align="center">
  <a href="https://www.npmjs.com/package/@awesome-compressor/browser-compress-image"><img src="https://img.shields.io/npm/v/@awesome-compressor/browser-compress-image.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="Version"></a>
  <a href="https://www.npmjs.com/package/@awesome-compressor/browser-compress-image"><img src="https://img.shields.io/npm/dm/@awesome-compressor/browser-compress-image.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="Downloads"></a>
  <a href="https://github.com/Simon-He95/browser-compress-image"><img src="https://img.shields.io/github/stars/Simon-He95/browser-compress-image.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="Stars"></a>
  <a href="https://github.com/Simon-He95/browser-compress-image/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Simon-He95/browser-compress-image.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="License"></a>
</p>

> 当前状态（npm `0.0.5`）：主线程压缩、队列管理、预处理和多工具比对已经可
> 直接使用；Worker 压缩仍然是实验性能力，默认关闭。

README 现在只承担定位、安装、快速开始和状态入口。能力矩阵与公开行为契约
统一放在 `docs/` 和 `specs/`。

## 安装

```bash
npm install @awesome-compressor/browser-compress-image
```

## 快速开始

当你想拿到最终结果，同时保留工具选择、体积变化和决策解释时，用
`compressDecision()`。

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

当你想直接使用内建工具选择、只拿压缩结果时，用 `compress()`。

```ts
import { compress } from '@awesome-compressor/browser-compress-image'

const result = await compress(file, {
  quality: 0.8,
  output: 'auto',
  type: 'blob',
})
```

当你想明确控制允许参与压缩的工具集合时，用 `compressWithTools()`。

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
})
```

当你需要队列化执行和预处理时，用 `compressEnhanced()`。

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
})

job.onStageChange((stage) => {
  console.log(stage)
})

const result = await job.promise
```

## 文档

- 快速开始： [docs/quickstart.md](./docs/quickstart.md)
- 路线图： [docs/roadmap.md](./docs/roadmap.md)
- 提案总览： [docs/proposals.md](./docs/proposals.md)
- 部署说明： [docs/deployment.md](./docs/deployment.md)
- 场景推荐组合： [docs/presets.md](./docs/presets.md)
- 性能与执行模型： [docs/performance.md](./docs/performance.md)
- 生成的能力/状态页： [docs/status.md](./docs/status.md)
- 工具配置指南： [docs/configuration-guide.md](./docs/configuration-guide.md)
- 按需导入说明： [docs/tree-shaking-guide.md](./docs/tree-shaking-guide.md)

## 契约与提案

- 机器可读能力源： [specs/capabilities.yaml](./specs/capabilities.yaml)
- 核心 API 契约： [specs/001-core-api-contract.md](./specs/001-core-api-contract.md)
- Worker / 队列生命周期契约： [specs/002-worker-job-lifecycle.md](./specs/002-worker-job-lifecycle.md)
- 打包 / 发布契约： [specs/003-packaging-and-release-contract.md](./specs/003-packaging-and-release-contract.md)
- 目标驱动压缩契约： [specs/004-objective-driven-compression.md](./specs/004-objective-driven-compression.md)
- Job 化压缩 API 契约： [specs/005-compress-job-api.md](./specs/005-compress-job-api.md)
- 自动输出格式契约： [specs/006-auto-output-format.md](./specs/006-auto-output-format.md)
- 离线 / 内网部署契约： [specs/007-offline-and-air-gapped-deployment.md](./specs/007-offline-and-air-gapped-deployment.md)
- 评估与基线契约： [specs/008-evaluation-and-baselines.md](./specs/008-evaluation-and-baselines.md)
- 决策型 API 契约： [specs/009-decision-api.md](./specs/009-decision-api.md)
- Worker 策略 ADR： [adr/001-worker-strategy.md](./adr/001-worker-strategy.md)
- 导出策略 ADR： [adr/002-export-strategy.md](./adr/002-export-strategy.md)

## 当前要点

- `preserveExif: true` 只会保留支持 EXIF 的内建工具
- `output` 已提供 phase-1 `preserve | auto | jpeg | png | webp`
- `objective` 已提供 phase-1 `targetBytes + goal + output`
- `compressDecision()` 已提供 beta 级可解释单结果入口
- `compressEnhanced()` 默认走队列化执行
- `compressJob()` 已提供 beta 级任务句柄
- `configureCompressionDeployment()` 已提供 beta 级统一部署配置
- `assessQuality()` 和 `buildConversionColumn()` 已支持非原图 baseline 的评估
- `compressEnhanced({ useWorker: true })` 是 best-effort，不是强制 worker-only
- `docs/status.md` 才是能力矩阵和导出状态入口，不再由 README 手工维护

## 贡献

如果改动影响公开行为，请在同一个变更里同步更新对应的 `specs/*.md` 和
`specs/capabilities.yaml`。

## 许可证

[MIT](./LICENSE) License © 2022-2025 [Simon He](https://github.com/Simon-He95)
