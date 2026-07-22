<script setup lang="ts">
// 设置 · 账号 section：头像/账户名/称呼/邮箱/角色/团队邀请/改密/退出。状态经 SETTINGS_KEY 注入。
import { computed, inject, onMounted, ref } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import { BaserowAPI, type TeamInvitation } from '@/modules/baserow/api'
import { useToast } from '@/stores/toast'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'

const { user, canAdmin, sAccountName, roleLabel, meBig, pwdOpen, pwdOld, pwdNew, pwdBusy, onName, onAccountName, submitPwd, logout } = inject(SETTINGS_KEY)!
const toast = useToast()
const baserowEnabled = ref(false)
const inviteBusy = ref(false)
const inviteUrl = ref('')
const inviteExpiresAt = ref('')
const invitations = ref<TeamInvitation[]>([])
const activeInviteCount = computed(() => {
  const now = Date.now()
  return invitations.value.filter((invite) => !invite.usedAt && Date.parse(invite.expiresAt) > now).length
})

function shortDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

async function loadInvitations() {
  if (!canAdmin.value) return
  try {
    const status = await BaserowAPI.status()
    baserowEnabled.value = status.enabled
    if (!status.enabled) return
    invitations.value = (await BaserowAPI.listInvitations()).invitations
  } catch {
    baserowEnabled.value = false
  }
}

async function copyInvitation() {
  if (!inviteUrl.value) return
  try {
    await navigator.clipboard.writeText(inviteUrl.value)
    toast.flash('邀请链接已复制')
  } catch {
    toast.flash('无法自动复制，请手动复制输入框中的链接')
  }
}

async function createInvitation() {
  inviteBusy.value = true
  try {
    const invite = await BaserowAPI.createInvitation()
    inviteUrl.value = invite.url
    inviteExpiresAt.value = invite.expiresAt
    await loadInvitations()
    await copyInvitation()
  } catch (error) {
    toast.flash('创建邀请失败：' + (error instanceof Error ? error.message : '请稍后重试'))
  } finally {
    inviteBusy.value = false
  }
}

onMounted(loadInvitations)
</script>

<template>
  <div class="flex items-center gap-[14px] rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
    <span class="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl bg-[var(--accent)] text-2xl font-semibold text-[var(--accent-contrast)]" style="font-family: var(--display)">{{ meBig }}</span>
    <div class="min-w-0 flex-1">
      <div class="text-base font-semibold text-[var(--text)]" style="font-family: var(--display)">{{ user.name }}</div>
      <div class="mt-1 text-[12.5px] font-medium text-[var(--text3)]">@{{ sAccountName }} · {{ user.email }}</div>
    </div>
    <span class="rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[11.5px] font-semibold text-[var(--accent-ink)]">{{ roleLabel }}</span>
  </div>

  <div class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-[18px] py-1 shadow-md">
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">账户名</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">你的唯一账号标识，用于系统展示（登录仍用邮箱）</div></div>
      <input :value="sAccountName" @change="onAccountName" maxlength="24" placeholder="账户名" class="w-[150px] rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
    </div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">称呼</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">聊天、问候与协作里对你的称谓，可随时修改</div></div>
      <input :value="user.name" @change="onName" maxlength="24" placeholder="称呼" class="w-[150px] rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-[13px] font-medium text-[var(--text)]" />
    </div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
      <div class="flex-1"><div class="text-[13.5px] font-semibold text-[var(--text)]">邮箱</div><div class="mt-[3px] text-xs font-medium text-[var(--text3)]">登录账号，不可修改</div></div>
      <span class="text-[13.5px] font-medium text-[var(--text2)]">{{ user.email }}</span>
    </div>
    <div class="flex items-center gap-[14px] border-b border-[var(--border-subtle)] py-[15px]">
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

  <div v-if="canAdmin && baserowEnabled" class="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-[18px] shadow-md">
    <div class="flex items-start gap-[14px]">
      <div class="flex-1">
        <div class="text-[13.5px] font-semibold text-[var(--text)]">邀请团队成员</div>
        <div class="mt-[3px] text-xs font-medium leading-relaxed text-[var(--text3)]">链接 7 天内有效且只能注册一次。当前有 {{ activeInviteCount }} 条未使用邀请。</div>
      </div>
      <Button size="sm" :disabled="inviteBusy" @click="createInvitation"><i class="ph ph-user-plus"></i>{{ inviteBusy ? '生成中…' : '生成并复制' }}</Button>
    </div>
    <div v-if="inviteUrl" class="mt-[14px] rounded-[11px] bg-[var(--mid)] p-[12px]">
      <div class="flex gap-2">
        <input :value="inviteUrl" readonly aria-label="团队邀请链接" class="min-w-0 flex-1 rounded-[9px] border border-[var(--line2)] bg-[var(--bg)] px-[11px] py-2 text-xs font-medium text-[var(--text)]" @focus="($event.target as HTMLInputElement).select()" />
        <Button variant="outline" size="sm" @click="copyInvitation"><i class="ph ph-copy"></i>复制</Button>
      </div>
      <div class="mt-2 text-[11.5px] font-medium text-[var(--text3)]">有效期至 {{ shortDate(inviteExpiresAt) }}。出于安全考虑，离开本页后无法再次查看这条链接。</div>
    </div>
  </div>

  <Button variant="outline" class="self-start border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)]" @click="logout"><i class="ph ph-sign-out"></i>退出登录</Button>
</template>
