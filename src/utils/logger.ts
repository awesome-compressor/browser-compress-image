// Minimal configurable logger for the library.
// Default: silent. Enable via env var DEBUG_BROWSER_COMPRESS_IMAGE=true or at runtime via logger.enable().

export type LoggerLike = {
  enabled?: boolean
  enable?: () => void
  disable?: () => void
  log?: (...args: any[]) => void
  debug?: (...args: any[]) => void
  warn?: (...args: any[]) => void
  error?: (...args: any[]) => void
  table?: (data: any) => void
}

// initial implementation used by default
const initialImpl: LoggerLike = {
  enabled: (() => {
    try {
      return (
        typeof process !== 'undefined' &&
        process.env &&
        (process.env.DEBUG_BROWSER_COMPRESS_IMAGE === 'true' ||
          process.env.NODE_ENV === 'development')
      )
    } catch (e) {
      return false
    }
  })(),
  enable() {
    this.enabled = true
  },
  disable() {
    this.enabled = false
  },
  log(...args: any[]) {
    if (this.enabled) console.log(...args)
  },
  debug(...args: any[]) {
    if (this.enabled)
      console.debug ? console.debug(...args) : console.log(...args)
  },
  warn(...args: any[]) {
    if (this.enabled) console.warn(...args)
  },
  error(...args: any[]) {
    if (this.enabled) console.error(...args)
  },
  table(data: any) {
    if (this.enabled && (console as any).table) (console as any).table(data)
  },
}

// internal implementation that can be swapped
let impl: LoggerLike = { ...initialImpl }

// public wrapper exported across the codebase — methods delegate to `impl` so replacing `impl` updates behavior
export const logger = {
  get enabled() {
    return Boolean(impl.enabled)
  },
  enable() {
    impl.enable ? impl.enable() : (impl.enabled = true)
  },
  disable() {
    impl.disable ? impl.disable() : (impl.enabled = false)
  },
  log(...args: any[]) {
    if (impl.enabled) {
      if (impl.log) return impl.log(...args)
      return console.log(...args)
    }
  },
  debug(...args: any[]) {
    if (impl.enabled) {
      if (impl.debug) return impl.debug(...args)
      return console.debug ? console.debug(...args) : console.log(...args)
    }
  },
  warn(...args: any[]) {
    if (impl.enabled) {
      if (impl.warn) return impl.warn(...args)
      return console.warn(...args)
    }
  },
  error(...args: any[]) {
    if (impl.enabled) {
      if (impl.error) return impl.error(...args)
      return console.error(...args)
    }
  },
  table(data: any) {
    if (impl.enabled) {
      if (impl.table) return impl.table(data)
      if ((console as any).table) return (console as any).table(data)
    }
  },
}

// Allow consumers to replace the logger implementation at runtime
export function setLogger(custom: LoggerLike) {
  impl = { ...initialImpl, ...(custom || {}) }
}

// Restore to default behavior
export function resetLogger() {
  impl = { ...initialImpl }
}

export default logger
