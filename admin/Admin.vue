<template>
  <div style="min-height:100vh;display:flex;flex-direction:column;">
    <!-- 顶栏 -->
    <div style="height:56px;flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 20px;background:var(--panel);border-bottom:1px solid var(--line);">
      <div style="width:32px;height:32px;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 16px/1 var(--display);">灵</div>
      <span style="font:600 16px/1 var(--display);color:var(--text);">监控后台</span>
      <span style="font:500 12px/1 var(--font);color:var(--text3);">LinX 灵信 · 只读观察</span>
      <div style="flex:1"></div>
      <template v-if="s.me">
        <span style="font:500 12.5px/1 var(--font);color:var(--text2);">{{ s.me.accountName || s.me.name }} · 管理员</span>
        <a :href="mainUrl" style="height:32px;padding:0 13px;border:1px solid var(--line2);border-radius:9px;background:var(--panel);color:var(--text2);font:600 12px/32px var(--font);text-decoration:none;">← 返回主站</a>
        <button @click="logout" style="height:32px;padding:0 13px;border:1px solid var(--line2);border-radius:9px;background:var(--panel);color:var(--text2);font:600 12px/1 var(--font);cursor:pointer;">退出</button>
      </template>
    </div>

    <!-- 登录门 / 无权限 门 -->
    <template v-if="!s.me">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;">
        <div style="width:360px;max-width:92vw;background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:26px;">
          <div style="font:600 18px/1.3 var(--display);color:var(--text);margin-bottom:4px;">后台登录</div>
          <div style="font:500 12.5px/1.6 var(--font);color:var(--text3);margin-bottom:18px;">仅管理员账号可访问监控后台。</div>
          <input v-model="s.email" @keydown.enter="login" placeholder="邮箱" style="width:100%;border:1px solid var(--line2);border-radius:10px;padding:11px 13px;background:var(--bg);color:var(--text);font:500 14px/1 var(--font);margin-bottom:10px;"/>
          <input v-model="s.password" @keydown.enter="login" type="password" placeholder="密码" style="width:100%;border:1px solid var(--line2);border-radius:10px;padding:11px 13px;background:var(--bg);color:var(--text);font:500 14px/1 var(--font);margin-bottom:14px;"/>
          <template v-if="s.error"><div style="font:500 12.5px/1.5 var(--font);color:var(--danger);margin-bottom:12px;">{{ s.error }}</div></template>
          <button @click="login" :disabled="s.busy" style="width:100%;height:42px;border:0;border-radius:11px;background:var(--accent);color:#fff;font:600 14px/1 var(--font);cursor:pointer;">{{ s.busy ? '登录中…' : '登录' }}</button>
        </div>
      </div>
    </template>

    <!-- 主体 -->
    <template v-else>
      <div style="flex:1;min-height:0;display:flex;">
        <!-- 左：用户列表 -->
        <aside style="width:300px;flex:0 0 300px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;">
          <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;">
            <span style="font:600 13px/1 var(--font);color:var(--text);">用户</span>
            <span style="font:600 11px/1 var(--font);color:var(--text3);">{{ s.users.length }}</span>
            <div style="flex:1"></div>
            <button @click="loadOverview" :disabled="s.loading" title="刷新" style="width:28px;height:28px;border:0;border-radius:8px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;"><i :class="`ph ph-arrows-clockwise ${s.loading?'lx-spin':''}`" style="font-size:14px;"></i></button>
          </div>
          <div style="flex:1;overflow:auto;padding:8px;">
            <template v-if="s.loading && !s.users.length"><div style="display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--text3);padding:34px 12px;"><i class="ph ph-circle-notch lx-spin" style="font-size:22px;"></i><div style="font:500 12px/1 var(--font);">加载中…</div></div></template>
            <template v-for="u in s.users" :key="u.id">
              <a @click="selectUser(u.id)" :style="rowStyle(u.id)">
                <span style="width:30px;height:30px;flex:0 0 auto;border-radius:50%;background:#D9CFC0;color:#5b5348;display:flex;align-items:center;justify-content:center;font:600 12px/1 var(--font);">{{ (u.name||'?').slice(-1) }}</span>
                <span style="flex:1;min-width:0;">
                  <span style="display:block;font:600 13px/1.3 var(--font);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ u.name }}<span style="font:500 11px/1 var(--font);color:var(--text3);"> @{{ u.accountName || u.name }}</span></span>
                  <span style="display:block;font:500 11px/1.2 var(--font);color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ u.email }}</span>
                </span>
                <span v-if="u.errorCount>0" style="font:700 10px/1 var(--font);color:var(--danger);background:var(--danger-bg);padding:3px 6px;border-radius:6px;">{{ u.errorCount }}</span>
                <span v-else-if="u.role==='admin'" style="font:600 10px/1 var(--font);color:var(--accent-ink);background:var(--accent-bg);padding:3px 6px;border-radius:6px;">管理员</span>
              </a>
            </template>
          </div>
        </aside>

        <!-- 右：详情 -->
        <main style="flex:1;min-width:0;overflow:auto;padding:22px 24px;background:var(--bg);">
          <template v-if="s.overviewError"><div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text3);padding:70px 12px;"><i class="ph ph-warning-circle" style="font-size:28px;color:var(--danger);"></i><div style="font:500 13px/1.5 var(--font);color:var(--danger);">{{ s.overviewError }}</div><button @click="loadOverview" style="height:34px;padding:0 16px;border:1px solid var(--line2);border-radius:9px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;">重试</button></div></template>
          <template v-else-if="s.sel">
            <!-- 概览卡 -->
            <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px;">
              <div v-for="c in statCards" :key="c.label" style="flex:1;min-width:130px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);">
                <div :style="`font:600 26px/1 var(--display);color:${c.color};`">{{ c.value }}</div>
                <div style="font:500 12px/1 var(--font);color:var(--text3);margin-top:6px;">{{ c.label }}</div>
              </div>
            </div>
            <!-- 用户身份 -->
            <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow);margin-bottom:16px;">
              <div style="font:600 16px/1.3 var(--display);color:var(--text);">{{ s.sel.user.name }} <span style="font:500 13px/1 var(--font);color:var(--text3);">@{{ s.sel.user.accountName || s.sel.user.name }}</span></div>
              <div style="font:500 12.5px/1.6 var(--font);color:var(--text3);margin-top:4px;">{{ s.sel.user.email }} · {{ s.sel.user.role==='admin'?'管理员':'成员' }} · 注册于 {{ fmt(s.sel.user.createdAt) }}</div>
            </div>
            <!-- 生成记录 -->
            <div style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin:6px 2px 10px;">AI 生成记录 · {{ s.sel.records.length }}</div>
            <template v-if="s.sel.records.length===0"><div style="font:500 12.5px/1 var(--font);color:var(--text3);padding:10px 2px 18px;">暂无生成记录</div></template>
            <template v-for="(r,ri) in s.sel.records" :key="ri">
              <div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:11px 13px;margin-bottom:7px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span :style="`font:700 10px/1 var(--font);padding:3px 7px;border-radius:6px;color:#fff;background:${kindColor(r.aiKind)};`">{{ kindLabel(r.aiKind) }}</span>
                  <span style="flex:1;min-width:0;font:600 13px/1.4 var(--font);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ r.resultTitle || '（已删除）' }}</span>
                  <span style="font:500 11px/1 var(--font);color:var(--text3);">{{ fmt(r.createdAt) }}</span>
                </div>
                <div style="font:500 12px/1.5 var(--font);color:var(--text3);margin-top:6px;">原文：{{ r.rawInput }}</div>
              </div>
            </template>
            <!-- 异常 -->
            <div style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin:16px 2px 10px;">AI 异常 · {{ s.sel.errors.length }}</div>
            <template v-if="s.sel.errors.length===0"><div style="font:500 12.5px/1 var(--font);color:var(--text3);padding:10px 2px;">无异常记录 👍</div></template>
            <template v-for="(e,ei) in s.sel.errors" :key="ei">
              <div style="background:var(--danger-bg);border:1px solid var(--line2);border-radius:10px;padding:11px 13px;margin-bottom:7px;">
                <div style="font:600 12.5px/1.4 var(--font);color:var(--danger);">{{ e.message }}</div>
                <div style="font:500 12px/1.5 var(--font);color:var(--text2);margin-top:5px;">原文：{{ e.rawInput }} · {{ fmt(e.createdAt) }}</div>
              </div>
            </template>
          </template>
          <template v-else><div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text3);padding:80px 12px;"><i class="ph ph-cursor-click" style="font-size:28px;"></i><div style="font:500 13px/1 var(--font);">选择左侧用户查看详情</div></div></template>
        </main>
      </div>
    </template>
  </div>
