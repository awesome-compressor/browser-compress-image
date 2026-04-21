# 002 Worker and Queue Lifecycle Contract

Status: Accepted

Scope: `compressEnhanced`, `compressEnhancedBatch`,
`waitForCompressionInitialization`, `getCompressionStats`,
`configureCompression`, `clearCompressionQueue`, and the current worker support
probe semantics.

This document defines the currently observable lifecycle behavior for enhanced
compression. It records what the implementation does today. It does not invent a
future `compressJob()` API or a future per-file stage callback model.

## Maturity

- `compressEnhanced`: `beta`
- `compressEnhancedBatch`: `beta`
- `waitForCompressionInitialization`: `beta`
- `getCompressionStats`: `beta`
- `configureCompression`: `beta`
- `clearCompressionQueue`: `beta`
- `compressEnhanced.useWorker`: `experimental`

## Observable lifecycle model

The current enhanced compression lifecycle is only partially observable.

- Publicly observable state exists at the aggregate queue level via
  `getCompressionStats()`.
- The implementation does NOT expose:
  - a per-job id
  - a per-job public state enum
  - `onProgress`
  - `onStageChange`
  - retry handles
  - force cancellation of already-running work

## Contract

### WORKER-001 Initialization semantics

- The worker manager MUST begin its support probe during module initialization.
- `waitForCompressionInitialization()` MUST wait for that probe attempt to
  finish.
- `waitForCompressionInitialization()` MUST resolve even when worker support is
  unavailable.
- Callers MUST inspect `getCompressionStats().worker.supported` after waiting if
  they need the final support result.

### WORKER-002 Worker support result

- Worker support MUST be reported as `true` only when the worker probe returns a
  `result` message with `initialized === true`.
- Worker support MUST be reported as `false` when:
  - `Worker` is unavailable
  - probe initialization throws
  - probe initialization times out
  - probe initialization returns `initialized !== true`
- `getCompressionStats().worker.supported` MUST reflect the current support flag.

### WORKER-003 Current shipped worker story

- `compressEnhanced.useWorker` MUST be treated as best-effort, not strict
  worker-only execution.
- The current worker bootstrap implementation is still placeholder behavior.
- Because support is only enabled when the probe confirms `initialized === true`
  and the placeholder worker bootstrap reports failure, shipped builds SHOULD be
  treated as main-thread-first unless the worker implementation changes.

### WORKER-004 Observable lifecycle phases

For a single `compressEnhanced()` call, the current implementation follows this
order:

1. optional preprocessing on the main thread
2. queue admission or direct execution
3. active compression execution
4. main-thread fallback when worker execution is skipped or fails
5. result carrier conversion
6. promise resolve or reject

Important constraints:

- Optional preprocessing happens before queue admission.
- Queue statistics do NOT expose a dedicated preprocessing phase.
- There is no public `comparing` stage in the enhanced API even though the inner
  `compress()` call may compare multiple tools.

### WORKER-005 Preprocessing and queue ordering

- When `preprocess` is provided, `compressEnhanced` MUST attempt preprocessing
  on the main thread before queue submission.
- If preprocessing succeeds, the queued or direct compression input MUST become
  a `File` created from the preprocessed blob.
- If preprocessing fails, `compressEnhanced` MUST log and continue with the
  original file.
- Because preprocessing happens before queue submission, queue `pending` and
  `running` counts MUST NOT include preprocessing time.

### WORKER-006 Queue-backed execution defaults

- `compressEnhanced` MUST default to `useQueue: true`.
- When `useQueue: true`, the call MUST submit a single task to the shared
  compression queue.
- When `useQueue: false`, the call MUST bypass the queue entirely.
- Queue bypass means the call does NOT contribute to queue `pending`,
  `running`, `completed`, or `failed` counters.

### WORKER-007 Queue state surface

`getCompressionStats().queue` MUST expose:

- `pending`
- `running`
- `completed`
- `failed`
- `maxConcurrency`

Current meanings:

- `pending`: tasks admitted to the queue but not started
- `running`: tasks currently executing
- `completed`: tasks that resolved successfully through the queue
- `failed`: tasks whose queue execution path threw and rejected
- `maxConcurrency`: current queue concurrency limit

These are aggregate counters only. They are not per-file lifecycle events.

### WORKER-008 Queue scheduling and priority

- Queue admission MUST sort higher-priority tasks ahead of lower-priority tasks.
- When no explicit priority is provided, the queue MUST derive one from file
  size, with smaller files receiving higher priority.
