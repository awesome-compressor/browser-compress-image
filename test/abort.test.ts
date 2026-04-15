import { describe, expect, it, vi } from 'vitest'
import { runWithAbortAndTimeout } from '../src/utils/abort'

describe('runWithAbortAndTimeout', () => {
  it('calls the wrapped function only once when timeout is enabled', async () => {
    let calls = 0

    const result = await runWithAbortAndTimeout(
      async () => {
        calls += 1
        return 'ok'
      },
      undefined,
      50,
    )

    expect(result).toBe('ok')
    expect(calls).toBe(1)
  })

  it('does not start work when the signal is already aborted', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockResolvedValue('ok')

    controller.abort()

    await expect(
      runWithAbortAndTimeout(fn, controller.signal, 50),
    ).rejects.toThrow('Compression aborted')
    expect(fn).not.toHaveBeenCalled()
  })
})
