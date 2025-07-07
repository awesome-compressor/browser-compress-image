import ElementPlus from 'element-plus'
import { VividTyping } from 'vivid-typing'
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import 'element-plus/dist/index.css'

const app = createApp(App)

app.use(ElementPlus)
app.component('VividTyping', VividTyping)
app.mount('#app')
