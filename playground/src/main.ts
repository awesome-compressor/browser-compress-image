import ElementPlus from 'element-plus'
import { VividTyping } from 'vivid-typing'
import { createApp } from 'vue'
// import { registerSW } from 'virtual:pwa-register'
import { warmupJsquashWasm } from './pwa/index.js'
import App from './App.vue'
import './styles/main.css'
import 'element-plus/dist/index.css'

const app = createApp(App)

app.use(ElementPlus)
app.component('VividTyping', VividTyping)
app.mount('#app')
// PWA registration (auto update) - temporarily disabled
// registerSW({ immediate: true })

// Warm up JSQuash modules and WASM in background for faster first use
const idle = (cb: () => void) =>
  (window as any).requestIdleCallback
    ? (window as any).requestIdleCallback(cb)
    : setTimeout(cb, 1500)

idle(() => {
  warmupJsquashWasm().catch((e: unknown) =>
    console.warn('WASM warmup failed', e),
  )
})
