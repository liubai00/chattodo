import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 两个独立入口：主站(index.html) 与 监控后台(admin/index.html)。
// 后台构建到 dist/admin/，由 nginx 挂在 /todo/admin/，与主站互不暴露。
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          // H2: Split heavy vendor libs to reduce view-chunk duplication
          if (id.includes('node_modules/reka-ui')) return 'vendor-reka'
          if (id.includes('node_modules/@floating-ui')) return 'vendor-reka'
          if (id.includes('node_modules/gsap')) return 'vendor-gsap'
          // Split large views that share common dependencies
          if (id.includes('src/views/DatabaseView') || id.includes('src/modules/tasks/composables/useDatabaseBoard')) return 'view-database'
          if (id.includes('src/views/SettingsView')) return 'view-settings'
          if (id.includes('src/views/ChatView') || id.includes('src/modules/chat/composables/useChat')) return 'view-chat'
        },
      },
    },
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 3000,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 3000,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
