declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{}, {}, any>
  export default component
}

// PWA virtual modules & plugin typings (shim for TS)
declare module 'virtual:pwa-register' {
  export function registerSW(options?: any): () => void
}

declare module 'vite-plugin-pwa' {
  export const VitePWA: any
}
