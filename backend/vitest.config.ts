import { defineConfig } from 'vitest/config'

// 单一根配置汇总各包测试（无需每包 vitest 配置）。
// 跨包 import（@linx/*）经 pnpm workspace 软链解析到已构建 dist —
// 故 `pnpm run check` 先 build 再 test。纯包单测走相对 src，无需先构建。
export default defineConfig({
  test: {
    include: ['{packages,apps}/*/test/**/*.test.ts', '{packages,apps}/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
})