- `compressEnhancedBatch()` MUST derive per-file priority from:
  - a size-based component
  - an index-based component
- `compressEnhancedBatch()` MUST preserve per-file invocation order when mapping
  settled results back to the returned array.

### WORKER-009 Queue concurrency configuration

- `configureCompression({ maxConcurrency })` MUST update the shared queue
  concurrency.
- The queue MUST clamp `maxConcurrency` into the inclusive range `1..10`.
- `getCompressionStats().queue.maxConcurrency` MUST reflect the clamped value.

### WORKER-010 Clearing the queue

- `clearCompressionQueue()` MUST cancel only tasks still waiting in the queue.
- Pending tasks removed by queue clear MUST reject with
  `Task cancelled: queue cleared`.
- Clearing the queue MUST NOT force-stop already-running tasks.

### WORKER-011 Abort behavior before a queued task starts

- If an `AbortSignal` is provided and fires while the task is still pending in
  the queue, the queue MUST remove that task and reject the call with
  `Task cancelled`.
- This is a queue-level cancellation path.

### WORKER-012 Abort behavior after a queued task starts

- Once a queued task starts running, the queue MUST remove the pending-task
  abort listener.
- After that point, queue-level cancellation no longer removes the running task.
- Active work then follows the softer inner compression semantics defined in
  `001-core-api-contract.md`.
- As a result, an already-running enhanced compression call MAY still resolve
  successfully or fall back to the original file after the caller aborts.

### WORKER-013 Top-level timeout behavior

- `compressEnhanced.timeout` MUST wrap the full queued or direct compression
  promise with a top-level race.
- When that deadline is exceeded, the public call MUST reject with
  `Compression timeout after <timeout>ms`.
- This timeout MUST NOT forcibly stop the underlying queue task or direct
  compression work.
- Therefore, queue `completed` or `failed` counts MAY continue changing after
  the caller has already observed a timeout rejection.

### WORKER-014 Worker-attempt gate

- Worker execution MAY be attempted only when all of the following are true:
  - `useWorker === true`
  - the worker manager reports support
  - the file passes worker eligibility checks
- If any gate fails, `compressEnhanced` MUST use the main-thread path.
- `compressEnhanced` does NOT wait for worker initialization automatically
  before making this decision.
- Therefore, early `useWorker: true` calls MAY take the main-thread path if the
  support probe has not completed yet.

### WORKER-015 Current worker eligibility checks

- Files larger than `50MB` MUST skip worker execution.
- Files at or below `50MB` MAY still attempt worker execution.
- `preserveExif: true` does NOT disable worker attempts by itself.

### WORKER-016 Worker failure fallback

- If worker execution throws after being attempted, `compressEnhanced` MUST log
  and fall back to main-thread compression.
- Worker failure MUST NOT become a public hard failure by itself when the
  main-thread fallback succeeds.

### WORKER-017 Worker capability reporting

- `getCompressionStats().worker.domDependentTools` MUST return the current list
  of DOM-dependent tools that require the main thread.
- That list is currently:
  - `canvas`
  - `jsquash`

### WORKER-018 Batch failure behavior

- `compressEnhancedBatch()` MUST return an empty array for an empty input list.
- `compressEnhancedBatch()` MUST wait for all per-file promises with
  `Promise.allSettled`.
- If any per-file compression rejects, `compressEnhancedBatch()` MUST rethrow a
  rejection reason while mapping results.
- This means batch processing currently behaves as "collect all settlements, then
  throw if any file failed" rather than "best-effort partial success array".

## Observable error surface

The following strings are part of the current observable lifecycle contract and
should not change silently:

- `Task cancelled`
- `Task cancelled: queue cleared`
- `Compression timeout after <timeout>ms`
- `Workers not supported`
- `Worker script not available`
- `Worker initialization failed`
- `Worker test timeout`

## Non-goals of this spec

This spec intentionally does NOT define:

- future per-file stage names such as `queued -> preprocessing -> compressing`
- a stable worker job handle API
- per-file progress events
- retry semantics
- force-stop semantics for already-running work

Those belong to a future job API contract, not to the current implementation.

## Change policy

- Behavior changes to any `WORKER-*` rule MUST update this file.
- Tests that lock lifecycle behavior SHOULD reference the corresponding
  `WORKER-*` identifier in the test name or inline comment.
