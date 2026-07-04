import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

// 两个独立入口：主站(index.html) 与 监控后台(admin/index.html)。
// 后台构建到 dist/admin/，由 nginx 挂在 /todo/admin/，与主站互不暴露。
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
      },
    },
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
