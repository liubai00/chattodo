<script setup lang="ts">
// 设置 · 账号 section：头像/账户名/称呼/邮箱/角色/改密/退出。状态经 SETTINGS_KEY 注入。
import { inject } from 'vue'
import { SETTINGS_KEY } from '@/modules/settings/composables/useSettings'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'

const { user, sAccountName, roleLabel, meBig, pwdOpen, pwdOld, pwdNew, pwdBusy, onName, onAccountName, submitPwd, logout } = inject(SETTINGS_KEY)!
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
