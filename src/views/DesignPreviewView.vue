<script setup lang="ts">
/**
 * 设计原语验收页 — 只展示 ui/base 层控件各状态，不依赖业务数据。
 * 开发环境访问：#/design-preview
 * 抛光流程见 docs/primitive-polish-checklist.md
 */
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FilterSelect,
  SearchField,
  SegmentedControl,
  NavItem,
  IconButton,
} from '@/components/base'

defineProps<{ isMobile?: boolean }>()

const ui = useUiStore()

const filterVal = ref('all')
const rawSelectVal = ref('inbox')
const segmentVal = ref<'table' | 'board'>('table')
const searchVal = ref('')
const inputVal = ref('')
const activeNav = ref('today')

const filterOptions = [
  { value: 'all', label: '全部项目' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'work', label: '工作' },
  { value: 'personal', label: '个人' },
]

const segmentItems = [
  { value: 'table' as const, label: '表格', icon: 'ph-table' },
  { value: 'board' as const, label: '看板', icon: 'ph-kanban' },
]

const navItems = [
  { id: 'all', label: '全部任务', icon: 'ph-list', count: 12 },
  { id: 'today', label: '今天', icon: 'ph-calendar-blank', count: 3 },
  { id: 'open', label: '未完成', icon: 'ph-circle-dashed', count: 8 },
  { id: 'done', label: '已完成', icon: 'ph-check-circle', count: 4 },
]
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg)]">
    <!-- 顶栏 -->
    <header class="flex flex-none flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4">
      <div class="min-w-0 flex-1">
        <h1 class="text-[17px] font-semibold text-[var(--text)]" style="font-family: var(--display)">
          设计原语验收
        </h1>
        <p class="mt-0.5 text-[12.5px] font-medium text-[var(--text3)]">
          只改 ui 层 → 刷新此页验收 → 满意后 Database 自动继承。清单：
          <code class="rounded bg-[var(--mid)] px-1.5 py-0.5 text-[11px]">docs/primitive-polish-checklist.md</code>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <IconButton
          :icon="ui.theme === 'dark' ? 'ph-sun' : 'ph-moon'"
          :label="ui.theme === 'dark' ? '明亮模式' : '深色模式'"
          variant="subtle"
          size="sm"
          @click="ui.toggleTheme()"
        />
        <Badge variant="outline" class="text-[11px]">DEV</Badge>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto px-5 py-6">
      <div class="mx-auto flex max-w-[920px] flex-col gap-8">

        <!-- §1 Button -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 class="text-[14px] font-semibold text-[var(--text)]">Button · ui/button</h2>
              <p class="mt-0.5 text-[12px] text-[var(--text3)]">
                目标：hover 200ms 色相加深 · active scale(0.97) 120ms · 无阴影扩散
              </p>
            </div>
            <span class="text-[11px] font-medium text-[var(--text3)]">Attio §三(一)1</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="图标"><i class="ph ph-plus"></i></Button>
            <Button disabled>Disabled</Button>
          </div>
          <p class="mt-3 text-[11.5px] text-[var(--text3)]">
            按住 Primary 观察按压缩放；hover 各变体对比 Attio 主按钮。
          </p>
        </section>

        <!-- §2 Select / FilterSelect -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 class="text-[14px] font-semibold text-[var(--text)]">Select · FilterSelect</h2>
              <p class="mt-0.5 text-[12px] text-[var(--text3)]">
                目标：展开 scale(0.95→1) + opacity 250ms ease-in-out · item hover 浅底 · 无 slide-in
              </p>
            </div>
            <span class="text-[11px] font-medium text-[var(--text3)]">Attio §三(二)2</span>
          </div>
          <div class="flex flex-wrap items-start gap-6">
            <div class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">FilterSelect（Database 同款）</span>
              <FilterSelect v-model="filterVal" :options="filterOptions" placeholder="选择项目" />
              <span class="text-[11px] text-[var(--text3)]">当前：{{ filterVal }}</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">ui/Select 裸组件</span>
              <Select v-model="rawSelectVal">
                <SelectTrigger class="w-[180px]">
                  <SelectValue placeholder="选择…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="o in filterOptions" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span class="text-[11px] text-[var(--text3)]">当前：{{ rawSelectVal }}</span>
            </div>
            <FilterSelect v-model="filterVal" :options="filterOptions" disabled placeholder="Disabled" />
          </div>
          <p class="mt-3 text-[11.5px] text-[var(--text3)]">
            反复开/关下拉，对比 Attio：应从触发点微缩放弹出，而非硬切或大幅 slide。
          </p>
        </section>

        <!-- §3 Input / Search -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 class="text-[14px] font-semibold text-[var(--text)]">Input · SearchField</h2>
              <p class="mt-0.5 text-[12px] text-[var(--text3)]">
                目标：focus 边框 200ms 提亮 · 无外发光脉冲
              </p>
            </div>
            <span class="text-[11px] font-medium text-[var(--text3)]">Attio §三(一)3</span>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">ui/Input</span>
              <Input v-model="inputVal" placeholder="Tab 聚焦观察 ring…" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">SearchField</span>
              <SearchField v-model="searchVal" placeholder="搜索任务…" />
            </div>
          </div>
        </section>

        <!-- §4 SegmentedControl -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 class="text-[14px] font-semibold text-[var(--text)]">SegmentedControl</h2>
              <p class="mt-0.5 text-[12px] text-[var(--text3)]">
                目标：激活态实底切换 200ms · 无横向切割滑动
              </p>
            </div>
            <span class="text-[11px] font-medium text-[var(--text3)]">Attio §三(二)1</span>
          </div>
          <SegmentedControl v-model="segmentVal" :items="segmentItems" />
        </section>

        <!-- §5 NavItem -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 class="text-[14px] font-semibold text-[var(--text)]">NavItem</h2>
              <p class="mt-0.5 text-[12px] text-[var(--text3)]">
                目标：hover 仅底色/文字色渐变 · 无上浮阴影
              </p>
            </div>
            <span class="text-[11px] font-medium text-[var(--text3)]">Attio §三(一)4</span>
          </div>
          <div class="flex flex-col gap-6 sm:flex-row">
            <div class="w-[220px] rounded-[10px] bg-[var(--bg)] p-2">
              <span class="mb-2 block px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">Vertical</span>
              <NavItem
                v-for="n in navItems"
                :key="n.id"
                :icon="n.icon"
                :label="n.label"
                :count="n.count"
                :active="activeNav === n.id"
                class="mb-0.5"
                @click="activeNav = n.id"
              />
            </div>
            <div class="min-w-0 flex-1">
              <span class="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">Horizontal</span>
              <div class="flex gap-1 overflow-x-auto pb-1">
                <NavItem
                  v-for="n in navItems"
                  :key="'h-' + n.id"
                  :icon="n.icon"
                  :label="n.label"
                  :count="n.count"
                  orientation="horizontal"
                  :active="activeNav === n.id"
                  @click="activeNav = n.id"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- §6 IconButton -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4">
            <h2 class="text-[14px] font-semibold text-[var(--text)]">IconButton</h2>
            <p class="mt-0.5 text-[12px] text-[var(--text3)]">三变体 × 三尺寸 · 侧栏 rail 同款</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <IconButton icon="ph-bell" label="Ghost" variant="ghost" />
            <IconButton icon="ph-plus" label="Solid" variant="solid" />
            <IconButton icon="ph-magnifying-glass" label="Subtle" variant="subtle" />
            <IconButton icon="ph-gear" label="SM" variant="ghost" size="sm" />
            <IconButton icon="ph-gear" label="MD" variant="ghost" size="md" />
            <IconButton icon="ph-gear" label="LG" variant="ghost" size="lg" />
          </div>
        </section>

        <!-- §7 Overlays -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 class="text-[14px] font-semibold text-[var(--text)]">Popover · Dropdown · Tooltip</h2>
              <p class="mt-0.5 text-[12px] text-[var(--text3)]">
                目标：与 Select 同一套 translateY(-4px)+opacity 200ms · 无 slide-in-from-*
              </p>
            </div>
            <span class="text-[11px] font-medium text-[var(--text3)]">Attio §三(二)2</span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Popover>
              <PopoverTrigger as-child>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent class="w-56">
                <p class="text-sm font-medium">Popover 内容</p>
                <p class="mt-1 text-[12px] text-[var(--text3)]">观察展开/收起动效</p>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline">Dropdown</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>操作</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>编辑</DropdownMenuItem>
                <DropdownMenuItem>复制链接</DropdownMenuItem>
                <DropdownMenuItem class="text-[var(--danger)]">删除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <TooltipProvider :delay-duration="300">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon" aria-label="提示"><i class="ph ph-info"></i></Button>
                </TooltipTrigger>
                <TooltipContent>Tooltip 200ms 淡入</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </section>

        <!-- §8 Badge -->
        <section class="rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 class="mb-3 text-[14px] font-semibold text-[var(--text)]">Badge</h2>
          <div class="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </section>

        <!-- 验收说明 -->
        <section class="rounded-[12px] border border-dashed border-[var(--line2)] bg-[var(--mid)]/40 p-5">
          <h2 class="text-[14px] font-semibold text-[var(--text)]">验收流程</h2>
          <ol class="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-[var(--text2)]">
            <li>打开 Attio / Linear，DevTools 抄 dropdown、button 的 duration / easing / transform</li>
            <li>按 <code class="rounded bg-[var(--panel)] px-1 text-[12px]">docs/primitive-polish-checklist.md</code> 一次只改 1–2 个文件</li>
            <li>改完刷新本页，截图对比，满意打勾</li>
            <li>全部打勾后去 <router-link to="/database" class="font-semibold text-[var(--accent-ink)]">#/database</router-link> 做整页验收</li>
          </ol>
        </section>

      </div>
    </div>
  </div>
</template>
