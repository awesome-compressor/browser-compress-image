#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const packages = ['png', 'jpeg', 'webp', 'avif', 'jxl']
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'playground', 'public', 'wasm')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

for (const p of packages) {
  const pkgDir = path.join(root, 'node_modules', '@jsquash', p, 'codec')
  if (!fs.existsSync(pkgDir)) continue
  const files = fs.readdirSync(pkgDir).filter((f) => f.endsWith('.wasm'))
  for (const f of files) {
    const src = path.join(pkgDir, f)
    const dest = path.join(outDir, f)
    try {
      fs.copyFileSync(src, dest)
      console.log(`Copied ${src} -> ${dest}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`Failed copying ${src}:`, msg)
    }
  }
}
