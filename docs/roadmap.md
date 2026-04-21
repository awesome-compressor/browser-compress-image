# 路线图

这份文档解释当前文档体系和功能推进顺序。

它不是行为契约；行为契约在 `specs/`。它也不是状态页；状态页在
[`docs/status.md`](./status.md)。

## 当前判断

短期内最值得继续投入的不是“再接更多 codec / provider”，而是把现有能力收敛
成更稳定、可解释、可产品化的压缩 API。

换句话说，先把这些问题收口：

- 公开行为到底是什么
- worker / queue 的执行语义到底是什么
- 打包和导出承诺到底是什么
- 自动决策和结果解释如何成为默认体验

## 已完成的基础层

下面这些内容已经落在仓库里，目标是先把公开面钉住：

- 核心 API 契约：
  [`specs/001-core-api-contract.md`](../specs/001-core-api-contract.md)
- Worker / 队列生命周期契约：
  [`specs/002-worker-job-lifecycle.md`](../specs/002-worker-job-lifecycle.md)
- 打包 / 发布契约：
  [`specs/003-packaging-and-release-contract.md`](../specs/003-packaging-and-release-contract.md)
- 机器可读能力源：
  [`specs/capabilities.yaml`](../specs/capabilities.yaml)
- 生成的状态页：
  [`docs/status.md`](./status.md)
- PR / CI 契约同步检查：
  `scripts/check-pr-contracts.mjs`
- 打包契约 smoke check：
  `scripts/check-package-contract.mjs`

## 当前已落地的 beta 能力

- 目标驱动压缩：
  [`specs/004-objective-driven-compression.md`](../specs/004-objective-driven-compression.md)
- Job 化压缩 API：
  [`specs/005-compress-job-api.md`](../specs/005-compress-job-api.md)
- 自动输出格式：
  [`specs/006-auto-output-format.md`](../specs/006-auto-output-format.md)
- 离线 / 内网部署统一配置：
  [`specs/007-offline-and-air-gapped-deployment.md`](../specs/007-offline-and-air-gapped-deployment.md)
- 评估与基线能力：
  [`specs/008-evaluation-and-baselines.md`](../specs/008-evaluation-and-baselines.md)
- 决策型 API：
  [`specs/009-decision-api.md`](../specs/009-decision-api.md)

## 当前提案层

当前 `specs/` 里已经没有高优先级但仍未落地的产品提案页；提案索引见
[`docs/proposals.md`](./proposals.md)。

## 推荐推进顺序

推荐的实现顺序不是按 spec 编号死板执行，而是按依赖关系推进：

1. 先把 worker / queue 的公开语义继续做稳。
2. 在已落地的 `compressJob()` 基础上继续补强任务模型。
3. 在已落地的 phase-1 objective mode 基础上继续补强 `maxPixels`、
   `minSSIM` 这类更重的约束能力。

原因很简单：

- 没有稳定的任务模型，上传 UI 很难真正产品化
- 没有清晰的执行和取消语义，自动决策会缺乏可靠落点
- 没有解释面，更完整的目标驱动压缩就仍然容易退回“黑箱”

## 暂不优先的方向

这些方向不是不做，而是不应该压在当前阶段最前面：

- 再增加更多 codec
- 再增加更多在线 provider
- 先做很重的 UI 或 playground 重构
- 在没有契约的情况下直接扩 worker 能力面

## 设计原则

后续继续推进时，优先遵守这些约束：

- `specs/` 是契约
- `docs/` 是解释
- README 只做入口页
- 行为变化先改 spec，再改实现或与实现同改
- 能力矩阵尽量从 `specs/capabilities.yaml` 生成，而不是手写

## 相关决策记录

- Worker 策略：
  [`adr/001-worker-strategy.md`](../adr/001-worker-strategy.md)
- 导出策略：
  [`adr/002-export-strategy.md`](../adr/002-export-strategy.md)
