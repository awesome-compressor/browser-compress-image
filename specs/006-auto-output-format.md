# 006 Auto Output Format

Status: Accepted

Scope: phase-1 output-format selection for `compress`, `compressDecision`,
`compressWithStats`, `compressWithTools`, `compressEnhanced`, and `compressJob`

This document defines the current shipped contract for the library's output
format-selection layer. It records what the code does today.

## Maturity

- `CompressOptions.output`: `beta`
- `EnhancedCompressOptions.output`: `beta`
- `compressJob(...).promise` output formatting: `beta`

## Contract

### AUTOFMT-001 Public option shape

- `CompressOptions` MUST accept `output?: 'preserve' | 'auto' | 'jpeg' | 'png' | 'webp'`.
- `EnhancedCompressOptions` inherits the same `output` field.
- If `output` is omitted, behavior MUST match `output: 'preserve'`.

### AUTOFMT-002 Result carrier vs image format

- `type` continues to mean result carrier:
  - `'blob'`
  - `'file'`
  - `'base64'`
  - `'arrayBuffer'`
- `output` controls the final image MIME format.
- `type` and `output` MUST remain distinct concerns.

### AUTOFMT-003 Default behavior

- `output: 'preserve'` MUST keep the winning compressed blob unchanged.
- The output-format layer runs after the compression winner has already been
  selected.
- This phase does NOT change the per-tool search strategy itself.

### AUTOFMT-004 Phase-1 supported formats

- Phase 1 supports only:
  - `jpeg`
  - `png`
  - `webp`
- This phase does NOT expose `avif` or `jxl` on the public compression APIs.

### AUTOFMT-005 Automatic candidate rules

- For PNG and WebP sources, `output: 'auto'` MUST only evaluate alpha-safe
  candidates:
  - `png`
  - `webp`
- For other non-GIF raster sources, `output: 'auto'` MUST evaluate:
  - `jpeg`
  - `webp`
  - `png`
- If the current winning blob is already one of the allowed candidates, `auto`
  MUST treat that current format as a candidate without reconversion.
- `auto` MUST choose the smallest successful candidate among the evaluated
  phase-1 formats.

### AUTOFMT-006 EXIF constraints

- When `preserveExif: true`, cross-format conversion MUST NOT run.
- If `preserveExif: true` and an explicit `output` pins the same format as the
  winning blob, the call MAY reuse that blob directly.
- If `preserveExif: true` and an explicit `output` would require a format
  change, the call MUST reject with:
  `Output format conversion is not supported when preserveExif is enabled.`
- If `preserveExif: true` and `output: 'auto'`, the implementation MUST keep
  the current winning format when recognized, instead of attempting cross-format
  conversion.

### AUTOFMT-007 GIF constraints

- Phase 1 MUST NOT perform output-format conversion for GIF sources in the
  public compression APIs.
- If the source is GIF and `output: 'auto'`, the call MUST fall back to
  `preserve`.
- If the source is GIF and an explicit phase-1 output format is requested, the
  call MUST reject with:
  `Output format conversion is not supported for GIF sources in compress APIs.`

### AUTOFMT-008 Explainability

- When the all-results path runs with a non-`preserve` output policy, the
  result MUST expose `outputDecision`.
- When `compressDecision` runs with a non-`preserve` output policy, the result
  MUST expose `outputDecision`.
- When `compressWithStats` runs with a non-`preserve` output policy, the
  result MUST expose `outputDecision`.
- `outputDecision` MUST include:
  - `requested`
  - `selected`
  - `selectedTool`
  - `usedFallback`
  - `candidates`
  - `rejectedReasons`

### AUTOFMT-009 Fallback behavior

- If `output: 'auto'` cannot produce any successful phase-1 candidate, it MUST
  fall back to `preserve`.
- That fallback MUST be reflected in `outputDecision.usedFallback`.
- Explicit pinned output formats do NOT silently fall back to another format.

### AUTOFMT-010 Current implementation limits

- `allResults` still represents the per-tool compression attempts before the
  final output-format layer runs.
- `bestResult`, `compressDecision().result`, and
  `compressWithStats().compressedFile` reflect the final output-format
  decision.
- Phase 1 does NOT yet perform a joint search across:
  - tool choice
  - quality
  - output format
- In other words, this phase chooses an output format only after selecting the
  winning compressed blob.

## Observable error surface

- `Output format conversion is not supported for GIF sources in compress APIs.`
- `Output format conversion is not supported when preserveExif is enabled.`

## Change policy

- Behavior changes to any `AUTOFMT-*` rule MUST update this file.
- Tests that lock public behavior SHOULD reference the corresponding
  `AUTOFMT-*` identifier.