</template>

<script>
import { reactive, computed, onMounted } from 'vue'
import { api, setToken, getToken } from '../src/lib/api.js'

export default {
  name: 'AdminApp',
  setup() {
    const s = reactive({ me: null, email: '', password: '', busy: false, error: '', users: [], totalErrors: 0, loading: false, overviewError: '', selId: null, sel: null })
    const mainUrl = (import.meta.env.BASE_URL || '/').replace(/admin\/?$/, '') || '/'

    const fmt = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
    const kindLabel = (k) => ({ task: '任务', todo_idea: '待澄清', non_todo: '非todo' }[k] || '其它')
    const kindColor = (k) => ({ task: 'var(--accent)', todo_idea: 'var(--idea)', non_todo: 'var(--nono)' }[k] || 'var(--text3)')

    async function bootstrap() {
      if (!getToken()) return
      try {
        const me = await api.me()
        if (me && me.role === 'admin') { s.me = me; await loadOverview() }
        else { s.error = '当前账号不是管理员，无法访问后台'; setToken(''); }
      } catch { setToken('') }
    }
    async function login() {
      if (s.busy) return
      s.error = ''; s.busy = true
      try {
        const r = await api.login(s.email.trim(), s.password)
        if (!r.user || r.user.role !== 'admin') { setToken(''); s.error = '该账号不是管理员，无权进入后台'; s.busy = false; return }
        setToken(r.token); s.me = r.user; s.password = ''
        await loadOverview()
      } catch (e) { s.error = (e && e.message) || '登录失败' }
      s.busy = false
    }
    function logout() { setToken(''); s.me = null; s.sel = null; s.selId = null; s.users = [] }
    async function loadOverview() {
      s.loading = true; s.overviewError = ''
      try {
        const ov = await api.adminOverview()
        s.users = ov.users || []; s.totalErrors = ov.totalErrors || 0
        if (s.selId && s.users.some((u) => u.id === s.selId)) await selectUser(s.selId)
      } catch (e) { s.overviewError = (e && e.message) || '加载失败' }
      s.loading = false
    }
    async function selectUser(id) {
      s.selId = id
      try { s.sel = await api.adminUser(id) } catch (e) { s.overviewError = (e && e.message) || '加载用户详情失败' }
    }
    function rowStyle(id) {
      const on = id === s.selId
      return `display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;cursor:pointer;margin-bottom:2px;background:${on ? 'var(--accent-bg)' : 'transparent'};`
    }
    const statCards = computed(() => {
      const u = s.sel && s.sel.user
      const row = u ? s.users.find((x) => x.id === u.id) : null
      return [
        { label: '正式任务', value: row ? row.taskCount : 0, color: 'var(--accent-ink)' },
        { label: '待澄清', value: row ? row.ideaCount : 0, color: 'var(--idea)' },
        { label: '非 todo', value: row ? row.nonCount : 0, color: 'var(--nono)' },
        { label: 'AI 异常', value: row ? row.errorCount : 0, color: (row && row.errorCount > 0) ? 'var(--danger)' : 'var(--text3)' },
      ]
    })

    onMounted(bootstrap)
    return { s, mainUrl, fmt, kindLabel, kindColor, login, logout, loadOverview, selectUser, rowStyle, statCards }
  },
}
</script>
