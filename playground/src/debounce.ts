// Debounce utility function for delaying function execution
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = undefined
      if (!immediate)
        func(...args)
    }

    const callNow = immediate && !timeout

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)

    if (callNow)
      func(...args)
  }
}

export default debounce
