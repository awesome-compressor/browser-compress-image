# 001 Core API Contract

Status: Accepted

Scope: `compress`, `compressDecision`, `compressWithStats`, `compressWithTools`,
`compressEnhanced`

This document defines the current public behavior contract for the library's
core compression APIs. It records what the code does today. Future cleanup or
behavior changes must update this spec first or in the same change.

## Maturity

- `compress`: `stable`
- `compressDecision`: `beta`
- `compressWithStats`: `stable`
- `compressWithTools`: `stable`
- `compressEnhanced`: `beta`
- `compressEnhanced.useWorker`: `experimental`

## Terms

- "single-result path" means `returnAllResults !== true`
- "all-results path" means `returnAllResults === true`
- "built-in tool selection" means the internal tool list used by `compress`
- "registered tool selection" means the tool list obtained from a `ToolRegistry`

## Contract

### CORE-001 Entry points and accepted call shapes

- `compress(file, options)` MUST accept the object form defined by
  `CompressOptions`.
- `compress(file, quality?, type?)` MUST remain supported as the legacy
  overload.
- `compressDecision(file, options)` MUST accept the shipped explainable
  single-result option surface defined in
  [`specs/009-decision-api.md`](./009-decision-api.md).
- `compressDecision(file, quality?, type?)` MUST remain supported as the legacy
  overload.
- `compressWithStats(file, qualityOrOptions?)` MUST accept either a numeric
  quality argument or a `CompressOptions` object.
- `compressWithTools(file, options)` MUST accept `CompressWithToolsOptions`.
- `compressEnhanced(file, options)` MUST accept `EnhancedCompressOptions`.
- `compressEnhanced` MUST reject non-`File` input with `Invalid file input`.
- This spec only guarantees behavior for valid `File` input on these core APIs.
- Objective mode is specified separately in
  [`specs/004-objective-driven-compression.md`](./004-objective-driven-compression.md).
- `compressDecision` result semantics are specified separately in
  [`specs/009-decision-api.md`](./009-decision-api.md).

### CORE-002 Default option values

- `quality` defaults to `0.6`.
- `mode` defaults to `'keepSize'`.
- `preserveExif` defaults to `false`.
- `returnAllResults` defaults to `false`.
- `type` defaults to `'blob'`.
- `output` defaults to `'preserve'`.
- `compressEnhanced.useQueue` defaults to `true`.
- `compressEnhanced.useWorker` defaults to `false`.
- `compressEnhanced.timeout` defaults to `30000`.

### CORE-003 Result carrier conversion

- `type: 'blob'` MUST return a `Blob`.
- `type: 'file'` MUST return a `File` with the original basename when known,
  and its extension SHOULD match the final output MIME type when recognized.
- `type: 'base64'` MUST return a data URL string.
- `type: 'arrayBuffer'` MUST return an `ArrayBuffer`.
- `convertBlobToType` MUST throw `Unsupported type: <type>` for unsupported
  result carriers.
- `type` MUST continue to mean result carrier, not image output format.
- Output-format behavior is defined in
  [`specs/006-auto-output-format.md`](./006-auto-output-format.md).

### CORE-004 Built-in tool selection for `compress`

- `compress` MUST choose its initial tool list from the input MIME type:

| Input MIME match | Built-in tools                                                   |
| ---------------- | ---------------------------------------------------------------- |
| `png`            | `jsquash`, `browser-image-compression`, `canvas`                 |
| `gif`            | `gifsicle`                                                       |
| `webp`           | `canvas`, `browser-image-compression`                            |
| `jpeg` / `jpg`   | `jsquash`, `compressorjs`, `canvas`, `browser-image-compression` |
| other            | `jsquash`, `browser-image-compression`, `canvas`                 |

- If `toolConfigs` contains an entry with `name: 'tinypng'` and the input type
  is JPEG, PNG, or WebP, `compress` MUST append `tinypng` to the selected tool
  list.

### CORE-005 Registered tool selection for `compressWithTools`

- `compressWithTools` MUST derive its initial tool list from the provided
  `toolRegistry`, or `globalToolRegistry` when none is provided.
- `compressWithTools` MUST drop tools that are not registered.
- `compressWithTools` MUST reject with
  `No compression tools available. Please register at least one compression tool.`
  when no registered tools remain after filtering.
- If `toolConfigs` contains `name: 'tinypng'`, the registry contains `tinypng`,
  and the input type is JPEG, PNG, or WebP, `compressWithTools` MUST append
  `tinypng` when it is not already present.

### CORE-006 Tool configuration merge semantics

- Per-tool configuration MUST be selected by exact `ToolConfig.name` match.
- Per-tool configuration MUST be merged on top of the base compression options
  before each tool invocation.
- Tool-specific configuration MAY add fields beyond the base option set.

### CORE-007 EXIF preservation allowlist

- When `preserveExif: true`, both `compress` and `compressWithTools` MUST filter
  the runnable tool list down to:
  - `browser-image-compression`
  - `compressorjs`
- `tinypng` MUST NOT be treated as part of the built-in EXIF allowlist.
- If EXIF filtering removes every runnable tool, the call MUST reject with:
  `No EXIF-supporting tools available for this file type. Please disable preserveExif or use a different file format.`

### CORE-008 Single-result selection semantics

- On the single-result path, tools MUST run in parallel.
- A tool failure MUST be recorded as a failed attempt and MUST NOT fail the
  whole call by itself.
- The winner MUST be the smallest successful result.
- If there are no successful attempts, the single-result path MUST return the
  original file.
- If the best successful result is at least `98%` of the original size and
  `quality > 0.85`, the single-result path MUST return the original file.

### CORE-009 All-results semantics

