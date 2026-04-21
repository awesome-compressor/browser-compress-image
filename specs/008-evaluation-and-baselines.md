# 008 Evaluation And Baselines

Status: Accepted

Scope: quality-evaluation utilities and baseline-aware conversion evaluation

This document defines the current shipped contract for the library's
evaluation-oriented APIs.

## Maturity

- `assessQuality`: `beta`
- `buildConversionColumn`: `beta`

## Contract

### EVAL-001 `assessQuality` compares arbitrary pairs

- `assessQuality(a, b, options?)` MUST accept any pair of:
  - `Blob`
  - `File`
  - URL string
- The function MUST NOT assume either side is the original source image.
- It MUST return:
  - `ssim`
  - `psnr`
  - optional `heatmap`

### EVAL-002 `assessQuality` defaults

- `maxDimension` defaults to `512`.
- `includeHeatmap` defaults to `true`.
- When `includeHeatmap: false`, `assessQuality` MUST skip heatmap generation
  and return `heatmap: undefined`.

### EVAL-003 `buildConversionColumn` evaluation baseline

- `buildConversionColumn(input)` MUST accept an optional `evaluation` block.
- If `evaluation.baseline` is omitted, the baseline MUST default to the input
  `file`.
- If `evaluation.label` is omitted:
  - it MUST default to `original` when no custom baseline is provided
  - it MUST default to `baseline` when a custom baseline is provided

### EVAL-004 Original ratio vs evaluation ratio

- `compressionRatio` on each successful item MUST remain relative to the input
  `file`.
- `evaluationRatio` on each successful item MUST be relative to the resolved
  evaluation baseline.
- `evaluationLabel` on each successful item MUST reflect the resolved baseline
  label.

### EVAL-005 Optional quality metrics in conversion evaluation

- `evaluation.includeQualityMetrics` defaults to `false`.
- When `evaluation.includeQualityMetrics: true`, each successful item with a
  `blob` and `size` MUST include `qualityMetrics`.
- `qualityMetrics` MUST be computed by comparing the resolved evaluation
  baseline against that item's output blob.
- The `evaluation.maxDimension` and `evaluation.includeHeatmap` options MUST be
  forwarded to `assessQuality`.
- Failed items MUST NOT include `qualityMetrics`.

### EVAL-006 Existing flows stay unchanged

- `buildConversionColumn` MUST continue to produce the same three flow kinds:
  - `C→T`
  - `T`
  - `T→C`
- The evaluation block is additive and MUST NOT remove existing flow results by
  itself.

## Change policy

- Behavior changes to any `EVAL-*` rule MUST update this file.
- Tests that lock public evaluation behavior SHOULD reference the corresponding
  `EVAL-*` identifier.
