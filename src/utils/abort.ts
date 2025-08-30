// Utility: run a function and race it against an AbortSignal and timeout
export async function runWithAbortAndTimeout<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  if (!signal && !timeoutMs) return fn()

  return await new Promise<T>((resolve, reject) => {
    let finished = false

    // 当 fn 完成时
    fn()
      .then((v) => {
        if (finished) return
        finished = true
        resolve(v)
      })
      .catch((err) => {
        if (finished) return
        finished = true
        reject(err)
      })

    // 处理超时
    let timer: number | undefined
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      timer = window.setTimeout(() => {
        if (finished) return
        finished = true
        reject(new Error('Compression timed out'))
      }, timeoutMs)
    }

    // 处理 AbortSignal
    const onAbort = () => {
      if (finished) return
      finished = true
      reject(new Error('Compression aborted'))
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    // 清理
    const cleanup = () => {
      if (typeof timer !== 'undefined') clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    // ensure cleanup on resolve/reject
    ;(async () => {
      try {
        const res = await fn()
        if (!finished) {
          finished = true
          resolve(res)
        }
      } catch (err) {
        if (!finished) {
          finished = true
          reject(err)
        }
      } finally {
        cleanup()
      }
    })()
  })
}
