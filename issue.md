# Issue #15 修复计划

## 背景

Issue #15 希望支持为 `browser-image-compression` 自定义 `libURL`，以便在离线或内网环境中避免依赖默认 CDN。

## 问题定位

当前上层的 `toolConfigs` 已经会透传工具级配置，但 `browser-image-compression` 的适配层没有接收并传递 `libURL`，导致类似下面的配置不会生效：

```ts
{
  name: 'browser-image-compression',
  libURL: '/vendor/browser-image-compression.js',
}
```

## 修复方案

1. 在 `test/regressions.test.ts` 增加一个回归测试。
   - mock `browser-image-compression`
   - 通过公开入口传入 `toolConfigs: [{ name: 'browser-image-compression', libURL: '/vendor/browser-image-compression.js' }]`
   - 断言底层收到的 options 中包含 `libURL`

2. 在 `src/tools/compressWithBrowserImageCompression.ts` 中补上 `libURL?: string`。
   - 扩展当前 options 类型
   - 在构造 `compressionOptions` 时把 `libURL` 原样传给 `imageCompression`

3. 保持改动最小。
   - 不新增新的顶层 API
   - 继续复用现有 `toolConfigs` 配置通道
   - 不调整现有压缩策略、返回逻辑和工具选择逻辑

## 验证

1. 运行新增的回归测试，确认 `libURL` 已透传
2. 视情况补跑相关压缩测试，确认没有引入行为回归

## 可选

如果希望这个能力对用户更可见，可以在 `README.md` 补一个最小示例，说明如何通过 `toolConfigs` 配置 `browser-image-compression` 的 `libURL`。
