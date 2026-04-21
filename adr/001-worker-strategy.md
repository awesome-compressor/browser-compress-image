# ADR 001: Worker Strategy

Status: Accepted

## Context

仓库已经提供了 `compressEnhanced()`、队列执行、worker 探测和 worker 管理器，
但 worker 路径还没有成为当前的默认生产方案。

当前公开状态是：

- 主线程压缩路径可直接使用
- 队列化增强压缩可直接使用
- worker 压缩仍然是实验性能力
- `useWorker` 的语义是 best-effort，不是强制 worker-only

这些结论已经体现在：

- [`specs/001-core-api-contract.md`](../specs/001-core-api-contract.md)
- [`specs/002-worker-job-lifecycle.md`](../specs/002-worker-job-lifecycle.md)

## Decision

当前阶段采用“主线程优先，worker 渐进补完”的策略。

具体做法：

1. `compressEnhanced()` 默认继续走队列化主线程路径。
2. `useWorker` 保持显式 opt-in。
3. worker 探测失败、worker 不可用、文件过大或 worker 执行失败时，统一回退主线程。
4. 在 worker 生命周期、能力边界和失败语义没有完全收口前，不把 worker 写成默认体验。

## Consequences

正面影响：

- 当前生产行为更可预期
- 文档和实现更一致
- 批量场景仍然可以依赖队列能力，而不是等待 worker 补完

代价：

- 大图和高并发场景的性能天花板暂时受限于主线程路径
- `useWorker` 现在更像实验开关，而不是稳定性能选项

## Follow-up

后续如果要把 worker 提升为默认能力，至少需要同时完成：

- 明确的 worker 作业生命周期
- 更稳定的 worker 初始化和探测语义
- 和主线程路径一致的结果/失败契约
- 对文档、spec、测试和状态页的同步更新
