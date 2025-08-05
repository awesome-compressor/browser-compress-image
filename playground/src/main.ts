import ElementPlus from 'element-plus'
import { VividTyping } from 'vivid-typing'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './styles/main.css'
import 'element-plus/dist/index.css'

// Import route components
import CompressionPage from './pages/compression.vue'
import ConvertPage from './pages/convert.vue'

// Define routes
const routes = [
  { path: '/', redirect: '/compression' },
  { path: '/compression', component: CompressionPage },
  { path: '/convert', component: ConvertPage }
]

// Create router instance
const router = createRouter({
  history: createWebHistory(),
  routes
})

const app = createApp(App)

app.use(ElementPlus)
app.use(router)
app.component('VividTyping', VividTyping)
app.mount('#app')
