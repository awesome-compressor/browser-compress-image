# 场景推荐组合

这份文档解释常见业务场景下推荐的工具组合。

注意：库里现在 **还没有** 一等公民的 `preset` 参数，这里给的是基于现有 API
的官方推荐组合，不是新的稳定契约。

## 推荐组合总览

| Scenario   | Suggested tools                                | Why                                                         |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `mobile`   | `canvas`                                       | Smallest moving parts and simplest runtime path             |
| `content`  | `canvas` + `compressorjs`                      | Good general-purpose JPEG handling                          |
| `commerce` | `canvas` + `compressorjs` + `jsquash`          | Better quality/size tradeoffs when you can afford more work |
| `editor`   | `registerAllTools()` + optional TinyPNG config | Broadest feature surface for tooling-heavy apps             |

## `mobile`

适合对客户端体积和运行路径最敏感的场景，优先走最简单的浏览器原生方案。

```ts
import {
  compressWithTools,
  registerCanvas,
} from '@awesome-compressor/browser-compress-image'

registerCanvas()

const result = await compressWithTools(file, {
  quality: 0.7,
})
```

## `content`

适合博客、CMS 上传和通用表单场景，JPEG 质量更重要，但运行时仍然希望保持简单。

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

## `commerce`

适合图片质量和体积都有明确业务价值的场景，接受更重一些的工具集合。

```ts
import {
  compressWithTools,
  registerCanvas,
  registerCompressorJS,
  registerJsquash,
} from '@awesome-compressor/browser-compress-image'

registerCanvas()
registerCompressorJS()
registerJsquash()

const result = await compressWithTools(file, {
  quality: 0.9,
})
```

## `editor`

适合内部工具、富媒体工作流或 playground 类应用，此时更在意功能面而不是最小
运行时。

```ts
import {
  compress,
  registerAllTools,
} from '@awesome-compressor/browser-compress-image'

registerAllTools()

const result = await compress(file, {
  quality: 0.9,
  toolConfigs: [
    {
      name: 'tinypng',
      key: 'your-api-key',
      enabled: true,
    },
  ],
})
```

## 动态加载

如果你想要接近 preset 的体验，但又不想让所有工具都常驻运行时，可以按文件类
型动态加载注册 API。

```ts
import { compressWithTools } from '@awesome-compressor/browser-compress-image'

async function smartCompress(file: File) {
  if (file.type.includes('jpeg')) {
    const { registerCompressorJS } =
      await import('@awesome-compressor/browser-compress-image')
    registerCompressorJS()
  } else if (file.type.includes('gif')) {
    const { registerGifsicle } =
      await import('@awesome-compressor/browser-compress-image')
    registerGifsicle()
  } else {
    const { registerCanvas } =
      await import('@awesome-compressor/browser-compress-image')
    registerCanvas()
  }

  return compressWithTools(file, { quality: 0.8 })
}
```

## 当前限制

- 这些推荐只是文档层约定，不是稳定 API 契约
- 精确的内建工具矩阵仍然以 [`docs/status.md`](./status.md) 为准
- 后续可能会把这些推荐真正收敛成 `preset` / `policy` API
