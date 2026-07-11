import { createApp } from 'vue'
import Admin from './Admin.vue'
import '../src/styles.css'
import '../src/phosphor.css' // 自托管 Phosphor 图标字体（woff2 本地化，免 jsdelivr CDN）

createApp(Admin).mount('#admin')
