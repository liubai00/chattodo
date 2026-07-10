import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Vitest 独立配置（不并入 vite.config.js，避免污染生产构建）。
// path alias `@` 与项目保持一致；当前 lib 单测为纯函数，环境用 node。
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
