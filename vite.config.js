import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
