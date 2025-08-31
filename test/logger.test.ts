import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { logger, setLogger, resetLogger } from '../src'

describe('logger (runtime injection)', () => {
  beforeEach(() => {
    resetLogger()
  })

  afterEach(() => {
    resetLogger()
  })

  it('allows injecting a custom logger implementation', () => {
    const spy = vi.fn()
    setLogger({ enabled: true, log: spy })

    logger.log('hello')
    expect(spy).toHaveBeenCalledWith('hello')
  })

  it('enable/disable control default console output', () => {
    // Ensure we're using the default impl
    resetLogger()

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      logger.disable()
      logger.log('should-not-appear')
      expect(consoleSpy).not.toHaveBeenCalled()

      logger.enable()
      logger.log('should-appear')
      expect(consoleSpy).toHaveBeenCalledWith('should-appear')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('resetLogger restores default behavior', () => {
    const customSpy = vi.fn()
    setLogger({ enabled: true, log: customSpy })
    logger.log('custom')
    expect(customSpy).toHaveBeenCalled()

    resetLogger()

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      logger.enable()
      logger.log('after-reset')
      expect(consoleSpy).toHaveBeenCalledWith('after-reset')
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
