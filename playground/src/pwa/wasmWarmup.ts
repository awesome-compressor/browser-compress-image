// Preload @jsquash modules to trigger WASM fetch and cache
// This gently imports modules and runs a tiny no-op encode to force initialization.

export async function warmupJsquashWasm(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const formats = ['png', 'jpeg', 'webp'] as const
    // Trigger module download and WASM init via CDN imports
    await Promise.all(
      formats.map(async (fmt) => {
        try {
          await import(
            /* @vite-ignore */ `https://unpkg.com/@jsquash/${fmt}@latest?module`
          )
        } catch (e) {
          console.warn(`[warmup] CDN import failed for ${fmt}:`, e)
        }
      }),
    )

    // Additionally fetch the underlying WASM files to seed SW runtime cache
    const wasmFile: Record<(typeof formats)[number], string> = {
      png: 'squoosh_png_bg.wasm',
      jpeg: 'mozjpeg_bg.wasm',
      webp: 'squoosh_webp_bg.wasm',
    }
    await Promise.all(
      formats.map(async (fmt) => {
        const url = `https://unpkg.com/@jsquash/${fmt}/codec/${wasmFile[fmt]}`
        try {
          await fetch(url, { mode: 'cors', cache: 'reload' })
        } catch (e) {
          console.warn(`[warmup] WASM fetch failed for ${fmt}:`, e)
        }
      }),
    )
  } catch (err) {
    console.warn('[warmup] JSQuash module import failed:', err)
  }
}
