// Utility: run a function and race it against an AbortSignal and timeout
export async function runWithAbortAndTimeout<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  if (!signal && !timeoutMs) return fn()

  if (signal?.aborted) {
    throw new Error('Compression aborted')
  }

  return await new Promise<T>((resolve, reject) => {
    let finished = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (typeof timer !== 'undefined') clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const settle = (callback: (value: any) => void, value: any) => {
      if (finished) return
      finished = true
      cleanup()
      callback(value)
    }

    // 处理超时
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      timer = setTimeout(() => {
        settle(reject, new Error('Compression timed out'))
      }, timeoutMs)
    }

    // 处理 AbortSignal
    const onAbort = () => {
      settle(reject, new Error('Compression aborted'))
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    Promise.resolve()
      .then(fn)
      .then((result) => {
        settle(resolve, result)
      })
      .catch((error) => {
        settle(reject, error)
      })
  })
}
