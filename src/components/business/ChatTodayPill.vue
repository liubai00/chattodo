<script setup lang="ts">
// 今日待办胶囊：徽标按钮 + 下拉面板（加载/错误/空/列表）。
// 纯展示：开关/刷新/关闭经 emit 上抛，列表项自带 open 闭包。状态由 useChatFeed 持有。
import { computed } from 'vue'
import type { TodayListItem } from '@/modules/chat/types'

const props = defineProps<{
  count: number
  open: boolean
  loading: boolean
  error: string
  subtitle: string
  items: TodayListItem[]
}>()
defineEmits<{ toggle: []; close: []; refresh: [] }>()

const pillStyle = computed(() =>
  'display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:16px;font:600 12px/1 var(--font);cursor:pointer;' +
  (props.open ? 'border:1px solid var(--accent);background:var(--accent-bg);color:var(--accent-ink);' : 'border:1px solid var(--line2);background:var(--panel);color:var(--text2);'),
)
</script>

<template>
  <div class="relative flex-none">
    <button @click="$emit('toggle')" :style="pillStyle" title="今日待办">
      <i class="ph ph-sun-horizon" style="font-size:14px;"></i>今日待办<template v-if="count>0"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--accent);color:var(--accent-contrast);font:700 10px/16px var(--font);"><span class="lx-mono">{{ count }}</span></span></template>
      <i :class="`ph ${open?'ph-caret-up':'ph-caret-down'}`" style="font-size:11px;opacity:.6;"></i>
    </button>
    <template v-if="open">
      <div style="position:absolute;top:calc(100% + 6px);left:0;width:340px;max-width:calc(100vw - 32px);max-height:62vh;background:var(--panel);border:1px solid var(--line2);border-radius:14px;box-shadow:var(--shadow-lg);z-index:14;display:flex;flex-direction:column;overflow:hidden;animation:lx-pop .18s ease;">
        <div style="display:flex;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid var(--line);flex:0 0 auto;">
          <i class="ph ph-sun-horizon" style="color:var(--accent-ink);font-size:17px;"></i>
          <span style="font:600 14px/1 var(--display);color:var(--text);">今日待办</span>
          <span style="font:600 11.5px/1 var(--font);color:var(--text3);">{{ subtitle }}</span>
          <div style="flex:1"></div>
          <button @click="$emit('refresh')" :disabled="loading" title="刷新" style="width:28px;height:28px;border:0;border-radius:8px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;"><i :class="`ph ph-arrows-clockwise ${loading?'lx-spin':''}`" style="font-size:14px;"></i></button>
        </div>
        <div style="flex:1;min-height:0;overflow:auto;padding:6px;">
          <div v-if="loading && !items.length" style="display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--text3);padding:34px 12px;"><i class="ph ph-circle-notch lx-spin" style="font-size:22px;"></i><div style="font:500 12px/1 var(--font);">正在加载今日待办…</div></div>
          <div v-else-if="error" style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text3);padding:30px 14px;text-align:center;"><i class="ph ph-warning-circle" style="font-size:24px;color:var(--danger);"></i><div style="font:500 12.5px/1.5 var(--font);color:var(--danger);">{{ error }}</div><button @click="$emit('refresh')" style="height:32px;padding:0 15px;border:1px solid var(--line2);border-radius:9px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;">重试</button></div>
          <div v-else-if="items.length===0" style="display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--text3);padding:34px 14px;text-align:center;"><i class="ph ph-confetti" style="font-size:26px;color:var(--accent-ink);"></i><div style="font:500 13px/1.6 var(--font);">今天没有到期或计划的待办<br/>享受专注的一天 🎉</div></div>
          <template v-else>
            <a v-for="(t, i) in items" :key="i" @click="t.open" style="display:flex;gap:10px;padding:10px 11px;border-radius:10px;cursor:pointer;" data-hv="0">
              <span :style="`width:9px;height:9px;border-radius:50%;margin-top:5px;flex:0 0 auto;background:${t.dot};`"></span>
              <span style="flex:1;min-width:0;">
                <span :style="`display:block;font:600 13px/1.4 var(--font);color:${t.done?'var(--text3)':'var(--text)'};${t.done?'text-decoration:line-through;':''}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ t.title }}</span>
                <span style="display:block;font:500 11.5px/1.4 var(--font);color:var(--text3);margin-top:2px;">{{ t.progress }}</span>
              </span>
              <i class="ph ph-caret-right" style="font-size:13px;color:var(--text3);align-self:center;flex:0 0 auto;"></i>
            </a>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