- On the all-results path, the call MUST return:
  - `bestResult`
  - `bestTool`
  - `allResults`
  - `totalDuration`
- When a non-`preserve` output policy runs, the all-results path MUST also
  expose `outputDecision` for the final `bestResult`.
- `allResults` MUST include both successful and failed attempts.
- Failed attempts MUST expose:
  - `success: false`
  - `error`
  - `compressedSize` equal to the original file size
  - `result` converted from the original file to the requested output carrier
- `bestTool` MUST be `'original'` when either:
  - all attempts fail, or
  - the smallest successful result is at least `98%` of the original size and
    `quality > 0.85`

### CORE-010 Cache semantics for `compress`

- `compress` MUST cache only the single-result path.
- `compress` MUST NOT cache the all-results path.
- The cache key MUST include:
  - file content hash
  - source MIME type
  - `quality`
  - `mode`
  - resize-related fields
  - `preserveExif`
  - `output`
  - `toolConfigs`
- Cache key generation failure MUST NOT fail the call; the implementation MAY
  log and continue without cache.

### CORE-011 Abort and timeout semantics for `compress` and `compressWithTools`

- `timeoutMs` and `signal` apply per tool attempt, not as a single top-level
  hard deadline.
- If a tool starts through `runWithAbortAndTimeout` and the signal is already
  aborted, that attempt MUST fail with `Compression aborted`.
- If a tool times out through `runWithAbortAndTimeout`, that attempt MUST fail
  with `Compression timed out`.
- On `compress` and `compressWithTools`, these per-tool abort or timeout errors
  MUST be turned into failed attempts rather than immediate top-level rejection.
- As a result:
  - the single-result path MAY still resolve with the original file after abort
    or timeout
  - the all-results path MAY still resolve with failed attempts plus
    `bestTool: 'original'`

### CORE-012 Queue and cancellation semantics for `compressEnhanced`

- `compressEnhanced` MUST default to queue-backed execution.
- When `useQueue: false`, `compressEnhanced` MUST bypass the queue and compress
  directly.
- When a queued task is aborted before it starts, `compressEnhanced` MUST reject
  with `Task cancelled`.
- When the queue is explicitly cleared, pending tasks MUST reject with
  `Task cancelled: queue cleared`.
- Once a queued task has already started, queue-level abort handling no longer
  cancels the running work directly. The inner compression flow then follows the
  softer semantics described in `CORE-011`.

### CORE-013 `compressEnhanced` timeout semantics

- `compressEnhanced.timeout` is a top-level hard deadline around the queued or
  direct compression promise.
- When that deadline is hit, `compressEnhanced` MUST reject with
  `Compression timeout after <timeout>ms`.
- This timeout contract is distinct from `timeoutMs`.
- `timeoutMs` MAY still be forwarded to the inner `compress` call, where it
  behaves according to `CORE-011`.

### CORE-014 Worker semantics for `compressEnhanced`

- `useWorker: true` MUST be treated as best-effort, not as strict worker-only
  execution.
- Worker execution MUST only be attempted when:
  - `useWorker` is `true`
  - the worker manager reports support
  - the file passes worker eligibility checks
- If worker execution is not attempted, `compressEnhanced` MUST use the
  main-thread path.
- If worker execution throws, `compressEnhanced` MUST log and fall back to the
  main-thread path.
- Files larger than `50MB` MUST skip worker execution.

### CORE-015 Preprocess semantics for `compressEnhanced`

- `compressEnhanced` MAY preprocess on the main thread before queue or worker
  compression.
- Preprocess output type MUST be chosen as:
  - explicit `preprocess.outputType`, else
  - inferred JPEG / PNG / WebP from the source MIME type, else
  - `image/png`
- If preprocessing succeeds, the compression input MUST become the preprocessed
  blob wrapped as a `File`.
- If preprocessing fails, `compressEnhanced` MUST log and fall back to the
  original file.

### CORE-016 `compressWithStats` result semantics

- `compressWithStats` MUST return:
  - `bestTool`
  - `compressedFile`
  - `originalSize`
  - `compressedSize`
  - `compressionRatio`
  - `totalDuration`
  - `toolsUsed`
- `toolsUsed` MUST describe the per-tool compression attempts before any final
  output-format conversion layer runs.
- When a non-`preserve` output policy changes or evaluates the final result,
  `compressedFile`, `compressedSize`, and `compressionRatio` MUST reflect that
  final output blob.
- When a non-`preserve` output policy runs, `compressWithStats` MUST also
  expose `outputDecision`.

### CORE-017 `compressWithTools` objective-mode rejection

- `compressWithTools` MUST reject when `objective` is provided.
- The error string is specified by
  [`specs/004-objective-driven-compression.md`](./004-objective-driven-compression.md).

## Observable error surface

The following strings are part of the currently observable contract and should
not change silently:

- `Invalid file input`
- `Unsupported type: <type>`
- `No compression tools available. Please register at least one compression tool.`
- `No EXIF-supporting tools available for this file type. Please disable preserveExif or use a different file format.`
- `Compression aborted`
- `Compression timed out`
- `Output format conversion is not supported for GIF sources in compress APIs.`
- `Output format conversion is not supported when preserveExif is enabled.`
- `objective mode is currently supported only on compress(), compressDecision(), compressWithStats(), compressEnhanced(), and compressJob().`
- `objective.targetBytes must be a positive number.`
- `Task cancelled`
- `Task cancelled: queue cleared`
- `Compression timeout after <timeout>ms`

## Change policy

- Behavior changes to any `CORE-*` rule MUST update this file.
- Tests that lock public behavior SHOULD reference the corresponding `CORE-*`
  identifier in the test name or inline comment.
