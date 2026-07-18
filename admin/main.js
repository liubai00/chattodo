import { createApp } from 'vue'
import Admin from './Admin.vue'
// tokens.css 必须先于 styles.css:styles.css 的旧名变量(--panel/--line/--accent…)
// 全部指向 tokens.css 的 Attio/Apple token——缺它则全部解析为空(admin 曾长期
// 以浏览器默认色渲染,即此因)。
import '../src/styles/tokens.css'
import '../src/styles.css'
import '../src/phosphor.css' // 自托管 Phosphor 图标字体（woff2 本地化，免 jsdelivr CDN）

createApp(Admin).mount('#admin')
