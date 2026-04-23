# Status

> Generated from `specs/capabilities.yaml` and `package.json`. Do not edit by hand. Run `pnpm docs:generate`.

## Package

- npm version: `0.0.6`
- package name: `@awesome-compressor/browser-compress-image`
- module type: `module`

## Public API Maturity

| API                                | Maturity     | Summary                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compress`                         | Stable       | Default multi-tool compression entrypoint.                                          | Main-thread execution is the supported path.<br>returnAllResults exposes all tool attempts and the best result.<br>Phase-1 output control supports preserve, auto, jpeg, png, and webp.<br>Output decisions are explained on the all-results path.<br>Phase-1 objective mode supports targetBytes search with fastest, balanced, and visually-lossless goals. |
| `compressDecision`                 | Beta         | Explainable single-result compression entrypoint for business-facing default flows. | Returns the requested result carrier together with bestTool, size ratio, duration, and toolsUsed.<br>When output is not preserve, outputDecision explains the selected final format.<br>Objective mode exposes objectiveDecision for the selected targetBytes search result.                                                                                  |
| `compressWithStats`                | Stable       | Compression entrypoint that returns tool timings and the winning result summary.    | Exposes the winning compressedFile plus per-tool attempt metrics.<br>When output is not preserve, outputDecision explains the selected final format.<br>Objective mode exposes objectiveDecision for the selected targetBytes search result.                                                                                                                  |
| `compressWithTools`                | Stable       | Compression entrypoint with an explicit tool registry.                              | Main-thread execution is the supported path.<br>Tool availability depends on what the caller registers.<br>Phase-1 output control supports preserve, auto, jpeg, png, and webp.<br>Output decisions are explained on the all-results path.<br>Objective mode is intentionally unsupported on this low-level API in phase 1.                                   |
| `compressEnhanced`                 | Beta         | Queue-managed compression entrypoint.                                               | Queue-backed main-thread execution is the recommended default.<br>useWorker remains opt-in and experimental.<br>Inherits phase-1 output control from CompressOptions on the main-thread path.<br>Inherits phase-1 objective mode from CompressOptions on the main-thread path.                                                                                |
| `compressJob`                      | Beta         | Job-handle compression entrypoint with lifecycle subscriptions.                     | Returns an immediate handle with id, status, promise, cancel, retry, and lifecycle listeners.<br>Progress is currently coarse and stage-based rather than byte-accurate.<br>Job results inherit phase-1 output control through EnhancedCompressOptions.<br>Job results also inherit phase-1 objective mode through EnhancedCompressOptions.                   |
| `assessQuality`                    | Beta         | Compares any two image sources with SSIM, PSNR, and optional heatmap output.        | Accepts arbitrary source pairs rather than assuming one side is the original image.<br>Heatmap generation can be disabled for cheaper evaluation passes.                                                                                                                                                                                                      |
| `buildConversionColumn`            | Beta         | Builds conversion-comparison flows with optional non-original evaluation baselines. | Keeps compressionRatio relative to the input file.<br>Adds evaluationRatio, evaluationLabel, and optional qualityMetrics against the chosen baseline.                                                                                                                                                                                                         |
| `configureCompressionDeployment`   | Beta         | Configures deployment-aware asset loading and network-tool policy.                  | Supports best-effort, offline-preferred, and offline-strict modes.<br>Affects browser-image-compression libURL defaults, JSQuash WASM loading, and TinyPNG availability.                                                                                                                                                                                      |
| `getCompressionDeploymentConfig`   | Beta         | Returns the current resolved deployment config snapshot.                            | Exposes mode, browser-image-compression asset settings, WASM loading policy, and network-tool policy.                                                                                                                                                                                                                                                         |
| `compressEnhancedBatch`            | Beta         | Batch wrapper around compressEnhanced.                                              | Uses per-file priorities derived from size and list order.                                                                                                                                                                                                                                                                                                    |
| `compressEnhanced.useWorker`       | Experimental | Best-effort worker execution for compressEnhanced.                                  | Unsupported or failed worker attempts fall back to main-thread compression.                                                                                                                                                                                                                                                                                   |
| `waitForCompressionInitialization` | Beta         | Waits for the worker support probe to finish.                                       | Resolving does not imply worker support is available.                                                                                                                                                                                                                                                                                                         |
| `getCompressionStats`              | Beta         | Returns aggregate queue and worker capability state.                                | Exposes queue counts and the current worker support flag.                                                                                                                                                                                                                                                                                                     |
| `configureCompression`             | Beta         | Configures queue concurrency for enhanced compression.                              | maxConcurrency is clamped by the implementation.                                                                                                                                                                                                                                                                                                              |
| `clearCompressionQueue`            | Beta         | Cancels pending enhanced-compression tasks.                                         | Running tasks are not force-stopped by this API.                                                                                                                                                                                                                                                                                                              |

## Compression Behavior

- Built-in compression selection: `parallel-compare-smallest-successful-result`
- Built-in `preserveExif` allowlist: `browser-image-compression`, `compressorjs`
- `compressEnhanced` defaults: `useQueue=true`, `useWorker=false`
- Worker semantics: `best-effort` (Experimental), fallback `main-thread`

## Entry Points

| Export         | Types               | Import            | Require           |
| -------------- | ------------------- | ----------------- | ----------------- |
| `.`            | `./dist/index.d.ts` | `./dist/index.js` | `./dist/index.js` |
| `./tools`      | `./dist/index.d.ts` | `./dist/index.js` | `./dist/index.js` |
| `./conversion` | `./dist/index.d.ts` | `./dist/index.js` | `./dist/index.js` |
| `./utils`      | `./dist/index.d.ts` | `./dist/index.js` | `./dist/index.js` |

## Tool Capability Matrix

| Tool                        | Label                     | Maturity | Input Formats                         | Output Formats                       | Preserve EXIF  | Browser Only | Network  | Worker       | Notes                                                                                                                                            |
| --------------------------- | ------------------------- | -------- | ------------------------------------- | ------------------------------------ | -------------- | ------------ | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser-image-compression` | Browser Image Compression | Stable   | `jpeg`, `png`, `webp`                 | `jpeg`, `png`, `webp`                | Yes            | Yes          | No       | Tool Managed | Accepts a self-hosted libURL for offline or air-gapped deployments.                                                                              |
| `compressorjs`              | CompressorJS              | Stable   | `jpeg`                                | `jpeg`                               | Yes            | Yes          | No       | No           | The built-in adapter is optimized for JPEG and rejects non-JPEG input.                                                                           |
| `canvas`                    | Canvas                    | Stable   | `jpeg`, `png`, `webp`, `other-raster` | `jpeg`, `png`, `webp`                | No             | Yes          | No       | No           | PNG compression may emit JPEG when that produces a smaller result.                                                                               |
| `gifsicle`                  | Gifsicle                  | Stable   | `gif`                                 | `gif`                                | Not Applicable | Yes          | No       | Experimental | GIF-only compression path.<br>Worker compatibility is gated by the library's experimental worker story.                                          |
| `jsquash`                   | JSQuash                   | Beta     | `jpeg`, `png`, `webp`, `avif`, `jxl`  | `jpeg`, `png`, `webp`, `avif`, `jxl` | No             | Yes          | Optional | No           | Browser-only WASM path.<br>Local WASM loading can fall back to CDN when local assets are unavailable unless deployment policy disables fallback. |
| `tinypng`                   | TinyPNG                   | Stable   | `jpeg`, `png`, `webp`                 | `jpeg`, `png`, `webp`                | No             | No           | Yes      | Experimental | Requires an API key.<br>Not included in the built-in preserveExif allowlist.                                                                     |

## Built-in Format Coverage

| Format         | Built-in Tools                                                   | Optional Tools |
| -------------- | ---------------------------------------------------------------- | -------------- |
| `jpeg`         | `jsquash`, `browser-image-compression`, `compressorjs`, `canvas` | `tinypng`      |
| `png`          | `jsquash`, `browser-image-compression`, `canvas`                 | `tinypng`      |
| `webp`         | `canvas`, `browser-image-compression`                            | `tinypng`      |
| `gif`          | `gifsicle`                                                       | —              |
| `avif`         | `jsquash`                                                        | —              |
| `jxl`          | `jsquash`                                                        | —              |
| `other-raster` | `jsquash`, `browser-image-compression`, `canvas`                 | —              |

## Maturity Labels

- `stable`: Supported public behavior.
- `beta`: Public behavior that is usable but may still tighten.
- `experimental`: Opt-in behavior that is not yet a fully supported path.
