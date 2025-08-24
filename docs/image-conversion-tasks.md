# 图片格式转换任务拆分（开发清单）

> 注：当前仅规划与拆分，不修改现有代码。落地时保持非侵入与向后兼容。

## 0. 预备
- [ ] 评估 `icojs` 或轻量 ICO 编码器（浏览器端可用）
- [x] 评估 webp/avif 在目标浏览器矩阵的可用性（已存在 JSQuash 作为核心能力）

## 1. 库：转换核心（src/conversion/*）
- [x] 新建目录 `src/conversion/`
- [x] `types.ts`：定义 `TargetFormat`、`ImageConvertOptions`、`ImageConvertResult`
- [x] `encoders.ts`：
  - [x] `encodeWithJsquash(blob, {format, quality})`
  - [x] `encodeWithCanvas(blob, {format, quality})`
  - [x] `encodeIcoFromImage(blob, options)`（优先 `icojs`，带降级）
- [x] `convertImage.ts`：根据 `targetFormat` 与环境能力选择编码器并输出 Blob；统一错误与 MIME 映射
- [x] `index.ts`：输出 `convertImage` 与类型

验收标准：
- 输入 png/jpeg/webp → 输出对应 MIME 的 Blob；ico 生成 `image/x-icon`
- 质量参数对 jpeg/webp 生效；png/ico 忽略或采用内部策略
- 大小控制、异常转换有明确错误信息

## 2. 库：编排（src/orchestrators/*）
- [x] 新建目录 `src/orchestrators/`
- [x] `compareConversion.ts`：实现 `buildConversionColumn({ file, compressOptions, convertOptions })`
  - [x] C→T：遍历 `compress(..., { returnAllResults: true })` 成功项并转换
  - [x] T：`convertImage(file)`
  - [x] T→C：`convertImage(file)` 结果再 `compress`（基于目标格式工具集）
  - [x] 产出项包含 meta/size/ratio/duration/success/error 与参数回溯

验收标准：
- 三类项齐备；单项失败不影响其他项
- 统计口径与既有压缩结果一致（size、ratio、duration）

## 3. Playground：UI 集成
- [x] 在每个压缩结果上添加格式转换按钮
- [x] 创建格式转换对比浮动窗口（1200px宽度）
  - [x] 目标格式选择器（png/jpeg/webp/ico）
  - [x] 三种转换策略对比展示（C→T/T/T→C）
  - [x] 使用img-comparison-slider进行原图和转换结果的对比
  - [x] 结果卡片：策略标签、工具名、文件信息、对比滑块、下载按钮
  - [x] 加载状态和错误处理
- [x] URL 统一回收和内存管理
- [x] 支持直接下载各种转换策略的结果文件

验收标准：
- [x] 不影响现有功能
- [x] 提供可视化的原图vs转换结果对比
- [x] 支持下载不同转换策略的结果
- [x] 支持切换目标格式重新计算

## 4. Worker 与性能
- [ ] 复用/扩展现有 worker，将 JSQuash 转换放入 worker 执行
- [ ] 控制并发（2-4），避免 UI 卡顿
- [ ] 大图下采样与内存守护（复用 `memoryManager` 思想）

验收标准：
- 大图/多任务情况下 UI 依旧流畅；无明显内存泄漏

## 5. 测试与文档
- [ ] 单测：`convertImage` MIME/基本大小/错误用例
- [ ] 单测：`buildConversionColumn` 完整产出、失败隔离
- [ ] e2e：导入 → 选择格式 → 新列出现且可下载
- [ ] 文档：`docs/conversion-usage.md` 使用说明；README 补充（实现后）

## 6. 风险与回滚
- ICO 生成失败 → 仅隐藏 ICO 选项或提示安装 `icojs`
- 旧浏览器不支持 webp → 降级 png 并提示
- 任一阶段失败不影响主功能；新增能力可开关控制

---

## 开发分阶段交付
1) 转换核心（1.x）
2) 编排与产出“新的一列”（2.x）
3) UI 集成与交互（3.x）
4) 测试与文档（4.x）

备注：严格控制单文件行数（≤200）与目录文件数（≤8），必要时继续模块化切分。
