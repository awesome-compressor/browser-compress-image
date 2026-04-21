# 007 Offline and Air-Gapped Deployment Contract

Status: Accepted

Scope: `configureCompressionDeployment`,
`getCompressionDeploymentConfig`, and the current deployment-sensitive asset
loading behavior.

This document defines the current public behavior contract for deployment-aware
compression configuration. It records what the code does today.

## Maturity

- `configureCompressionDeployment`: `beta`
- `getCompressionDeploymentConfig`: `beta`

## Contract

### DEPLOY-001 Additive public API

- `configureCompressionDeployment(config)` MUST be additive to the existing
  compression APIs.
- Existing per-call `toolConfigs` usage MUST continue to work unchanged.
- Existing `configureWasmLoading()` usage MUST continue to work unchanged.

### DEPLOY-002 Public deployment config surface

The current deployment config surface supports:

- `mode`
- `browserImageCompression.libURL`
- `wasm.baseUrl`
- `wasm.useLocal`
- `wasm.allowCdnFallback`
- `networkTools.allowTinyPng`

Supported modes are:

- `best-effort`
- `offline-preferred`
- `offline-strict`

### DEPLOY-003 Snapshot reads

- `getCompressionDeploymentConfig()` MUST return the current resolved snapshot.
- The returned snapshot MUST include:
  - `mode`
  - `browserImageCompression`
  - `wasm`
  - `networkTools`

### DEPLOY-004 Global browser-image-compression `libURL`

- If `browserImageCompression.libURL` is configured globally,
  `browser-image-compression` MUST receive that `libURL` by default.
- A per-call `toolConfigs[{ name: 'browser-image-compression', libURL }]` value
  MUST override the global deployment config value.

### DEPLOY-005 JSQuash local WASM and CDN fallback

- Deployment config MUST be able to provide:
  - `wasm.baseUrl`
  - `wasm.useLocal`
  - `wasm.allowCdnFallback`
- When local WASM loading is enabled, the implementation MUST try the local path
  first.
- When `wasm.allowCdnFallback === false`, local WASM loading failure MUST NOT
  fall back to CDN import.
- The existing `configureWasmLoading()` API remains an explicit override surface
  on top of deployment config.

### DEPLOY-006 Network-only tool policy

- `tinypng` is treated as a network-only tool by the current deployment policy.
- In `offline-strict`, `tinypng` MUST be disabled automatically.
- In `offline-preferred`, `tinypng` MUST stay disabled unless
  `networkTools.allowTinyPng === true`.
- In `best-effort`, `tinypng` remains allowed unless
  `networkTools.allowTinyPng === false`.

### DEPLOY-007 Tool filtering behavior

- Deployment policy MAY filter tools out of the runnable tool list.
- After deployment filtering, existing zero-tool behavior remains unchanged.
- As a result, callers MAY still receive:
  `No compression tools available. Please register at least one compression tool.`
  when deployment policy removes the only remaining runnable tool.

### DEPLOY-008 Current scope

Current deployment policy affects:

- global `browser-image-compression` asset loading defaults
- JSQuash local WASM vs CDN fallback behavior
- TinyPNG allow/deny behavior

Current deployment policy does NOT yet provide:

- per-call deployment overrides
- automatic decision explanations
- worker asset policy

## Observable error surface

The following strings are part of the currently observable deployment-sensitive
surface and should not change silently:

- `No compression tools available. Please register at least one compression tool.`
- `Failed to initialize <format> support: Local WASM file not found: <path>`

## Change policy

- Behavior changes to any `DEPLOY-*` rule MUST update this file.
- Tests that lock deployment behavior SHOULD reference the corresponding
  `DEPLOY-*` identifier in the test name or inline comment.
