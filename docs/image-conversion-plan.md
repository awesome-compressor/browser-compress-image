# 图片格式转换能力实施方案

> 目标：在不破坏现有压缩能力和交互逻辑的前提下，为库（src）新增图片格式转换能力（png/jpeg/webp/ico 等），并在 playground 增加一列“格式转换对比”以帮助用户选择“压缩-转换”流程中的最佳方案。

## 一、当前架构综述（简版）
- lib：`src/`
  - 压缩统一入口 `compress.ts` / 可插拔注册式 `compressWithTools.ts`，按文件 MIME 选择工具集并并行压缩，返回最佳或全量对比。
  - `tools/` 中包含 `canvas/jsquash/browser-image-compression/gifsicle/tinypng` 等实现。
  - `convertBlobToType.ts` 仅负责结果载体类型转换（blob/file/base64/arrayBuffer），不做图像格式转换。
  - `utils/` 有 worker/内存队列等，可扩展为转换任务的执行载体。
- playground：`playground/src/App.vue`
  - 用户导入后会自动按工具并行压缩，支持“对比面板”。
  - “对比面板”展示 `compress(returnAllResults: true)` 的结果列表。

结论：新增“格式转换”应在 lib 侧以独立模块实现，并在 UI 侧以“新增一列”的形式复用既有比对框架，不应侵入现有压缩逻辑。

## 二、总体设计
- 新增模块：`src/conversion/`
  - `convertImage.ts`：单一职责的格式转换入口（<200 行）。
  - `encoders.ts`：封装多种编码器（canvas、JSQuash、ICO 编码器），并统一异常与 MIME 映射。
  - `types.ts`：转换选项与结果类型。
  - `index.ts`：导出与简易工厂。
- 新增编排模块：`src/orchestrators/compareConversion.ts`
  - 面向 playground 的“新列”产出器，生成三类结果：
    1) 压缩后再转换：每个压缩结果 → 目标格式
    2) 先转换原图：原图 → 目标格式
    3) 先转换再压缩：原图 → 目标格式 →（基于目标格式的工具集）并行压缩
  - 产出包含：源流程、目标格式、工具名、尺寸/比例、耗时、成功标记、错误、参数回溯（便于排查）。
- API 保持向后兼容：不改动 `compress(...)` 行为；新增 API 并通过 `src/index.ts` 按需导出。
- 性能与稳定性：
  - 大图/多并行任务时，将转换任务委派至已有 worker（或新增转换 worker），确保 UI 流畅。
  - 统一 ObjectURL 生命周期管理，避免内存泄漏。

## 三、库侧 API 设计
### 1) 转换核心
```ts
// src/conversion/types.ts
export type TargetFormat = 'png' | 'jpeg' | 'webp' | 'ico'
export interface ImageConvertOptions {
  targetFormat: TargetFormat
  quality?: number // 0-1，仅 lossy 生效（jpeg/webp）
  preserveExif?: boolean // 仅 jpeg 有效；跨格式多数情况下会被剥离
  // 预留：位深/调色盘/多尺寸（ico）等
  [k: string]: any
}

export interface ImageConvertResult {
  blob: Blob
  mime: string
  duration: number
}
```
```ts
// src/conversion/convertImage.ts
export async function convertImage(
  fileOrBlob: File | Blob,
  options: ImageConvertOptions,
): Promise<ImageConvertResult>
```
- 编码器优先级：
  - png/jpeg/webp：优先 `JSQuash`（高品质/可控/wasm），次选 `Canvas`（通用兼容）
  - ico：使用独立编码器（建议 `icojs` 或轻量自实现），从 PNG/JPEG 转换为 ICO（常见 16/32/48/64 尺寸）。
- MIME 映射：`png → image/png`、`jpeg → image/jpeg`、`webp → image/webp`、`ico → image/x-icon`
- EXIF：仅在 `targetFormat === 'jpeg'` 时尝试保留；跨格式通常清理（在文档中明确）

