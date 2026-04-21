# ADR 002: Export Strategy

Status: Accepted

## Context

仓库已经公开了这些入口：

- `.`
- `./tools`
- `./conversion`
- `./utils`

但当前发布包并没有为这些 subpath 提供独立构建产物；它们仍然解析到同一个根
入口构建输出。

这意味着：

- subpath export 目前主要承担“导入语义”和“未来演进空间”
- 它并不自动等价于更小的最终 bundle

这些事实已经体现在：

- [`docs/status.md`](../docs/status.md)
- [`specs/003-packaging-and-release-contract.md`](../specs/003-packaging-and-release-contract.md)

## Decision

当前阶段采用“公开 subpath、统一根产物”的导出策略。

具体做法：

1. 保留 `. / ./tools / ./conversion / ./utils` 这些公开入口。
2. 它们继续指向当前共享的根构建输出。
3. 是否真的减小 bundle，交给调用方在自己的 bundler 里验证。
4. 通过 `package:check` 保证这些公开入口至少在运行时是自洽的。

## Consequences

正面影响：

- 先把公开导出面稳定下来
- 降低发布和维护复杂度
- 文档可以明确表达“subpath 语义存在，但不是独立打包承诺”

代价：

- 当前 subpath 入口不能直接宣传成严格的 tree-shaking 保证
- 用户如果关心 bundle size，仍然需要自己做实测

## Follow-up

如果未来要改成真正的独立 subpath 构建，需要同步更新：

- `package.json` exports
- `specs/003-packaging-and-release-contract.md`
- `docs/status.md`
- 发布 smoke checks
