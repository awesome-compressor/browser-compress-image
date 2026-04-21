# 005 Compress Job API Contract

Status: Accepted

Scope: `compressJob`

This document defines the current public behavior contract for the shipped job
handle API. It records what the code does today.

## Maturity

- `compressJob`: `beta`

## Contract

### JOB-001 Additive public API

- `compressJob(file, options)` MUST be additive to the existing enhanced
  compression APIs.
- Existing `compressEnhanced()` calls MUST continue to work unchanged.
- `compressJob()` MUST reject invalid non-`File` input with `Invalid file input`.

### JOB-002 Stable job handle

- `compressJob()` MUST return immediately with a job handle.
- The handle MUST expose:
  - `id`
  - `status`
  - `promise`
  - `cancel()`
  - `retry()`
  - `onProgress()`
  - `onStageChange()`
  - `onMetrics()`
- `id` MUST stay stable for the lifetime of that handle.

### JOB-003 Current public stage surface

The current public stage surface is:

- `queued`
- `preprocessing`
- `compressing`
- `converting`
- `done`
- `failed`
- `cancelled`

Current stage behavior:

- Jobs with `preprocess` start at `preprocessing`.
- Jobs without `preprocess` start at:
  - `queued` when `useQueue !== false`
  - `compressing` when `useQueue === false`
- Successful jobs MUST end at `done`.
- Failed jobs MUST end at `failed`.
- Jobs rejected through cancellation/abort errors MUST end at `cancelled`.

### JOB-004 Stage subscriptions

- `onStageChange(listener)` MUST return an unsubscribe function.
- Subscribing through `onStageChange()` MUST immediately emit the current stage
  to that listener.
- The current implementation does NOT expose a separate public `comparing`
  stage, even though inner compression may compare multiple tools.

### JOB-005 Progress subscriptions

- `onProgress(listener)` MUST return an unsubscribe function.
- Subscribing through `onProgress()` MUST immediately emit the current progress
  snapshot to that listener.
- Current progress values are coarse stage-based progress, not byte-accurate
  transfer or encode progress.
- `done` MUST emit progress `1`.

### JOB-006 Cancellation and retry semantics

- `cancel()` MUST abort the job's internal signal.
- For queued work, cancellation SHOULD reject the job promise with the existing
  queue cancellation behavior.
- For already-running work, cancellation remains best-effort because the inner
  compression flow still follows the existing enhanced-compression semantics.
- `retry()` MUST create a new job handle with a new `id`.
- `retry()` MUST reuse the original file and options.

### JOB-007 Metrics surface

`onMetrics()` currently exposes a machine-readable snapshot containing:

- `originalSize`
- `compressedSize` when available
- `startedAt`
- `finishedAt` when available
- `durationMs` when available

Current behavior:

- `onMetrics(listener)` MUST return an unsubscribe function.
- Subscribing through `onMetrics()` MUST immediately emit the current metrics
  snapshot to that listener.
- `originalSize` MUST be available immediately.
- `compressedSize` is populated only after successful blob compression.
- `finishedAt` and `durationMs` are populated only after the job settles.

### JOB-008 Current queued lifecycle

For queued jobs, the current observable lifecycle is:

1. `queued` or `preprocessing`
2. `compressing` when queue execution actually starts
3. `converting` after blob compression completes
4. `done` / `failed` / `cancelled`

This lifecycle remains layered on top of the shared queue and the existing
`compressEnhanced` worker/main-thread behavior.

## Observable error surface

The following strings are part of the currently observable job API surface and
should not change silently:

- `Invalid file input`
- `Task cancelled`
- `Task cancelled: queue cleared`
- `Compression timeout after <timeout>ms`

## Current limitations

- There is no public `comparing` stage yet.
- Progress is coarse and stage-based only.
- Running-job cancellation is still best-effort.
- There is no shipped `compressJobs()` batch handle API yet.

## Change policy

- Behavior changes to any `JOB-*` rule MUST update this file.
- Tests that lock job-handle behavior SHOULD reference the corresponding
  `JOB-*` identifier in the test name or inline comment.
