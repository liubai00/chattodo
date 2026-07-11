// ESLint flat config：Vue3 + TS recommended，禁止 explicit any；prettier 接管格式冲突规则。
// 对齐 youlai 思想：轻量守门，catch 真实错误（v-for 缺 key / 未用变量 / any），不做强风格重构。
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.config.*'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  // .vue 文件用 vue-eslint-parser，<script lang="ts"> 内部交给 tseslint.parser
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, sourceType: 'module' },
    },
  },
  {
    rules: {
      // shadcn 原子组件为单词名（Button/Input/Card...），关闭多词组件名规则
      'vue/multi-word-component-names': 'off',
      // P3-P11 已清零 any，新代码不得再引入
      '@typescript-eslint/no-explicit-any': 'error',
      // 未用变量：保留告警（_前缀豁免），不阻断 CI
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // TS 已管未定义变量（.vue 经 vue-eslint-parser 包裹时 no-undef 会误报 DOM 全局），交类型检查
      'no-undef': 'off',
      // 属性顺序为风格偏好，--fix 会产生大diff；交给 prettier/人工，不强制
      'vue/attributes-order': 'off',
      // 代码库统一单行密集属性（内联 style 多），不强转首属性换行
      'vue/first-attribute-linebreak': 'off',
      // 代码库统一 camelCase 传 prop（:openTask/:isMobile），与 JS prop 名一致；不强转连字符
      'vue/attribute-hyphenation': 'off',
      // shadcn-vue 用 cva defaultVariant 管默认值，props 无需 default
      'vue/require-default-prop': 'off',
    },
  },
  prettierConfig,
)
