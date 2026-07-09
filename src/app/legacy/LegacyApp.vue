<script setup lang="ts">
// 迁移期兜底组件：原样渲染旧 App.vue（src/App.vue，class Component 状态机）。
// 不做任何功能改造；视图迁移后对应路由改指向新页面，本组件在 Phase 4 删除。
import App from '@/App.vue'
</script>

<template>
  <App />
</template>
