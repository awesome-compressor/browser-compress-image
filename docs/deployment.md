# 部署说明

这份文档解释当前仓库里已经可用的离线、内网和自托管相关配置能力。

当前统一部署契约见
[`specs/007-offline-and-air-gapped-deployment.md`](../specs/007-offline-and-air-gapped-deployment.md)。

## 当前现状

今天仓库里已经有统一入口：

- `configureCompressionDeployment()`
- `getCompressionDeploymentConfig()`

这个入口目前统一管理三类事情：

1. `browser-image-compression` 的全局 `libURL`
2. `jsquash` 的本地 WASM / CDN fallback 策略
3. TinyPNG 这类网络工具的 allow / deny 策略

另外，旧的原语仍然保留：

- `toolConfigs[{ name: 'browser-image-compression', libURL }]`
- `configureWasmLoading()`

## `browser-image-compression` 的 `libURL`

当前推荐优先使用全局部署配置：

```ts
import { configureCompressionDeployment } from '@awesome-compressor/browser-compress-image'

configureCompressionDeployment({
  browserImageCompression: {
    libURL: '/vendor/browser-image-compression.js',
  },
})
```

如果你只想对单次调用显式覆盖，也仍然可以继续通过 `toolConfigs` 传 `libURL`。

```ts
import { compress } from '@awesome-compressor/browser-compress-image'

const result = await compress(file, {
  quality: 0.8,
  toolConfigs: [
    {
      name: 'browser-image-compression',
      libURL: '/vendor/browser-image-compression.js',
    },
  ],
})
```

适用场景：

- 内网环境不允许运行时拉远程 worker 脚本
- 你想把依赖脚本固定部署在自己的静态资源目录
- 你希望压缩路径对公网 CDN 没有隐式依赖

## `jsquash` 的本地 WASM 配置

当前推荐优先通过统一部署配置指定本地 WASM 路径和 fallback 策略。

```ts
import {
  configureCompressionDeployment,
  registerJsquash,
} from '@awesome-compressor/browser-compress-image'

configureCompressionDeployment({
  mode: 'offline-strict',
  wasm: {
    useLocal: true,
    baseUrl: '/vendor/wasm/',
    allowCdnFallback: false,
  },
})

registerJsquash()
```

当前行为需要注意：

- `useLocal: true` 时会先尝试本地资源
- `allowCdnFallback: false` 时，本地加载失败不会再回退到 CDN
- `configureWasmLoading()` 仍然保留，作为更低层的显式覆盖入口

## TinyPNG 不是离线安全路径

TinyPNG 需要网络和 API Key，所以它不适合作为离线或内网默认能力。

```ts
import { compress } from '@awesome-compressor/browser-compress-image'

const result = await compress(file, {
  quality: 0.8,
  toolConfigs: [
    {
      name: 'tinypng',
      key: 'your-api-key',
    },
  ],
})
```

在离线、内网或 air-gapped 场景下，建议默认不要把它当成可用候选。

当前统一部署配置已经能直接表达这个策略：

```ts
import { configureCompressionDeployment } from '@awesome-compressor/browser-compress-image'

configureCompressionDeployment({
  mode: 'offline-strict',
})
```

当前模式语义：

- `best-effort`：默认允许 TinyPNG，默认允许 CDN fallback
- `offline-preferred`：默认不启用 TinyPNG，优先本地资源
- `offline-strict`：自动禁用 TinyPNG，并禁止显式关闭后的 CDN fallback

## 当前推荐做法

如果你今天就要在离线或内网环境里落地，建议这样使用：

1. 先通过 `configureCompressionDeployment()` 定义全局策略
2. 对 `browser-image-compression` 配自托管 `libURL`
3. 对 `jsquash` 配本地 `baseUrl`
4. 对严格 air-gapped 环境，显式设 `allowCdnFallback: false`
5. 默认不要在离线场景启用 TinyPNG

一个更完整的示例：

```ts
import {
  compress,
  configureCompressionDeployment,
  registerJsquash,
} from '@awesome-compressor/browser-compress-image'

configureCompressionDeployment({
  mode: 'offline-strict',
  browserImageCompression: {
    libURL: '/vendor/browser-image-compression.js',
  },
  wasm: {
    useLocal: true,
    baseUrl: '/vendor/wasm/',
    allowCdnFallback: false,
  },
})

registerJsquash()

const result = await compress(file, { quality: 0.8 })
```

## 当前仍未覆盖的点

和完整的自动决策系统相比，当前还没有这些能力：

- 自动决策 API 对部署限制的统一解释面
- worker 资产加载策略
- per-call 级别的 deployment override

- [`specs/006-auto-output-format.md`](../specs/006-auto-output-format.md)
