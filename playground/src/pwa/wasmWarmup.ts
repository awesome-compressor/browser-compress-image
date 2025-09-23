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

    // Additionally fetch the underlying WASM files to seed SW runtime cache.
    // Some packages (notably webp) place encoder/decoder WASM files under
    // codec/enc and codec/dec. Use an array of wasm paths per format so we
    // can fetch all relevant files.
    const wasmFiles: Record<(typeof formats)[number], string[]> = {
      png: ['pkg/squoosh_png_bg.wasm'],
      jpeg: ['enc/mozjpeg_enc.wasm', 'dec/mozjpeg_dec.wasm'],
      // webp ships separate encoder/decoder .wasm under codec/enc and codec/dec
      webp: ['dec/webp_dec.wasm', 'enc/webp_enc.wasm'],
    }

    await Promise.all(
      formats.map(async (fmt) => {
        const files = wasmFiles[fmt] || []
        await Promise.all(
          files.map(async (file) => {
            // include @latest to match the module import above and point to
            // the correct nested path (e.g. /codec/dec/webp_dec.wasm)
            const url = `https://unpkg.com/@jsquash/${fmt}@latest/codec/${file}`
            try {
              await fetch(url, { mode: 'cors', cache: 'reload' })
            } catch (e) {
              console.warn(
                `[warmup] WASM fetch failed for ${fmt} (${file}):`,
                e,
              )
            }
          }),
        )
      }),
    )
  } catch (err) {
    console.warn('[warmup] JSQuash module import failed:', err)
  }
}
