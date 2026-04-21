# 009 Decision API Contract

Status: Accepted

Scope: `compressDecision`

This document defines the current public behavior contract for the shipped
explainable single-result compression API.

## Maturity

- `compressDecision`: `beta`

## Contract

### DECIDE-001 Public call shapes

- `compressDecision(file, options)` MUST accept the same option surface as
  `compressWithStats`, plus optional `type`.
- `returnAllResults` is NOT part of the `compressDecision` public option
  surface.
- `compressDecision(file, quality?, type?)` MUST remain supported as the legacy
  overload.

### DECIDE-002 Default behavior inheritance

- `compressDecision` MUST inherit the same built-in tool selection, output
  formatting, objective search, abort handling, timeout handling, and fallback
  behavior as `compressWithStats`.
- `quality` defaults to `0.6`.
- `mode` defaults to `'keepSize'`.
- `type` defaults to `'blob'`.

### DECIDE-003 Result shape

- `compressDecision` MUST return:
  - `result`
  - `bestTool`
  - `originalSize`
  - `compressedSize`
  - `compressionRatio`
  - `totalDuration`
  - `toolsUsed`
- `result` MUST be produced by converting the final `compressWithStats`
  `compressedFile` into the requested result carrier.

### DECIDE-004 Explainability surface

- When a non-`preserve` output policy runs, `compressDecision` MUST expose
  `outputDecision`.
- When objective mode runs, `compressDecision` MUST expose `objectiveDecision`.
- `toolsUsed` MUST describe the same per-tool attempt summary that
  `compressWithStats` reports, before any final result-carrier conversion.

## Change policy

- Behavior changes to any `DECIDE-*` rule MUST update this file.
- Tests that lock decision-API behavior SHOULD reference the corresponding
  `DECIDE-*` identifier.