### 2) 编排函数（供 playground 使用）
```ts
// src/orchestrators/compareConversion.ts
export interface ConversionCompareItemMeta {
  flow: 'C→T' | 'T' | 'T→C' // 压缩→转换 | 仅转换 | 转换→压缩
  tool?: string // 压缩工具名（若有）
  compressOptions?: any
  convertOptions: ImageConvertOptions
}

export interface ConversionCompareItem {
  meta: ConversionCompareItemMeta
  blob?: Blob
  success: boolean
  error?: string
  size?: number
  compressionRatio?: number // 相对“原图”
  duration?: number
}

export interface BuildConversionColumnInput {
  file: File
  compressOptions: CompressOptions & { returnAllResults: true }
  convertOptions: ImageConvertOptions
}

export interface ConversionColumnResult {
  title: string // 如 "Format: webp"
  items: ConversionCompareItem[]
}

export async function buildConversionColumn(
  input: BuildConversionColumnInput,
): Promise<ConversionColumnResult>
```
- 产出内容：
  - C→T：对 `compress(..., { returnAllResults: true })` 的每个成功项执行 `convertImage`。
  - T：对原图执行 `convertImage`。
  - T→C：对原图先 `convertImage`，再按“目标格式”的工具集合执行 `compress(...)`。
- 统计口径：对每个项保留 size、ratio（基于原图）、耗时；`meta` 中保留两端参数，便于回溯。
- 错误策略：单项失败不影响其他项，保留 error 信息用于 UI 呈现。

## 四、playground 交互设计
- 新增“格式选择”触发器：在“对比面板”中（或主界面工具栏）提供目标格式选择（png/jpeg/webp/ico）。
- 触发后：
  - 以侧边或下方“新的一列”追加展示 ConversionColumnResult：
    - 小标题：目标格式
    - 每行：
      - 标签：`C→T | T | T→C` +（若有）工具名
      - 预览：来自 `blob` 的 ObjectURL
      - 数据：size、ratio、duration、success/error（保持与压缩对比的卡片风格一致）
      - 操作：下载（后缀与 MIME 匹配）
  - 参数保留：在行内展示 `compressOptions` 与 `convertOptions` 的摘要（如 quality、preserveExif），并可展开详情（用于排查）。
- 体验：
  - 生成列时展示 loading 骨架；支持取消生成（中止 worker 任务）。
  - 保持原有列不变；允许多次选择不同目标格式，产生多列。

## 五、性能与资源管理
- 并行策略：
  - 压缩本就并行；转换阶段按 2-4 并发限制，避免主线程长时间阻塞。
  - 尽量在 worker 中执行（JSQuash/wasm 适合放 worker）。
- 内存管理：
  - 建立统一的 URL 回收器，与现有 compare panel 的清理时机一致。
  - 大文件转换前评估尺寸，必要时下采样以避免 OOM（与既有 `preprocessImage` 思想一致）。

## 六、兼容性与降级
- webp 在旧浏览器降级为 png（UI 提示）。
- ico 若编码器不可用：
  - 方案 A：提供“以 png 文件扩展名 .ico 导出”的临时兜底并提示（不推荐默认）。
  - 方案 B：禁用 ico 选项并提示安装/启用 `icojs`。

## 七、测试与文档
- 单元测试（`test/`）：
  - `convertImage` 正确输出 MIME 与基本尺寸/字节特征。
  - `buildConversionColumn` 产出项齐全、错误隔离。
- e2e（playground）：
  - 导入图片 → 选择目标格式 → 看到“新的一列”与 3 类项、可下载。
- 文档：
  - 新增 `docs/conversion-usage.md`（对外 API 使用指南）。
  - README 简述：新增能力与示例（等实现后更新）。

## 八、里程碑拆分（研发顺序）
1) `src/conversion/*`：落地 `convertImage` 与编码器封装，含 ico 方案与降级提示。
2) `src/orchestrators/compareConversion.ts`：产出“新的一列”的数据结构与执行流。
3) playground：UI 选择器 + 列渲染与下载、loading、取消、URL 清理。
4) 测试补齐 + 文档完善。

## 九、约束与代码风格
- 严格遵守用户硬性指标：
  - 动态语言单文件 ≤ 200 行；必要时模块进一步切分。
  - 每层目录文件数 ≤ 8：新增放置在 `src/conversion/` 与 `src/orchestrators/`，避免增加 `src/` 顶层文件数量。
- 不修改现有逻辑与特意的 ts-ignore/eslint-ignore。
- 命名清晰、可读性优先；错误消息面向用户，日志面向开发（英文）。
