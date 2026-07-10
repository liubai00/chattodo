<script setup lang="ts">
// P3 第一个迁移视图：设置。组件分层 + 域 composable（useSettings）下沉全部状态与操作；
// 视图只负责模板与分段样式（seg）。toast 经 useToast--与 composable 共用同一 Pinia 单例，
// 故视图保留自己的 useToast() 供模板内联 toast.flash（friendPolicy 切换），模板无需改动。
import { useToast } from '@/stores/toast'
import { useSettings } from '@/modules/settings/composables/useSettings'
import { AI_PRESETS } from '@/modules/agent/constants'
import Button from '@/components/ui/button/Button.vue'
import ViewHeader from '@/components/base/ViewHeader.vue'
import LoadingState from '@/components/base/LoadingState.vue'
import PageBody from '@/components/base/PageBody.vue'
import ContentCard from '@/components/base/ContentCard.vue'
import Input from '@/components/ui/input/Input.vue'
import Switch from '@/components/ui/switch/Switch.vue'

defineProps<{ isMobile?: boolean }>()
// 仅供模板内联提示（friendPolicy 切换）；全部状态与操作在 useSettings 内。
const toast = useToast()
const {
  section, SET_SECTIONS, loading, user, s, apiKey, ownAiOpen, pwdOpen, pwdOld, pwdNew, pwdBusy,
  canAdmin, roleLabel, meBig, sAccountName, aiIsRule, aiPresetHint, aiOwnActive, setName,
  viewOptions, aiPresetOptions,
  updateSetting, toggleNotifPref, pickAiPreset, setAiField, testConn, saveSettings, saveOwnAi,
  clearOwnAi, submitPwd, doExport, doClearData, onName, onAccountName, toggleTheme, logout,
} = useSettings()

// 分段控件按钮样式（工作/个人、明亮/深色 等）
const seg = (on: boolean) => on
  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
  : 'text-[var(--text2)]'
</script>

