# 004 Objective-Driven Compression

Status: Accepted

Scope: phase-1 objective mode for `compress`, `compressDecision`,
`compressWithStats`, `compressEnhanced`, and `compressJob`

This document defines the current shipped contract for the library's first
objective-driven compression layer.

## Maturity

- `CompressOptions.objective`: `beta`
- `compressDecision(..., { objective })`: `beta`
- `compressWithStats(..., { objective })`: `beta`
- `compressEnhanced(..., { objective })`: `beta`
- `compressJob(..., { objective })`: `beta`

## Contract

### OBJ-001 Public option shape

- `CompressOptions` MUST accept:

```ts
interface CompressionObjective {
  targetBytes: number
  goal?: 'fastest' | 'balanced' | 'visually-lossless'
  output?: 'preserve' | 'auto' | 'jpeg' | 'png' | 'webp'
}
```

- `targetBytes` is required in phase 1.
- `goal` defaults to `'balanced'`.
- `objective.output`, when present, MUST override the top-level `output` option
  for that objective search.

### OBJ-002 Supported entrypoints

- `compress(..., { objective })` MUST support objective mode.
- `compressDecision(..., { objective })` MUST support objective mode.
- `compressWithStats(..., { objective })` MUST support objective mode.
- `compressEnhanced(..., { objective })` inherits objective mode through the
  main-thread compression path.
- `compressJob(..., { objective })` inherits objective mode through
  `compressEnhanced`.
- `compressWithTools(..., { objective })` is NOT supported in phase 1 and MUST
  reject with:
  `objective mode is currently supported only on compress(), compressDecision(), compressWithStats(), compressEnhanced(), and compressJob().`

### OBJ-003 Search behavior

- Objective mode MUST search over a fixed quality ladder rather than using only
  the caller's raw `quality`.
- Phase-1 search ladders are:
  - `fastest`: `0.72`, `0.56`, `0.4`, `0.28`
  - `balanced`: `0.9`, `0.82`, `0.74`, `0.66`, `0.58`, `0.5`, `0.42`, `0.34`
  - `visually-lossless`: `0.96`, `0.92`, `0.88`, `0.84`, `0.8`, `0.76`, `0.72`,
    `0.68`, `0.64`, `0.6`
- At each step, the implementation MUST evaluate the final compressed size
  after phase-1 output-format selection.
- The first candidate whose final size is `<= targetBytes` MUST be selected.

### OBJ-004 Fallback behavior

- If no candidate satisfies `targetBytes`, objective mode MUST NOT reject
  solely for that reason.
- Instead, it MUST fall back to the smallest candidate it evaluated.
- That outcome MUST set `objectiveDecision.usedFallback` to `true`.

### OBJ-005 Explainability

- Objective mode MUST expose `objectiveDecision` on:
  - `compressDecision(...)`
  - `compressWithStats(...)`
  - `compress(..., { returnAllResults: true })`
- `objectiveDecision` MUST include:
  - `goal`
  - `targetBytes`
  - `selectedQuality`
  - `selectedTool`
  - `selectedOutput`
  - `candidatesEvaluated`
  - `usedFallback`
  - `candidates`
  - `rejectedReasons`

### OBJ-006 Candidate reporting

- Each `objectiveDecision.candidates` item MUST include:
  - `quality`
  - `compressedSize`
  - `passed`
  - optional `selectedTool`
  - optional `selectedOutput`
- `rejectedReasons` SHOULD explain why earlier candidates were rejected, such as
  exceeding `targetBytes`.

### OBJ-007 Interaction with existing result shapes

- On the single-result `compress` path, objective mode still returns only the
  requested result carrier.
- On `compress(..., { returnAllResults: true })`, the final returned
  `bestResult`, `bestTool`, and `allResults` MUST correspond to the selected
  quality candidate.
- On `compressWithStats`, the returned `compressedFile`, `compressedSize`, and
  `bestTool` MUST correspond to the selected quality candidate.
- On `compressDecision`, the returned `result`, `compressedSize`, and
  `bestTool` MUST correspond to the selected quality candidate.

### OBJ-008 Validation

- If `objective.targetBytes` is not a positive finite number, the call MUST
  reject with:
  `objective.targetBytes must be a positive number.`

## Change policy

- Behavior changes to any `OBJ-*` rule MUST update this file.
- Tests that lock public objective behavior SHOULD reference the corresponding
  `OBJ-*` identifier.
