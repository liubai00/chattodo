<script setup lang="ts">
// 消息流：加载态 + 消息渲染（sys 日期 / user 气泡 / ai 文本 / 任务 / 想法 / 非todo / 计划 / 错误）+ thinking 指示。
// 纯展示：消息项自带 open / openRef / undo / commitPlan / retry 闭包（由 useChatMessages 绑定）。
import type { MessageItem } from '@/modules/chat/types'

defineProps<{
  messages: MessageItem[]
  loading: boolean
  thinking: boolean
  thinkText: string
}>()
</script>

<template>
  <div id="lx-msgs" class="flex flex-1 flex-col gap-[17px] overflow-auto p-[26px]">
    <div v-if="loading" class="flex flex-1 items-center justify-center text-[var(--text3)]">加载中…</div>
    <template v-else>
      <template v-for="m in messages" :key="m.id">
        <div v-if="m.isSys" class="self-center rounded-full bg-[var(--mid)] px-[13px] py-1.5 text-xs font-medium text-[var(--text3)]">{{ m.text }}</div>
        <div v-else-if="m.isUser" class="flex flex-col items-end gap-[5px] self-end" style="max-width:78%;animation:lx-fade .25s ease;">
          <div v-if="m.hasRefs" class="flex flex-wrap justify-end gap-[5px]"><span v-for="(r, i) in m.refs" :key="i" class="inline-flex items-center gap-1 rounded-full bg-[var(--accent-bg)] px-[9px] py-[3px] text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-at text-[11px]"></i>{{ r }}</span></div>
          <div :title="m.time || ''" class="rounded-[15px_15px_5px_15px] bg-[var(--accent)] px-[14px] py-2.5 text-sm font-medium leading-relaxed text-[var(--accent-contrast)] shadow-md" style="white-space:pre-wrap;">{{ m.text }}</div>
          <span v-if="m.refId" @click="m.openRef" class="cursor-pointer px-1 text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-arrow-elbow-down-right text-[11px]"></i>已生成 · 查看</span>
        </div>
        <div v-else-if="m.isAgentText" class="flex gap-[9px] self-start" style="max-width:82%;animation:lx-fade .25s ease;">
          <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--accent-contrast)]" style="font-family:var(--display);margin-top:2px;">灵</span>
          <div :title="m.time || ''" :style="`background:var(--panel);border:1px solid var(--line);padding:10px 14px;border-radius:5px 15px 15px 15px;font:500 14px/1.6 var(--font);color:${m.isErr?'var(--danger)':'var(--text)'};box-shadow:var(--shadow);white-space:pre-wrap;`">{{ m.text }}<span v-if="m.streaming" class="ml-px inline-block text-[var(--accent-ink)]" style="animation:lx-blink 1s steps(1) infinite;">▍</span></div>
        </div>
        <div v-else-if="m.isTask" class="flex flex-col gap-2 self-start" style="max-width:82%;animation:lx-fade .28s ease;">
          <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--accent-ink)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>任务<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
          <div @click="m.open" class="cursor-pointer rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-md" data-hv="2">
            <div class="flex items-start gap-2.5"><span class="mt-px h-[18px] w-[18px] flex-none rounded-md border-2 border-[var(--accent)]"></span><div class="min-w-0 flex-1"><div class="text-[14.5px] font-semibold leading-relaxed text-[var(--text)]">{{ m.title }}</div><div class="mt-2.5 flex flex-wrap gap-1.5"><span v-for="(c, i) in m.chips" :key="i" class="inline-flex items-center gap-[5px] rounded-[var(--r-sm)] bg-[var(--mid)] px-[9px] py-1 text-[11.5px] font-semibold text-[var(--text2)]"><i :class="`ph ${c.i}`" style="font-size:12px;"></i>{{ c.t }}</span></div></div></div>
            <div class="mt-[11px] flex items-center gap-1.5 border-t border-[var(--line)] pt-[11px] text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-check-circle text-[14px] text-[var(--accent)]"></i>已进入 Todo 数据库 · 点击查看详情与来源<span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 px-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
          </div>
        </div>
        <div v-else-if="m.isIdea" class="flex flex-col gap-2 self-start" style="max-width:82%;animation:lx-fade .28s ease;">
          <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--idea-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--idea)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--idea)]"></span>待澄清<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
          <div class="rounded-[var(--r)] border border-l-[3px] border-[var(--idea)] border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-md">
            <div class="text-[14.5px] font-semibold leading-relaxed text-[var(--text)]">{{ m.title }}</div>
            <div class="mt-2 rounded-[10px] bg-[var(--idea-bg)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]"><b class="text-[var(--idea)]">建议下一步：</b>{{ m.suggest }}</div>
            <div class="mt-3 flex items-center gap-2"><button @click="m.open" class="cursor-pointer rounded-[var(--r-sm)] border border-[var(--accent)] bg-transparent px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)]">去澄清</button><span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
          </div>
        </div>
        <div v-else-if="m.isNono" class="flex flex-col gap-2 self-start" style="max-width:82%;animation:lx-fade .28s ease;">
          <details class="self-start"><summary class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--nono-bg)] px-[10px] py-1 text-[11.5px] font-semibold text-[var(--nono)]" style="list-style:none;"><span class="h-1.5 w-1.5 rounded-full bg-[var(--nono)]"></span>非 todo<i class="ph ph-caret-down text-[11px] opacity-60"></i></summary><div class="mt-1.5 max-w-[430px] rounded-[10px] bg-[var(--mid)] p-[9px_12px] text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">{{ m.reason }}</div></details>
          <div class="rounded-[var(--r)] border border-dashed border-[var(--line2)] bg-[var(--nono-bg)] p-3">
            <div class="text-sm font-medium leading-relaxed text-[var(--text2)]">{{ m.text }}</div>
            <div class="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text3)]"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存<span class="flex-1"></span><button @click.stop="m.undo" title="撤销这次判断" class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text3)]" style="border:0;background:transparent;cursor:pointer;"><i class="ph ph-arrow-counter-clockwise"></i>撤销</button></div>
          </div>
        </div>
        <div v-else-if="m.isPlan" class="self-start rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] p-[15px] shadow-md" style="max-width:82%;animation:lx-fade .28s ease;">
          <div class="text-sm font-semibold text-[var(--text)]" style="font-family:var(--display);">{{ m.planTitle }}</div>
          <div class="mt-[3px] text-[11.5px] font-medium leading-snug text-[var(--text3)]">{{ m.planSub }}</div>
          <div class="mt-[13px] flex flex-col gap-[9px]"><div v-for="(p, i) in m.plan" :key="i" class="flex items-center gap-2.5"><span class="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[var(--accent-bg)] text-[11px] font-bold text-[var(--accent-ink)]">{{ p.n }}</span><span class="flex-1 text-[13.5px] font-medium leading-snug text-[var(--text)]">{{ p.t }}</span><span class="rounded-[var(--r-sm)] bg-[var(--mid)] px-2 py-[3px] text-[11px] font-semibold text-[var(--text2)]">{{ p.d }}</span></div></div>
          <div class="mt-[13px] flex items-center gap-1.5 border-t border-[var(--line)] pt-[11px] text-[11px] font-medium text-[var(--text3)]"><i class="ph ph-shield-check text-[13px] text-[var(--accent)]"></i>{{ m.planNote }}<span class="flex-1"></span><button v-if="!m.committed" @click="m.commitPlan" class="inline-flex items-center gap-[5px] rounded-lg bg-[var(--accent)] px-3 py-[7px] text-[11.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-play"></i>开始执行</button><span v-else class="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-ink)]"><i class="ph ph-check-circle"></i>已加入今日计划</span></div>
        </div>
        <div v-else-if="m.isError" class="flex flex-col gap-[9px] self-start rounded-[var(--r)] border-l-[3px] border-[var(--danger)] bg-[var(--danger-bg)] p-[13px_15px]" style="max-width:82%;animation:lx-fade .28s ease;">
          <div class="flex items-center gap-2 text-[13px] font-semibold text-[var(--danger)]"><i class="ph ph-warning-circle text-[16px]"></i>AI 生成失败 · {{ m.errType }}</div>
          <div class="text-[12.5px] font-medium leading-relaxed text-[var(--text2)]">未静默失败 - 原始输入已保存，可重试，异常已记录到内部后台。</div>
          <div class="flex items-center gap-[9px]"><button @click="m.retry" class="inline-flex items-center gap-1.5 rounded-lg bg-[var(--danger)] px-[13px] py-[7px] text-[12.5px] font-semibold text-[var(--accent-contrast)]" style="border:0;cursor:pointer;"><i class="ph ph-arrow-clockwise"></i>重试</button><span v-if="m.retrying" class="text-[11.5px] font-medium text-[var(--text3)]">重试中…</span></div>
        </div>
      </template>
      <div v-if="thinking" class="flex gap-[9px] self-start" style="animation:lx-fade .2s ease;">
        <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--accent-contrast)] opacity-85" style="font-family:var(--display);margin-top:2px;">灵</span>
        <div class="inline-flex items-center gap-2 rounded-[5px_14px_14px_14px] bg-[var(--mid)] px-[14px] py-2.5"><span class="inline-flex gap-1" style="flex:0 0 auto;"><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite;"></span><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite .2s;"></span><span class="h-[5px] w-[5px] rounded-full bg-[var(--accent-ink)]" style="animation:lx-pulse 1s infinite .4s;"></span></span><span class="lx-think">{{ thinkText }}</span></div>
      </div>
    </template>
  </div>
</template>