<template>
  <div class="flex h-full flex-col">
    <ViewHeader icon="ph-gear" title="设置">{{ setName }}</ViewHeader>

    <PageBody :is-mobile="isMobile">
      <LoadingState v-if="loading" class="h-full" />
      <div v-else class="mx-auto flex max-w-[600px] flex-col gap-4">
        <!-- section 标签栏（in-content，替代旧中栏导航） -->
        <div class="flex flex-wrap gap-1 rounded-[10px] bg-[var(--mid)] p-[3px]">
          <button v-for="s in SET_SECTIONS" :key="s[0]" @click="section = s[0]" :style="`border:0;padding:7px 13px;border-radius:7px;cursor:pointer;font:${section===s[0]?'600':'500'} 12.5px/1 var(--font);${section===s[0]?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);'}`">{{ s[1] }}</button>
        </div>

        <!-- 账号 -->
        <template v-if="section === 'account'">
          <div class="flex items-center gap-[14px] rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
            <span class="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl bg-[var(--accent)] text-2xl font-semibold text-[var(--accent-contrast)]" style="font-family: var(--display)">{{ meBig }}</span>
            <div class="min-w-0 flex-1">
              <div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">{{ user.name }}</div>
              <div class="mt-1 text-[12.5px] font-medium text-[var(--text3)]">@{{ sAccountName }} · {{ user.email }}</div>
            </div>
            <span class="rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]">{{ roleLabel }}</span>
          </div>

          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">账户名</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">你的唯一账号标识，用于系统展示（登录仍用邮箱）</div></div>
              <input :value="sAccountName" @change="onAccountName" maxlength="24" placeholder="账户名" class="w-[150px] rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">称呼</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">聊天、问候与协作里对你的称谓，可随时修改</div></div>
              <input :value="user.name" @change="onName" maxlength="24" placeholder="称呼" class="w-[150px] rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">邮箱</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">登录账号，不可修改</div></div>
              <span class="text-[13.5px] font-medium text-[var(--text2)]">{{ user.email }}</span>
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">角色</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">首个注册账号为管理员，决定后台访问权限</div></div>
              <span class="rounded-full bg-[var(--accent-bg)] px-3 py-[5px] text-xs font-semibold text-[var(--accent-ink)]">{{ roleLabel }}</span>
            </div>
            <div class="flex flex-col py-[15px]">
              <div class="flex items-center gap-[14px]">
                <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">密码</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">验证当前密码后设置新密码</div></div>
                <Button variant="outline" size="sm" @click="pwdOpen = !pwdOpen">{{ pwdOpen ? '收起' : '修改密码' }}</Button>
              </div>
              <div v-if="pwdOpen" class="mt-[14px] flex flex-col gap-[10px] rounded-[11px] bg-[var(--mid)] p-[14px]">
                <Input v-model="pwdOld" type="password" placeholder="当前密码" />
                <Input v-model="pwdNew" type="password" placeholder="新密码（至少 8 位，改密后其他设备将退出登录）" />
                <Button :disabled="pwdBusy" class="self-start" @click="submitPwd">{{ pwdBusy ? '提交中…' : '确认修改' }}</Button>
              </div>
            </div>
          </div>

          <Button variant="outline" class="self-start border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="logout"><i class="ph ph-sign-out"></i>退出登录</Button>
        </template>

        <!-- 通用 -->
        <template v-if="section === 'general'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">外观主题</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">明亮 / 深色，保存到账号，下次登录生效</div></div>
              <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.theme === 'light')" @click="s.theme !== 'light' && toggleTheme()">明亮</button>
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.theme === 'dark')" @click="s.theme !== 'dark' && toggleTheme()">深色</button>
              </div>
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认工作区</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">下次登录时进入的空间</div></div>
              <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.defaultWs === 'work')" @click="updateSetting('defaultWs', 'work')">工作</button>
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.defaultWs === 'personal')" @click="updateSetting('defaultWs', 'personal')">个人</button>
              </div>
            </div>
            <div class="flex items-center gap-[14px] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认视图</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">下次登录首屏进入的页面</div></div>
              <select :value="s.defaultView" @change="updateSetting('defaultView', ($event.target as HTMLSelectElement).value)" class="cursor-pointer rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[10px] py-2 text-[12.5px] font-semibold text-[var(--text)]">
                <option v-for="o in viewOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">以上设置即时保存到你的账号。</div>
        </template>

        <!-- AI（非管理员：个人配置） -->
        <template v-if="section === 'ai' && !canAdmin">
          <div class="flex items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
            <span class="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[var(--accent-bg)] text-[20px] text-[var(--accent-ink)]"><i :class="`ph ${aiOwnActive ? 'ph-user-gear' : 'ph-lock-simple'}`"></i></span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-[var(--text)]">{{ aiOwnActive ? '正在使用你的个人 AI 配置' : 'AI 接入由管理员统一配置' }}</div>
              <div class="mt-[3px] text-xs font-medium text-[var(--text3)] leading-snug">当前模型：{{ aiIsRule ? '规则版（离线）' : (s.aiModel || s.aiPreset) }}{{ aiOwnActive ? ' · 仅对你生效' : ' · 全团队共享' }}</div>
            </div>
            <Button variant="outline" size="sm" @click="ownAiOpen = !ownAiOpen">{{ ownAiOpen ? '收起' : '使用自己的 Key' }}</Button>
          </div>
          <ContentCard v-if="ownAiOpen" class="gap-[14px]">
            <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">服务商预设</span>
              <select :value="s.aiPreset" @change="pickAiPreset(AI_PRESETS.find(p => p.name === ($event.target as HTMLSelectElement).value)!)" class="cursor-pointer rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--text)]">
                <option v-for="o in aiPresetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <template v-if="!aiIsRule">
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">Base URL</span><Input :model-value="s.aiBaseUrl" @update:model-value="(v) => setAiField('aiBaseUrl', v)" placeholder="https://api.deepseek.com/v1" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">模型</span><Input :model-value="s.aiModel" @update:model-value="(v) => setAiField('aiModel', v)" placeholder="如 deepseek-chat / claude-sonnet-5" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">API Key</span><Input v-model="apiKey" type="password" :placeholder="aiOwnActive ? '••••••（已配置，留空不修改）' : 'sk-...'" /></label>
            </template>
            <div class="flex items-center gap-2.5">
              <Button size="sm" @click="saveOwnAi">保存个人配置</Button>
              <Button v-if="aiOwnActive" variant="outline" size="sm" @click="clearOwnAi">恢复团队配置</Button>
              <span class="text-[11.5px] font-medium text-[var(--text3)] leading-snug">只影响你自己的 AI 调用 · Key 不回显</span>
            </div>
          </ContentCard>
        </template>

        <!-- AI（管理员：团队配置） -->
        <template v-if="section === 'ai' && canAdmin">
          <ContentCard class="gap-[14px]">
            <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">服务商预设</span>
              <select :value="s.aiPreset" @change="pickAiPreset(AI_PRESETS.find(p => p.name === ($event.target as HTMLSelectElement).value)!)" class="cursor-pointer rounded-[10px] border border-[var(--line2)] bg-[var(--bg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--text)]">
                <option v-for="o in aiPresetOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <span v-if="aiPresetHint" class="text-[11.5px] font-medium text-[var(--text3)]">{{ aiPresetHint }}</span>
            </label>
            <template v-if="!aiIsRule">
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">Base URL</span><Input :model-value="s.aiBaseUrl" @update:model-value="(v) => setAiField('aiBaseUrl', v)" placeholder="https://api.deepseek.com/v1（Claude 可留空用官方）" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">模型</span><Input :model-value="s.aiModel" @update:model-value="(v) => setAiField('aiModel', v)" placeholder="如 deepseek-chat / qwen-plus / claude-sonnet-5" /></label>
              <label class="flex flex-col gap-1.5"><span class="text-xs font-semibold text-[var(--text2)]">API Key <span v-if="s.aiHasKey" class="font-medium text-[var(--text3)]">· 已配置（留空则不修改）</span></span><Input v-model="apiKey" type="password" :placeholder="s.aiHasKey ? '••••••（已配置）' : 'sk-...'" /></label>
              <div class="flex items-center gap-[14px] pt-0.5"><div class="flex-1"><div class="text-[13px] font-semibold text-[var(--text)]">失败兜底</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">模型调用失败时自动回退规则版，不丢输入</div></div><Switch :model-value="s.aiFallback !== false" @update:model-value="(v) => setAiField('aiFallback', v)" /></div>
            </template>
            <div v-else class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">规则版为离线关键词分类，无需 API Key。切换到其他服务商即可接入真实模型（支持任意 OpenAI 兼容服务）。</div>
          </ContentCard>
          <div class="flex items-center gap-[14px] rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-4 shadow-md">
            <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">连接状态</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">用一条样例验证服务商 / 模型 / Key</div></div>
            <span v-if="s.aiTested" class="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]"><span class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>可用</span>
            <Button variant="outline" size="sm" @click="testConn">测试连接</Button>
          </div>
          <div class="flex items-center gap-3">
            <Button @click="saveSettings">保存配置</Button>
            <span class="text-xs font-medium text-[var(--text3)]">仅保存在你的账号下 · Key 不回显</span>
          </div>
        </template>

        <!-- 通知 -->
        <template v-if="section === 'notifications'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">任务指派</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">有人把任务指派给你</div></div><Switch :model-value="s.notifPrefs.assign" @update:model-value="() => toggleNotifPref('assign')" /></div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">到期提醒</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">任务临近截止时间</div></div><Switch :model-value="s.notifPrefs.due" @update:model-value="() => toggleNotifPref('due')" /></div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">AI 失败告警</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">AI 生成失败需要排查</div></div><Switch :model-value="s.notifPrefs.fail" @update:model-value="() => toggleNotifPref('fail')" /></div>
            <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">完成动态</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">团队成员完成任务</div></div><Switch :model-value="s.notifPrefs.done" @update:model-value="() => toggleNotifPref('done')" /></div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-3 text-xs font-medium text-[var(--text3)] leading-relaxed">关闭后，对应类型的通知不再出现在左侧通知中心。</div>
        </template>

        <!-- 隐私与安全 -->
        <template v-if="section === 'privacy'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]">
              <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">AI 可见范围</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">AI 制定计划时可读取的数据</div></div>
              <div class="inline-flex gap-0.5 rounded-lg bg-[var(--mid)] p-[3px]">
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.aiVisibility === 'visible_scope_only')" @click="updateSetting('aiVisibility', 'visible_scope_only')">仅可见范围</button>
                <button class="rounded-md px-3 py-1 text-xs font-semibold" :class="seg(s.aiVisibility === 'all_todo')" @click="updateSetting('aiVisibility', 'all_todo')">全部 todo</button>
              </div>
            </div>
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">默认开启隐私模式</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">登录后自动隐藏跨空间数据</div></div><Switch :model-value="s.privacyDefault" @update:model-value="(v) => updateSetting('privacyDefault', v)" /></div>
            <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">谢绝陌生人好友请求</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">开启后别人无法向你发起好友请求，只能由你主动添加对方</div></div><Switch :model-value="s.friendPolicy === 'closed'" @update:model-value="() => { updateSetting('friendPolicy', s.friendPolicy === 'closed' ? 'open' : 'closed'); toast.flash(s.friendPolicy === 'closed' ? '已开放接收好友请求' : '已谢绝陌生人好友请求 · 只能由你主动添加') }" /></div>
          </div>
          <div class="rounded-xl bg-[var(--mid)] p-3 text-[12.5px] font-medium text-[var(--text2)] leading-relaxed">隐私模式开启时，AI 只读取当前工作区（工作 / 个人）可见内容，非 todo 内容默认不参与计划。</div>
        </template>

        <!-- 数据 -->
        <template v-if="section === 'data'">
          <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
            <div class="flex items-center gap-[14px] border-b border-[var(--line)] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">导出全部数据</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">任务、待澄清、非 todo 与生成记录 (JSON)</div></div><Button variant="outline" size="sm" @click="doExport"><i class="ph ph-download-simple"></i>导出</Button></div>
            <div class="flex items-center gap-[14px] py-[15px]"><div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--danger)]">清空测试数据</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">删除当前账号下的全部测试数据，不可恢复</div></div><Button variant="outline" size="sm" class="border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="doClearData">清空</Button></div>
          </div>
        </template>

      </div>
    </PageBody>
  </div>
</template>
