# 提案总览

当前 `specs/` 里没有仍停留在 proposal 状态、且已被纳入主线推进的产品能力页。

前一阶段的高优先级 proposal 已经分别落成契约：

- 目标驱动压缩：
  [`specs/004-objective-driven-compression.md`](../specs/004-objective-driven-compression.md)
- Job 化压缩 API：
  [`specs/005-compress-job-api.md`](../specs/005-compress-job-api.md)
- 自动输出格式：
  [`specs/006-auto-output-format.md`](../specs/006-auto-output-format.md)
- 离线 / 内网部署：
  [`specs/007-offline-and-air-gapped-deployment.md`](../specs/007-offline-and-air-gapped-deployment.md)
- 评估与基线：
  [`specs/008-evaluation-and-baselines.md`](../specs/008-evaluation-and-baselines.md)
- 决策型 API：
  [`specs/009-decision-api.md`](../specs/009-decision-api.md)

如果后续要继续推进更重的目标约束，例如：

- `maxPixels`
- `minSSIM`
- 更深的 output/tool 联合搜索

建议再新开 proposal，而不是把未来设计继续堆回已落地的契约页。

相关入口：

- 路线图： [`docs/roadmap.md`](./roadmap.md)
- 部署说明： [`docs/deployment.md`](./deployment.md)
- 生成的状态页： [`docs/status.md`](./status.md)
