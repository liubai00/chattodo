<script setup lang="ts">
// 新应用根：仅承载路由出口。
// 迁移期所有路由都渲染 LegacyApp（旧 App）；Phase 3 起逐个视图替换为新页面，
// 届时在此引入新 shell 的 rail + 布局（首个视图迁移前不显示 rail，避免双 rail）。
</script>

<template>
  <RouterView />
</template>
