<template>
<div id="lx-root" style="height:100vh;width:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font);">
  <template v-if="vm.showLogin">
    <div style="height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(120% 90% at 50% 0%, #FFFDF8 0%, var(--bg) 60%);">
      <div style="width:400px;max-width:100%;display:flex;flex-direction:column;gap:22px;animation:lx-pop .4s ease;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
          <div style="width:52px;height:52px;border-radius:15px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 26px/1 var(--display);box-shadow:0 6px 20px #5f7d6440;">灵</div>
          <div style="text-align:center;">
            <div style="font:600 24px/1.2 var(--display);color:var(--text);">登录 LinX 灵信</div>
            <div style="font:500 13.5px/1.5 var(--font);color:var(--text3);margin-top:5px;">AI 原生 todo · 内部测试版</div>
          </div>
        </div>
        <div style="background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:14px;">
          <label v-if="vm.isRegister" style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">显示名称</span><input :value="vm.authName" @input="vm.onAuthName" placeholder="你的名字" style="border:1px solid var(--line2);border-radius:10px;padding:11px 13px;background:var(--bg);color:var(--text);font:500 14px/1 var(--font);"/></label>
          <label style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">邮箱</span><input :value="vm.authEmail" @input="vm.onAuthEmail" @keydown="vm.authKey" type="email" placeholder="you@team.com" style="border:1px solid var(--line2);border-radius:10px;padding:11px 13px;background:var(--bg);color:var(--text);font:500 14px/1 var(--font);"/></label>
          <label style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">密码</span><input :value="vm.authPassword" @input="vm.onAuthPassword" @keydown="vm.authKey" type="password" :placeholder="vm.isRegister?'至少 6 位':'输入密码'" style="border:1px solid var(--line2);border-radius:10px;padding:11px 13px;background:var(--bg);color:var(--text);font:500 14px/1 var(--font);"/></label>
          <div v-if="vm.authError" style="font:500 12.5px/1.4 var(--font);color:var(--danger);background:var(--danger-bg);border-radius:9px;padding:9px 12px;">{{ vm.authError }}</div>
          <button @click="vm.submitAuth" :disabled="vm.authBusy" style="margin-top:4px;height:44px;border:0;border-radius:11px;background:var(--accent);color:#fff;font:600 14.5px/1 var(--font);cursor:pointer;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;gap:7px;">{{ vm.authBusy ? '请稍候…' : (vm.isRegister ? '注册并进入' : '登录') }} <i class="ph ph-arrow-right"></i></button>
          <div style="text-align:center;font:500 12.5px/1.5 var(--font);color:var(--text3);">{{ vm.isRegister ? '已有账号？' : '还没有账号？' }}<span @click="vm.switchAuthMode" style="color:var(--accent-ink);cursor:pointer;font-weight:600;margin-left:5px;">{{ vm.isRegister ? '去登录' : '注册新账号' }}</span></div>
        </div>
        <div style="text-align:center;font:500 12px/1.6 var(--font);color:var(--text3);">你的数据仅自己可见 · 首个注册账号为管理员</div>
      </div>
    </div>
  </template>
  <template v-if="vm.authed">
    <div :style="vm.shellStyle">
      <nav :style="vm.railStyle">
        <div style="width:38px;height:38px;border-radius:11px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 19px/1 var(--display);box-shadow:var(--shadow);margin-bottom:8px;">灵</div>
        <button @click="vm.openSearch" title="搜索 (⌘K)" style="width:38px;height:38px;border:0;border-radius:11px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;margin-bottom:8px;" data-hv="1"><i class="ph ph-magnifying-glass"></i></button>
        <a id="nav-chat" @click="vm.goChat" title="聊天" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-chat-circle"></i></a>
        <a id="nav-database" @click="vm.goDatabase" title="Todo 数据库" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-table"></i></a>
        <a id="nav-projects" @click="vm.goProjects" title="项目" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-folders"></i></a>
        <a id="nav-clarify" @click="vm.goClarify" title="待澄清区" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-lightbulb"></i></a>
        <a id="nav-nontodo" @click="vm.goNonTodo" title="非 todo 隔离区" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-tray"></i></a>
        <a id="nav-agent" @click="vm.goAgent" title="Agent 配置" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-sparkle"></i></a>
        <div style="flex:1"></div>
        <a id="nav-admin" @click="vm.goAdmin" title="内部后台" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-chart-bar"></i></a>
        <a id="nav-settings" @click="vm.goSettings" title="设置" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:transparent;font-size:22px;cursor:pointer;" data-hv="0"><i class="ph ph-gear"></i></a>
        <button @click="vm.toggleNotif" title="通知" style="position:relative;width:38px;height:38px;border:0;border-radius:11px;background:transparent;color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:19px;cursor:pointer;margin-top:4px;" data-hv="0"><i class="ph ph-bell"></i><template v-if="vm.hasUnread"><span style="position:absolute;top:5px;right:5px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:var(--danger);color:#fff;font:700 9px/15px var(--font);text-align:center;">{{ vm.unread }}</span></template></button>
        <button @click="vm.toggleTheme" title="切换明/暗" style="width:38px;height:38px;border:0;border-radius:11px;background:transparent;color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;margin-top:4px;" data-hv="0"><i id="lx-thm" class="ph ph-moon"></i></button>
        <div @click="vm.goSettings" :title="vm.sName" style="width:34px;height:34px;border-radius:50%;background:#D9CFC0;color:#5b5348;display:flex;align-items:center;justify-content:center;font:600 13px/1 var(--font);margin-top:6px;cursor:pointer;">{{ vm.meBig }}</div>
      </nav>
      <template v-if="vm.notifOpen">
        <div @click="vm.closeNotif" style="position:fixed;inset:0;z-index:40;"></div>
        <div style="position:fixed;left:74px;bottom:16px;width:340px;max-width:80vw;background:var(--panel);border:1px solid var(--line2);border-radius:16px;box-shadow:0 16px 50px #2b241a33;z-index:41;overflow:hidden;animation:lx-pop .2s ease;">
          <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--line);"><i class="ph ph-bell" style="color:var(--accent-ink);"></i><span style="font:600 14px/1 var(--display);color:var(--text);">通知</span><div style="flex:1"></div><button @click="vm.markAllRead" style="border:0;background:transparent;color:var(--accent-ink);font:600 11.5px/1 var(--font);cursor:pointer;">全部已读</button></div>
          <div style="max-height:360px;overflow:auto;">
            <template v-for="(n, __i0) in vm.notifs" :key="__i0"><div style="display:flex;gap:11px;padding:12px 16px;border-bottom:1px solid var(--line);"><i :class="`ph ${n.icon}`" :style="`color:${n.color};font-size:18px;margin-top:1px;flex:0 0 auto;`"></i><div style="flex:1;min-width:0;"><div style="font:500 12.5px/1.5 var(--font);color:var(--text);">{{ n.text }}</div><div style="font:500 11px/1 var(--font);color:var(--text3);margin-top:3px;">{{ n.time }}</div></div><span :style="`width:8px;height:8px;border-radius:50%;background:${n.dot};margin-top:5px;flex:0 0 auto;`"></span></div></template>
            <template v-if="vm.notifs.length===0"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--text3);padding:30px 16px;"><i class="ph ph-bell-slash" style="font-size:22px;"></i><div style="font:500 12px/1 var(--font);">暂无通知</div></div></template>
          </div>
        </div>
      </template>
      <template v-if="vm.searchOpen">
        <div @click="vm.closeSearch" style="position:fixed;inset:0;background:#2b241a44;z-index:50;display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;">
          <div @click="vm.stop" style="width:560px;max-width:90vw;background:var(--panel);border:1px solid var(--line2);border-radius:16px;box-shadow:0 24px 70px #2b241a44;overflow:hidden;animation:lx-pop .18s ease;">
            <div style="display:flex;align-items:center;gap:11px;padding:15px 18px;border-bottom:1px solid var(--line);"><i class="ph ph-magnifying-glass" style="color:var(--text3);font-size:19px;"></i><input :value="vm.searchQuery" @input="vm.onSearch" placeholder="搜索任务、待澄清、非 todo、项目…" style="border:0;background:transparent;flex:1;color:var(--text);font:500 15px/1 var(--font);"/><span style="font:600 10.5px/1 var(--font);color:var(--text3);border:1px solid var(--line2);border-radius:6px;padding:3px 6px;">Esc</span></div>
            <div style="max-height:52vh;overflow:auto;padding:6px 0;">
              <template v-for="(g, __i1) in vm.paletteGroups" :key="__i1">
                <div style="padding:9px 18px 5px;font:700 10.5px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;">{{ g.name }}</div>
                <template v-for="(it, __i2) in g.items" :key="__i2"><a @click="it.run" :style="`display:flex;align-items:center;gap:11px;padding:10px 18px;cursor:pointer;background:${it.bg};`" data-hv="0"><i :class="`ph ${it.icon}`" style="color:var(--accent-ink);font-size:17px;flex:0 0 auto;"></i><span style="flex:1;min-width:0;font:600 13.5px/1.3 var(--font);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ it.label }}</span></a></template>
              </template>
            </div>
            <div style="padding:10px 18px;font:500 11px/1 var(--font);color:var(--text3);border-top:1px solid var(--line);display:flex;gap:14px;"><span>↑↓ 选择</span><span>↵ 执行</span><span>esc 关闭</span><span style="margin-left:auto;">? 快捷键</span></div>
          </div>
        </div>
      </template>
      <template v-if="vm.shortcutsOpen">
        <div @click="vm.closeShortcuts" style="position:fixed;inset:0;background:#2b241a44;z-index:52;display:flex;align-items:center;justify-content:center;padding:24px;">
          <div @click="vm.stop" style="width:430px;max-width:92vw;background:var(--panel);border:1px solid var(--line2);border-radius:16px;box-shadow:0 24px 70px #2b241a44;overflow:hidden;animation:lx-pop .18s ease;">
            <div style="display:flex;align-items:center;gap:9px;padding:15px 18px;border-bottom:1px solid var(--line);"><i class="ph ph-keyboard" style="color:var(--accent-ink);font-size:19px;"></i><span style="font:600 15px/1 var(--display);color:var(--text);">键盘快捷键</span></div>
            <div style="padding:6px 18px 14px;">
              <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);"><span style="flex:1;font:500 13px/1.4 var(--font);color:var(--text);">命令面板</span><span style="font:600 11.5px/1 var(--font);color:var(--text2);border:1px solid var(--line2);border-radius:6px;padding:4px 8px;">⌘K&nbsp;/&nbsp;/</span></div>
              <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);"><span style="flex:1;font:500 13px/1.4 var(--font);color:var(--text);">新建捕获</span><span style="font:600 11.5px/1 var(--font);color:var(--text2);border:1px solid var(--line2);border-radius:6px;padding:4px 8px;">N</span></div>
              <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);"><span style="flex:1;font:500 13px/1.4 var(--font);color:var(--text);">跳转 · 聊天/数据库/项目/设置</span><span style="font:600 11.5px/1 var(--font);color:var(--text2);border:1px solid var(--line2);border-radius:6px;padding:4px 8px;">G 然后 C/D/P/S</span></div>
              <div style="display:flex;align-items:center;gap:12px;padding:11px 0;"><span style="flex:1;font:500 13px/1.4 var(--font);color:var(--text);">显示 / 关闭本表</span><span style="font:600 11.5px/1 var(--font);color:var(--text2);border:1px solid var(--line2);border-radius:6px;padding:4px 8px;">?</span></div>
            </div>
          </div>
        </div>
      </template>
      <template v-if="vm.isMobile">
        <div style="flex:0 0 auto;height:52px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--panel);">
          <template v-if="vm.showBack"><button @click="vm.back" style="width:34px;height:34px;border:0;border-radius:9px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;"><i class="ph ph-caret-left"></i></button></template>
          <div style="width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 14px/1 var(--display);">灵</div>
          <span style="font:700 14px/1 var(--font);color:var(--text);">LinX 灵信</span>
          <div style="flex:1"></div>
          <button @click="vm.toggleTheme" style="width:34px;height:34px;border:0;border-radius:9px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;"><i id="lx-thm2" class="ph ph-moon"></i></button>
        </div>
      </template>
      <div :style="vm.paneWrapStyle">
        <aside id="lx-mid" :style="vm.midStyle">
          <template v-if="vm.isChat">
            <div style="padding:15px 16px 13px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:12px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="display:inline-flex;background:var(--mid);border-radius:9px;padding:3px;gap:2px;">
                  <button @click="vm.setWork" :style="vm.wsWorkStyle">工作</button>
                  <button @click="vm.setPersonal" :style="vm.wsPersonalStyle">个人</button>
                </div>
                <div style="flex:1"></div>
                <button @click="vm.togglePrivacy" title="隐私模式" :style="vm.privBtnStyle"><i class="ph ph-lock-simple"></i></button>
              </div>
              <div style="display:flex;align-items:center;gap:8px;background:var(--mid);border-radius:9px;padding:8px 11px;">
                <i class="ph ph-magnifying-glass" style="color:var(--text3);font-size:15px;"></i>
                <input :value="vm.feedQuery" @input="vm.onFeedQuery" placeholder="搜索收集内容" style="border:0;background:transparent;flex:1;min-width:0;color:var(--text);font:500 13px/1 var(--font);"/>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 17px 7px;">
              <span style="font:700 11px/1 var(--font);letter-spacing:.09em;color:var(--text3);text-transform:uppercase;">收集箱</span>
              <span style="font:600 11px/1 var(--font);color:var(--text3);">{{ vm.feedCount }}</span>
            </div>
            <div style="flex:1;overflow:auto;padding:2px 9px 12px;display:flex;flex-direction:column;gap:1px;">
              <template v-for="(f, __i3) in vm.feed" :key="__i3">
                <a @click="f.open" style="display:flex;gap:10px;padding:10px;border-radius:10px;background:transparent;cursor:pointer;" data-hv="0">
                  <span :style="`width:7px;height:7px;border-radius:50%;background:${f.dot};margin-top:6px;flex:0 0 auto;`"></span>
                  <span style="flex:1;min-width:0;">
                    <span :style="`display:block;font:600 13px/1.4 var(--font);color:${f.textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ f.title }}</span>
                    <span style="display:block;font:500 11.5px/1.3 var(--font);color:var(--text3);margin-top:2px;">{{ f.label }} · {{ f.time }}</span>
                  </span>
                </a>
              </template>
              <template v-if="vm.feedEmpty"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--text3);padding:36px 12px;text-align:center;"><i class="ph ph-tray" style="font-size:24px;"></i><div style="font:500 12px/1.6 var(--font);">还没有收集内容<br/>在右侧输入框丢一句话试试</div></div></template>
            </div>
          </template>
          <template v-if="vm.isDatabase">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);">
              <div style="font:600 16px/1.2 var(--display);color:var(--text);">Todo 数据库</div>
              <div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">{{ vm.taskTotal }} 个正式任务</div>
            </div>
            <div style="flex:1;overflow:auto;padding:10px 10px;display:flex;flex-direction:column;gap:2px;">
              <span style="font:700 10.5px/1 var(--font);letter-spacing:.09em;color:var(--text3);text-transform:uppercase;padding:8px 8px 6px;">视图</span>
              <template v-for="(v, __i4) in vm.dbViews" :key="__i4">
                <a @click="v.select" :style="v.style"><i :class="`ph ${v.icon}`" style="font-size:16px;"></i><span style="flex:1;">{{ v.name }}</span><span style="font:600 11px/1 var(--font);color:var(--text3);">{{ v.count }}</span></a>
              </template>
              <span style="font:700 10.5px/1 var(--font);letter-spacing:.09em;color:var(--text3);text-transform:uppercase;padding:14px 8px 6px;">按隐私范围</span>
              <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;font:500 13px/1 var(--font);color:var(--text2);"><span style="width:8px;height:8px;border-radius:2px;background:var(--accent);"></span>工作</div>
              <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;font:500 13px/1 var(--font);color:var(--text2);"><span style="width:8px;height:8px;border-radius:2px;background:var(--idea);"></span>个人</div>
            </div>
          </template>
          <template v-if="vm.isClarify">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);"><div style="font:600 16px/1.2 var(--display);color:var(--text);">待澄清区</div><div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">{{ vm.clarifyCount }} 条 · 有行动倾向但还不够具体</div></div>
            <div style="flex:1;overflow:auto;padding:8px 9px;display:flex;flex-direction:column;gap:2px;">
              <template v-for="(i, __i5) in vm.ideaList" :key="__i5"><a @click="i.select" :style="`display:flex;flex-direction:column;gap:4px;padding:11px 12px;border-radius:10px;cursor:pointer;background:${i.bg};`" data-hv="0"><span style="font:600 13.5px/1.4 var(--font);color:var(--text);">{{ i.title }}</span><span style="font:500 11.5px/1.4 var(--font);color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ i.preview }}</span></a></template>
            </div>
          </template>
          <template v-if="vm.isNonTodo">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);"><div style="font:600 16px/1.2 var(--display);color:var(--text);">非 todo 隔离区</div><div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">{{ vm.nonCount }} 条 · 不参与任务与计划</div></div>
            <div style="flex:1;overflow:auto;padding:8px 9px;display:flex;flex-direction:column;gap:2px;">
              <template v-for="(n, __i6) in vm.nonList" :key="__i6"><a @click="n.select" :style="`display:flex;flex-direction:column;gap:5px;padding:11px 12px;border-radius:10px;cursor:pointer;background:${n.bg};`" data-hv="0"><span style="font:600 13.5px/1.4 var(--font);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ n.title }}</span><span style="font:500 11px/1 var(--font);color:var(--text3);display:inline-flex;align-items:center;gap:5px;"><i class="ph ph-tray"></i>{{ n.dest }}</span></a></template>
            </div>
          </template>
          <template v-if="vm.isAgent">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);"><div style="font:600 16px/1.2 var(--display);color:var(--text);">Agent 配置</div><div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">定义 AI 如何判断与追问</div></div>
            <div style="flex:1;overflow:auto;padding:10px 10px;display:flex;flex-direction:column;gap:2px;">
              <template v-for="(s, __i7) in vm.agentSections" :key="__i7"><a @click="s.select" :style="s.style"><i :class="`ph ${s.icon}`" style="font-size:17px;"></i><span style="font:600 13px/1 var(--font);">{{ s.name }}</span></a></template>
            </div>
          </template>
          <template v-if="vm.isSettings">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);"><div style="font:600 16px/1.2 var(--display);color:var(--text);">设置</div><div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">账号 · 接入 · 隐私</div></div>
            <div style="flex:1;overflow:auto;padding:10px 10px;display:flex;flex-direction:column;gap:2px;">
              <template v-for="(s, __i8) in vm.setSections" :key="__i8"><a @click="s.select" :style="s.style"><i :class="`ph ${s.icon}`" style="font-size:17px;"></i><span style="font:600 13px/1 var(--font);">{{ s.name }}</span></a></template>
            </div>
          </template>
          <template v-if="vm.showAdminContent">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);"><div style="font:600 16px/1.2 var(--display);color:var(--text);">内部后台</div><div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">测试用户 · 只读观察</div></div>
            <div style="flex:1;overflow:auto;padding:10px 10px;display:flex;flex-direction:column;gap:2px;">
              <template v-for="(u, __i9) in vm.userList" :key="__i9"><a @click="u.select" :style="`display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;cursor:pointer;background:${u.bg};`" data-hv="0"><span style="width:30px;height:30px;flex:0 0 auto;border-radius:50%;background:#D9CFC0;color:#5b5348;display:flex;align-items:center;justify-content:center;font:600 12px/1 var(--font);">{{ u.initial }}</span><span style="flex:1;min-width:0;"><span style="display:block;font:600 13px/1.3 var(--font);color:var(--text);">{{ u.name }}</span><span style="display:block;font:500 11px/1.2 var(--font);color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ u.email }}</span></span></a></template>
            </div>
          </template>
          <template v-if="vm.isProjects">
            <div style="padding:16px 16px 12px;border-bottom:1px solid var(--line);"><div style="font:600 16px/1.2 var(--display);color:var(--text);">项目</div><div style="font:500 12px/1.4 var(--font);color:var(--text3);margin-top:3px;">按项目组织任务与进度</div></div>
            <div style="flex:1;overflow:auto;padding:10px 10px;display:flex;flex-direction:column;gap:4px;">
              <template v-for="(p, __i10) in vm.projList" :key="__i10"><a @click="p.select" :style="`display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:11px;cursor:pointer;background:${p.bg};`" data-hv="0"><div style="display:flex;align-items:center;gap:8px;"><span :style="`width:9px;height:9px;border-radius:3px;background:${p.color};flex:0 0 auto;`"></span><span style="flex:1;min-width:0;font:600 13.5px/1.3 var(--font);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ p.name }}</span><span style="font:600 11px/1 var(--font);color:var(--text3);">{{ p.done }}/{{ p.count }}</span></div><div style="height:5px;border-radius:3px;background:var(--mid);overflow:hidden;"><div :style="`height:100%;width:${p.pct}%;background:${p.color};border-radius:3px;`"></div></div></a></template>
            </div>
          </template>
          <template v-if="vm.showAdminDenied">
            <div style="padding:16px;color:var(--text3);font:500 13px/1.5 var(--font);display:flex;align-items:center;gap:8px;"><i class="ph ph-lock-simple"></i>无权限访问</div>
          </template>
          <template v-if="vm.isStub">
            <div style="padding:16px;color:var(--text3);font:500 13px/1.5 var(--font);">{{ vm.stubName }}</div>
          </template>
        </aside>
        <main :style="vm.mainStyle"><template v-if="vm.isViewer"><div style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 18px;background:var(--idea-bg);border-bottom:1px solid var(--line);font:600 12px/1.4 var(--font);color:var(--idea);"><i class="ph ph-lock-simple"></i>只读模式 · 你当前是「只读」角色，无法创建或编辑内容</div></template>
          <template v-if="vm.isChat">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-chat-circle" style="font-size:20px;color:var(--accent-ink);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">聊天</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">收集与判断</span>
              <div style="flex:1"></div>
              <span :style="vm.modeChipStyle"><i :class="`ph ${vm.modeIcon}`" style="font-size:13px;"></i>{{ vm.modeLabel }}</span>
            </div>
            <div id="lx-msgs" style="flex:1;min-height:0;overflow:auto;padding:26px 26px;display:flex;flex-direction:column;gap:17px;">
              <template v-for="(m, __i11) in vm.messages" :key="__i11">
                <template v-if="m.isSys"><div style="align-self:center;font:500 12px/1.5 var(--font);color:var(--text3);background:var(--mid);padding:6px 13px;border-radius:20px;">{{ m.text }}</div></template>
                <template v-if="m.isUser"><div style="align-self:flex-end;max-width:78%;display:flex;flex-direction:column;align-items:flex-end;gap:5px;animation:lx-fade .25s ease;"><template v-if="m.hasRefs"><div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end;"><template v-for="(r, __i12) in m.refs" :key="__i12"><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 11px/1 var(--font);"><i class="ph ph-at" style="font-size:11px;"></i>{{ r }}</span></template></div></template><div style="background:var(--accent);color:#fff;padding:10px 14px;border-radius:15px 15px 5px 15px;font:500 14px/1.55 var(--font);box-shadow:var(--shadow);white-space:pre-wrap;">{{ m.text }}</div></div></template>
                <template v-if="m.isAgentText"><div style="align-self:flex-start;max-width:82%;display:flex;gap:9px;animation:lx-fade .25s ease;"><span style="width:26px;height:26px;flex:0 0 auto;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 13px/1 var(--display);margin-top:2px;">灵</span><div :style="`background:var(--panel);border:1px solid var(--line);padding:10px 14px;border-radius:5px 15px 15px 15px;font:500 14px/1.6 var(--font);color:${m.isErr?'var(--danger)':'var(--text)'};box-shadow:var(--shadow);white-space:pre-wrap;`">{{ m.text }}</div></div></template>
                <template v-if="m.isTask">
                  <div style="align-self:flex-start;max-width:82%;display:flex;flex-direction:column;gap:8px;animation:lx-fade .28s ease;">
                    <details style="align-self:flex-start;"><summary style="list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 11.5px/1 var(--font);"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></span>任务<i class="ph ph-caret-down" style="font-size:11px;opacity:.6;"></i></summary><div style="margin-top:6px;font:500 12.5px/1.55 var(--font);color:var(--text2);background:var(--mid);border-radius:10px;padding:9px 12px;max-width:430px;">{{ m.reason }}</div></details>
                    <div @click="m.open" style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px;box-shadow:var(--shadow);cursor:pointer;" data-hv="2">
                      <div style="display:flex;gap:10px;align-items:flex-start;"><span style="width:18px;height:18px;border-radius:6px;border:2px solid var(--accent);margin-top:1px;flex:0 0 auto;"></span><div style="flex:1;min-width:0;"><div style="font:600 14.5px/1.45 var(--font);color:var(--text);">{{ m.title }}</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;"><template v-for="(c, __i13) in m.chips" :key="__i13"><span style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:var(--r-sm);background:var(--mid);color:var(--text2);font:600 11.5px/1 var(--font);"><i :class="`ph ${c.i}`" style="font-size:12px;"></i>{{ c.t }}</span></template></div></div></div>
                      <div style="margin-top:11px;padding-top:11px;border-top:1px solid var(--line);display:flex;align-items:center;gap:6px;font:500 11.5px/1 var(--font);color:var(--text3);"><i class="ph ph-check-circle" style="color:var(--accent);font-size:14px;"></i>已进入 Todo 数据库 · 点击查看详情与来源</div>
                    </div>
                  </div>
                </template>
                <template v-if="m.isIdea">
                  <div style="align-self:flex-start;max-width:82%;display:flex;flex-direction:column;gap:8px;animation:lx-fade .28s ease;">
                    <details style="align-self:flex-start;"><summary style="list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;background:var(--idea-bg);color:var(--idea);font:600 11.5px/1 var(--font);"><span style="width:6px;height:6px;border-radius:50%;background:var(--idea);"></span>待澄清<i class="ph ph-caret-down" style="font-size:11px;opacity:.6;"></i></summary><div style="margin-top:6px;font:500 12.5px/1.55 var(--font);color:var(--text2);background:var(--mid);border-radius:10px;padding:9px 12px;max-width:430px;">{{ m.reason }}</div></details>
                    <div style="background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--idea);border-radius:var(--r);padding:14px;box-shadow:var(--shadow);">
                      <div style="font:600 14.5px/1.45 var(--font);color:var(--text);">{{ m.title }}</div>
                      <div style="margin-top:9px;background:var(--idea-bg);border-radius:10px;padding:9px 12px;font:500 12.5px/1.5 var(--font);color:var(--text2);"><b style="color:var(--idea);">建议下一步：</b>{{ m.suggest }}</div>
                      <div style="display:flex;gap:8px;margin-top:12px;"><button @click="m.open" style="height:30px;padding:0 13px;border:1px solid var(--accent);border-radius:var(--r-sm);background:transparent;color:var(--accent-ink);font:600 12.5px/1 var(--font);cursor:pointer;">去澄清</button></div>
                    </div>
                  </div>
                </template>
                <template v-if="m.isNono">
                  <div style="align-self:flex-start;max-width:82%;display:flex;flex-direction:column;gap:8px;animation:lx-fade .28s ease;">
                    <details style="align-self:flex-start;"><summary style="list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;background:var(--nono-bg);color:var(--nono);font:600 11.5px/1 var(--font);"><span style="width:6px;height:6px;border-radius:50%;background:var(--nono);"></span>非 todo<i class="ph ph-caret-down" style="font-size:11px;opacity:.6;"></i></summary><div style="margin-top:6px;font:500 12.5px/1.55 var(--font);color:var(--text2);background:var(--mid);border-radius:10px;padding:9px 12px;max-width:430px;">{{ m.reason }}</div></details>
                    <div style="background:var(--nono-bg);border:1px dashed var(--line2);border-radius:var(--r);padding:13px;">
                      <div style="font:500 14px/1.5 var(--font);color:var(--text2);">{{ m.text }}</div>
                      <div style="margin-top:8px;display:flex;align-items:center;gap:6px;font:500 11.5px/1 var(--font);color:var(--text3);"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存</div>
                    </div>
                  </div>
                </template>
                <template v-if="m.isPlan">
                  <div style="align-self:flex-start;max-width:82%;background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:15px;box-shadow:var(--shadow);animation:lx-fade .28s ease;">
                    <div style="font:600 14px/1.3 var(--display);color:var(--text);">{{ m.planTitle }}</div>
                    <div style="font:500 11.5px/1.4 var(--font);color:var(--text3);margin-top:3px;">{{ m.planSub }}</div>
                    <div style="display:flex;flex-direction:column;gap:9px;margin-top:13px;">
                      <template v-for="(p, __i14) in m.plan" :key="__i14"><div style="display:flex;align-items:center;gap:10px;"><span style="width:20px;height:20px;border-radius:6px;background:var(--accent-bg);color:var(--accent-ink);font:700 11px/1 var(--font);display:flex;align-items:center;justify-content:center;flex:0 0 auto;">{{ p.n }}</span><span style="flex:1;font:500 13.5px/1.4 var(--font);color:var(--text);">{{ p.t }}</span><span style="padding:3px 8px;border-radius:var(--r-sm);background:var(--mid);color:var(--text2);font:600 11px/1 var(--font);">{{ p.d }}</span></div></template>
                    </div>
                    <div style="margin-top:13px;padding-top:11px;border-top:1px solid var(--line);display:flex;align-items:center;gap:6px;font:500 11px/1 var(--font);color:var(--text3);"><i class="ph ph-shield-check" style="color:var(--accent);font-size:13px;"></i>{{ m.planNote }}</div>
                  </div>
                </template>
                <template v-if="m.isError">
                  <div style="align-self:flex-start;max-width:82%;background:var(--danger-bg);border-left:3px solid var(--danger);border-radius:var(--r);padding:13px 15px;display:flex;flex-direction:column;gap:9px;animation:lx-fade .28s ease;">
                    <div style="display:flex;align-items:center;gap:8px;font:600 13px/1 var(--font);color:var(--danger);"><i class="ph ph-warning-circle" style="font-size:16px;"></i>AI 生成失败 · {{ m.errType }}</div>
                    <div style="font:500 12.5px/1.5 var(--font);color:var(--text2);">未静默失败 — 原始输入已保存，可重试，异常已记录到内部后台。</div>
                    <div style="display:flex;align-items:center;gap:9px;">
                      <button @click="m.retry" style="height:30px;padding:0 13px;border:0;border-radius:8px;background:var(--danger);color:#fff;font:600 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="ph ph-arrow-clockwise"></i>重试</button>
                      <template v-if="m.retrying"><span style="font:500 11.5px/1 var(--font);color:var(--text3);">重试中…</span></template>
                    </div>
                  </div>
                </template>
              </template>
              <template v-if="vm.thinking"><div style="align-self:flex-start;display:flex;gap:9px;animation:lx-fade .2s ease;"><span style="width:26px;height:26px;flex:0 0 auto;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 13px/1 var(--display);margin-top:2px;opacity:.85;">灵</span><div style="display:inline-flex;align-items:center;gap:8px;padding:10px 14px;background:var(--mid);border-radius:5px 14px 14px 14px;max-width:100%;"><span style="display:inline-flex;gap:4px;flex:0 0 auto;"><span style="width:5px;height:5px;border-radius:50%;background:var(--accent-ink);animation:lx-pulse 1s infinite;"></span><span style="width:5px;height:5px;border-radius:50%;background:var(--accent-ink);animation:lx-pulse 1s infinite .2s;"></span><span style="width:5px;height:5px;border-radius:50%;background:var(--accent-ink);animation:lx-pulse 1s infinite .4s;"></span></span><span class="lx-think">{{ vm.thinkText }}</span></div></div></template>
            </div>
            <div style="padding:14px 18px 18px;border-top:1px solid var(--line);background:var(--panel);position:relative;">
              <template v-if="vm.mentionOpen">
                <div style="position:absolute;left:18px;right:18px;bottom:calc(100% - 8px);background:var(--panel);border:1px solid var(--line2);border-radius:12px;box-shadow:0 -8px 28px #2b241a22;overflow:hidden;max-height:236px;overflow-y:auto;z-index:6;">
                  <div style="padding:9px 13px 6px;font:700 10.5px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;">引用任务 / 项目</div>
                  <template v-for="(mi, __i15) in vm.mentionItems" :key="__i15"><a @click="mi.pick" :style="`display:flex;align-items:center;gap:10px;padding:9px 13px;cursor:pointer;background:${mi.bg};`" data-hv="0"><i :class="`ph ${mi.icon}`" style="font-size:16px;color:var(--accent-ink);"></i><span style="flex:1;min-width:0;font:600 13px/1.3 var(--font);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ mi.label }}</span><span style="font:600 10.5px/1 var(--font);color:var(--text3);padding:3px 7px;border-radius:6px;background:var(--mid);">{{ mi.typeLabel }}</span></a></template>
                  <template v-if="vm.noMention"><div style="padding:12px 13px;font:500 12.5px/1 var(--font);color:var(--text3);">没有匹配的任务 / 项目</div></template>
                </div>
              </template>
              <div style="border:1px solid var(--line2);border-radius:var(--r);background:var(--bg);padding:11px 12px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--shadow);">
                <template v-if="vm.hasPendingRefs"><div style="display:flex;flex-wrap:wrap;gap:6px;"><template v-for="(r, __i16) in vm.pendingRefs" :key="__i16"><span style="display:inline-flex;align-items:center;gap:4px;padding:4px 5px 4px 10px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 12px/1 var(--font);"><i class="ph ph-at" style="font-size:12px;"></i>{{ r.label }}<button @click="r.remove" style="border:0;background:transparent;color:var(--accent-ink);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:2px;border-radius:50%;font-size:12px;">&times;</button></span></template></div></template>
                <input id="lx-composer" @input="vm.onComposerInput" @keydown="vm.sendKey" placeholder="输入想法、任务，或用 @ 引用任务 / 项目…" style="border:0;background:transparent;color:var(--text);font:500 14px/1.5 var(--font);"/>
                <div style="display:flex;align-items:center;gap:9px;">
                  <button @click="vm.atButton" title="引用任务 / 项目" style="width:30px;height:30px;border:0;border-radius:8px;background:var(--mid);color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;"><i class="ph ph-at"></i></button>
                  <span style="font:500 11.5px/1 var(--font);color:var(--text3);">@ 引用 · Enter 发送</span>
                  <div style="flex:1"></div>
                  <button @click="vm.send" style="height:33px;padding:0 15px;border:0;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;gap:6px;font:600 13px/1 var(--font);cursor:pointer;box-shadow:var(--shadow);">发送<i class="ph ph-paper-plane-tilt"></i></button>
                </div>
              </div>
            </div>
          </template>
          <template v-if="vm.isDatabase">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-table" style="font-size:19px;color:var(--accent-ink);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">{{ vm.dbViewName }}</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">{{ vm.filteredCount }} 条</span>
              <div style="flex:1"></div>
              <div style="display:inline-flex;background:var(--mid);border-radius:9px;padding:3px;gap:2px;">
                <button @click="vm.setTable" :style="vm.tableSegStyle"><i class="ph ph-rows"></i>表格</button>
                <button @click="vm.setBoard" :style="vm.boardSegStyle"><i class="ph ph-kanban"></i>看板</button>
              </div>
              <template v-if="vm.canEdit"><button @click="vm.newCapture" style="height:32px;padding:0 12px;border:0;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;gap:6px;font:600 12.5px/1 var(--font);cursor:pointer;box-shadow:var(--shadow);"><i class="ph ph-plus"></i>新建</button></template>
            </div>
            <div style="flex:0 0 auto;height:52px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:0 18px;background:var(--panel);">
              <div style="display:flex;align-items:center;gap:8px;background:var(--mid);border-radius:9px;padding:7px 11px;width:230px;">
                <i class="ph ph-magnifying-glass" style="color:var(--text3);font-size:15px;"></i>
                <input :value="vm.dbSearch" @input="vm.onDbSearch" placeholder="搜索任务标题" style="border:0;background:transparent;flex:1;min-width:0;color:var(--text);font:500 13px/1 var(--font);"/>
              </div>
              <select :value="vm.dbProject" @change="vm.onDbProject" style="border:1px solid var(--line2);border-radius:9px;padding:7px 10px;background:var(--panel);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;"><template v-for="(o, __i17) in vm.projectOptions" :key="__i17"><option :value="o.value">{{ o.label }}</option></template></select>
              <select :value="vm.dbPriority" @change="vm.onDbPriority" style="border:1px solid var(--line2);border-radius:9px;padding:7px 10px;background:var(--panel);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;"><template v-for="(o, __i18) in vm.priorityOptions" :key="__i18"><option :value="o.value">{{ o.label }}</option></template></select>
              <div style="flex:1"></div>
              <span :style="vm.modeChipStyle"><i :class="`ph ${vm.modeIcon}`" style="font-size:13px;"></i>{{ vm.modeLabel }}</span>
            </div>
            <template v-if="vm.hasSelection">
              <div style="flex:0 0 auto;height:48px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:9px;padding:0 18px;background:var(--accent-bg);animation:lx-fade .2s ease;">
                <span style="font:600 13px/1 var(--font);color:var(--accent-ink);">已选 {{ vm.selectedCount }} 项</span>
                <div style="flex:1"></div>
                <button @click="vm.batchDone" style="height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:5px;"><i class="ph ph-check-circle" style="color:var(--accent);"></i>标记完成</button>
                <button @click="vm.batchProg" style="height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;">进行中</button>
                <button @click="vm.batchP1" style="height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;">设为 P1</button>
                <button @click="vm.batchMoveOut" style="height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--panel);color:var(--text);font:600 12px/1 var(--font);cursor:pointer;">移出 todo</button>
                <button @click="vm.batchDelete" style="height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--danger-bg);color:var(--danger);font:600 12px/1 var(--font);cursor:pointer;">删除</button>
                <button @click="vm.clearSel" title="取消选择" style="height:30px;width:30px;border:0;border-radius:8px;background:transparent;color:var(--text2);font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"><i class="ph ph-x"></i></button>
              </div>
            </template>
            <template v-if="vm.isTableView">
              <div style="flex:1;overflow:auto;">
                <div style="display:grid;grid-template-columns:36px 1fr 112px 100px 76px 88px 60px;gap:0;padding:0 22px;position:sticky;top:0;background:var(--bg);z-index:1;border-bottom:1px solid var(--line);">
                  <div style="padding:12px 0;display:flex;align-items:center;"><span @click="vm.onSelectAll" :style="vm.selAllBoxStyle"><i class="ph ph-check" :style="`font-size:11px;color:#fff;${vm.allSelectedCheck}`"></i></span></div>
                  <div @click="vm.hdrTitle.sort" :style="`padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:${vm.hdrTitle.color};text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;`">标题<i :class="`ph ${vm.hdrTitle.icon}`" :style="`font-size:12px;color:${vm.hdrTitle.iconColor};`"></i></div>
                  <div @click="vm.hdrProject.sort" :style="`padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:${vm.hdrProject.color};text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;`">项目<i :class="`ph ${vm.hdrProject.icon}`" :style="`font-size:12px;color:${vm.hdrProject.iconColor};`"></i></div>
                  <div @click="vm.hdrDue.sort" :style="`padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:${vm.hdrDue.color};text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;`">截止<i :class="`ph ${vm.hdrDue.icon}`" :style="`font-size:12px;color:${vm.hdrDue.iconColor};`"></i></div>
                  <div @click="vm.hdrPriority.sort" :style="`padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:${vm.hdrPriority.color};text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;`">优先级<i :class="`ph ${vm.hdrPriority.icon}`" :style="`font-size:12px;color:${vm.hdrPriority.iconColor};`"></i></div>
                  <div style="padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">负责人</div>
                  <div style="padding:12px 8px;font:700 11px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">隐私</div>
                </div>
                <template v-for="(t, __i19) in vm.filteredTasks" :key="__i19">
                  <div :style="`display:grid;grid-template-columns:36px 1fr 112px 100px 76px 88px 60px;gap:0;padding:0 22px;border-bottom:1px solid var(--line);align-items:center;background:${t.rowBg};`" data-hv="0">
                    <div style="padding:13px 0;display:flex;align-items:center;"><span @click="t.toggleSel" :style="t.selBoxStyle"><i class="ph ph-check" :style="`font-size:11px;color:#fff;${t.selCheck}`"></i></span></div>
                    <div @click="t.open" style="padding:13px 8px;min-width:0;cursor:pointer;"><div :style="`font:600 13.5px/1.4 var(--font);color:${t.titleColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.titleDeco}`">{{ t.title }}</div><div style="font:500 11px/1 var(--font);color:var(--text3);margin-top:3px;">{{ t.statusLabel }}</div></div>
                    <div @click="t.open" style="padding:13px 8px;cursor:pointer;"><span style="display:inline-flex;align-items:center;gap:5px;font:500 12px/1 var(--font);color:var(--text2);"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:.55;"></span>{{ t.project }}</span></div>
                    <div @click="t.open" :style="`padding:13px 8px;font:500 12.5px/1 var(--font);color:${t.dueColor};cursor:pointer;`">{{ t.due }}</div>
                    <div @click="t.open" style="padding:13px 8px;cursor:pointer;"><span :style="t.prioStyle">{{ t.prio }}</span></div>
                    <div @click="t.open" style="padding:13px 8px;cursor:pointer;min-width:0;"><span style="display:inline-flex;align-items:center;gap:6px;font:500 12px/1 var(--font);color:var(--text2);min-width:0;"><span :style="`width:20px;height:20px;border-radius:50%;background:${t.assigneeColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);flex:0 0 auto;`">{{ t.assigneeInitial }}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ t.assignee }}</span></span></div>
                    <div @click="t.open" style="padding:13px 8px;cursor:pointer;"><span style="display:inline-flex;align-items:center;gap:5px;font:500 11.5px/1 var(--font);color:var(--text3);"><span :style="`width:7px;height:7px;border-radius:2px;background:${t.scopeColor};`"></span>{{ t.scopeLabel }}</span></div>
                  </div>
                </template>
                <template v-if="vm.tableEmpty"><div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text3);padding:70px 20px;"><i class="ph ph-stack" style="font-size:30px;"></i><div style="font:500 13px/1 var(--font);">{{ vm.taskTotal===0 ? '还没有任务 — 去聊天框丢一句「明天下午前完成XX」' : '没有匹配当前筛选的任务' }}</div></div></template>
                <div style="height:40px;"></div>
              </div>
            </template>
            <template v-if="vm.isBoardView">
              <div style="flex:1;overflow:auto;padding:18px;display:flex;gap:16px;align-items:stretch;">
                <template v-for="(col, __i20) in vm.boardCols" :key="__i20">
                  <div @drop="col.onDrop" @dragover="col.onOver" style="flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;">
                    <div style="display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--line);"><span :style="`width:8px;height:8px;border-radius:50%;background:${col.color};`"></span><span style="font:600 13px/1 var(--font);color:var(--text);">{{ col.name }}</span><span style="font:600 11px/1 var(--font);color:var(--text3);">{{ col.count }}</span></div>
                    <div style="flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:9px;min-height:120px;">
                      <template v-for="(c, __i21) in col.cards" :key="__i21">
                        <div draggable="true" @dragstart="c.onDragStart" @click="c.open" style="background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:11px 12px;cursor:grab;box-shadow:var(--shadow);" data-hv="2">
                          <div :style="`font:600 13px/1.4 var(--font);color:${c.titleColor};${c.titleDeco}`">{{ c.title }}</div>
                          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:9px;"><span :style="c.prioStyle">{{ c.prio }}</span><span style="display:inline-flex;align-items:center;gap:4px;font:500 11px/1 var(--font);color:var(--text2);"><i class="ph ph-folder" style="font-size:11px;"></i>{{ c.project }}</span><span :style="`font:500 11px/1 var(--font);color:${c.dueColor};`">{{ c.due }}</span><span :title="c.assignee" :style="`width:20px;height:20px;border-radius:50%;background:${c.assigneeColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);margin-left:auto;flex:0 0 auto;`">{{ c.assigneeInitial }}</span></div>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </template>
          <template v-if="vm.isClarify">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-lightbulb" style="font-size:19px;color:var(--accent-ink);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">待澄清区</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">补充后转为正式任务</span>
              <div style="flex:1"></div>
              <span :style="vm.modeChipStyle"><i :class="`ph ${vm.modeIcon}`" style="font-size:13px;"></i>{{ vm.modeLabel }}</span>
            </div>
            <div style="flex:1;overflow:auto;padding:30px 24px;">
              <template v-if="vm.hasIdea">
                <div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:18px;animation:lx-pop .3s ease;">
                  <div style="font:600 22px/1.4 var(--display);color:var(--text);">{{ vm.ciTitle }}</div>
                  <div style="background:var(--idea-bg);border-left:3px solid var(--idea);border-radius:12px;padding:14px 16px;"><div style="font:700 11px/1 var(--font);letter-spacing:.05em;color:var(--idea);display:flex;align-items:center;gap:6px;text-transform:uppercase;"><i class="ph ph-arrow-bend-down-right"></i>建议下一步</div><div style="font:500 14px/1.6 var(--font);color:var(--text);margin-top:8px;">{{ vm.ciSuggest }}</div></div>
                  <div style="background:var(--mid);border-radius:12px;padding:13px 15px;"><div style="font:600 11px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-quotes"></i>原始输入</div><div style="font:500 13.5px/1.55 var(--font);color:var(--text);margin-top:6px;">{{ vm.ciRaw }}</div></div>
                  <div style="display:flex;align-items:flex-start;gap:8px;font:500 12.5px/1.55 var(--font);color:var(--text2);"><i class="ph ph-sparkle" style="color:var(--accent-ink);margin-top:1px;"></i><span>AI 判断为 <b style="color:var(--idea);">待澄清</b> · {{ vm.ciReason }}</span></div>
                  <div style="display:flex;align-items:center;gap:10px;margin-top:2px;"><button @click="vm.convertIdea" style="height:38px;padding:0 16px;border:0;border-radius:11px;background:var(--accent);color:#fff;font:600 13px/1 var(--font);cursor:pointer;box-shadow:var(--shadow);display:flex;align-items:center;gap:7px;"><i class="ph ph-arrow-up-right"></i>转为正式任务</button><button @click="vm.discardIdea" style="height:38px;padding:0 16px;border:1px solid var(--line2);border-radius:11px;background:var(--panel);color:var(--text2);font:600 13px/1 var(--font);cursor:pointer;">放弃</button><div style="flex:1"></div><span style="font:500 11.5px/1 var(--font);color:var(--text3);">生成于 {{ vm.ciGen }}</span></div>
                </div>
              </template>
              <template v-if="vm.noIdea"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text3);padding-top:90px;"><i class="ph ph-lightbulb" style="font-size:30px;"></i><div style="font:500 13px/1 var(--font);">待澄清区为空</div></div></template>
            </div>
          </template>
          <template v-if="vm.isNonTodo">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-tray" style="font-size:19px;color:var(--nono);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">非 todo 隔离区</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">不参与任务与计划</span>
              <div style="flex:1"></div>
              <span :style="vm.modeChipStyle"><i :class="`ph ${vm.modeIcon}`" style="font-size:13px;"></i>{{ vm.modeLabel }}</span>
            </div>
            <div style="flex:1;overflow:auto;padding:30px 24px;">
              <template v-if="vm.hasNon">
                <div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:18px;animation:lx-pop .3s ease;">
                  <div style="font:600 22px/1.4 var(--display);color:var(--text2);">{{ vm.cnTitle }}</div>
                  <div style="background:var(--nono-bg);border:1px dashed var(--line2);border-radius:12px;padding:14px 16px;"><div style="font:500 14px/1.6 var(--font);color:var(--text2);">{{ vm.cnText }}</div><div style="margin-top:9px;display:flex;align-items:center;gap:6px;font:500 11.5px/1 var(--font);color:var(--text3);"><i class="ph ph-tray"></i>未进入 todo 主系统 · 已隔离保存</div></div>
                  <div style="background:var(--mid);border-radius:12px;padding:13px 15px;"><div style="font:600 11px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-quotes"></i>原始输入</div><div style="font:500 13.5px/1.55 var(--font);color:var(--text);margin-top:6px;">{{ vm.cnRaw }}</div></div>
                  <div style="display:flex;align-items:flex-start;gap:8px;font:500 12.5px/1.55 var(--font);color:var(--text2);"><i class="ph ph-sparkle" style="color:var(--accent-ink);margin-top:1px;"></i><span>AI 判断为 <b style="color:var(--nono);">非 todo</b> · {{ vm.cnReason }} · {{ vm.cnDest }}</span></div>
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:2px;"><button @click="vm.nonConvert" style="height:36px;padding:0 14px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:600 12.5px/1 var(--font);cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-arrow-up-right"></i>转为 todo</button><button @click="vm.nonCopy" style="height:36px;padding:0 13px;border:1px solid var(--line2);border-radius:10px;background:var(--panel);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;">复制</button><button @click="vm.nonExport" style="height:36px;padding:0 13px;border:1px solid var(--line2);border-radius:10px;background:var(--panel);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;">导出 Markdown</button><button @click="vm.nonArchive" style="height:36px;padding:0 13px;border:1px solid var(--line2);border-radius:10px;background:var(--panel);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;">归档</button><button @click="vm.nonDelete" style="height:36px;padding:0 13px;border:0;border-radius:10px;background:var(--danger-bg);color:var(--danger);font:600 12.5px/1 var(--font);cursor:pointer;">删除</button></div>
                </div>
              </template>
              <template v-if="vm.noNon"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text3);padding-top:90px;"><i class="ph ph-tray" style="font-size:30px;"></i><div style="font:500 13px/1 var(--font);">隔离区为空</div></div></template>
            </div>
          </template>
          <template v-if="vm.isAgent">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-sparkle" style="font-size:19px;color:var(--accent-ink);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">Agent 配置</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">{{ vm.agName }}</span>
            </div>
            <div style="flex:1;overflow:auto;padding:30px 24px;">
              <div style="max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
                <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);">
                  <div style="font:600 15px/1.3 var(--display);color:var(--text);">{{ vm.agName }}</div>
                  <div style="font:500 12.5px/1.5 var(--font);color:var(--text3);margin-top:4px;">{{ vm.agDesc }}</div>
                  <textarea :value="vm.agValue" @change="vm.onAgent" style="margin-top:14px;width:100%;min-height:150px;border:1px solid var(--line2);border-radius:11px;background:var(--bg);padding:13px 15px;font:500 14px/1.65 var(--font);color:var(--text);resize:vertical;"></textarea>
                </div>
                <div style="display:flex;align-items:center;gap:12px;"><button @click="vm.saveAgent" style="height:40px;padding:0 18px;border:0;border-radius:11px;background:var(--accent);color:#fff;font:600 13px/1 var(--font);cursor:pointer;box-shadow:var(--shadow);display:flex;align-items:center;gap:7px;"><i class="ph ph-check"></i>保存</button><span style="font:500 12px/1.5 var(--font);color:var(--text3);">修改后由 AI 在后续判断与追问中使用</span></div>
              </div>
            </div>
          </template>
          <template v-if="vm.isSettings">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-gear" style="font-size:19px;color:var(--accent-ink);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">设置</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">{{ vm.setName }}</span>
            </div>
            <div style="flex:1;overflow:auto;padding:30px 24px;">
              <div style="max-width:600px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
                <template v-if="vm.isSetAccount">
                  <div style="display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);">
                    <span style="width:52px;height:52px;border-radius:16px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font:600 24px/1 var(--display);flex:0 0 auto;">{{ vm.meBig }}</span>
                    <div style="flex:1;min-width:0;"><div style="font:600 16px/1.3 var(--display);color:var(--text);">{{ vm.sName }}</div><div style="font:500 12.5px/1 var(--font);color:var(--text3);margin-top:4px;">{{ vm.sEmail }}</div></div>
                    <span style="padding:5px 11px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 11.5px/1 var(--font);">{{ vm.roleLabel }}</span>
                  </div>
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px 18px;box-shadow:var(--shadow);">
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">显示名称</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">用于任务负责人、评论与协作显示</div></div><input :value="vm.sName" @change="vm.onName" style="width:150px;border:1px solid var(--line2);border-radius:9px;padding:8px 11px;background:var(--bg);color:var(--text);font:500 13px/1 var(--font);"/></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">邮箱</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">登录账号，不可修改</div></div><span style="font:500 13.5px/1 var(--font);color:var(--text2);">{{ vm.sEmail }}</span></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">角色</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">首个注册账号为管理员，决定后台访问权限</div></div><span style="padding:5px 12px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 12px/1 var(--font);">{{ vm.roleLabel }}</span></div>
                    <div style="display:flex;flex-direction:column;gap:0;padding:15px 0;">
                      <div style="display:flex;align-items:center;gap:14px;"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">密码</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">验证当前密码后设置新密码</div></div><button @click="vm.changePwd" style="height:34px;padding:0 14px;border:1px solid var(--line2);border-radius:9px;background:var(--bg);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;">{{ vm.pwdOpen ? '收起' : '修改密码' }}</button></div>
                      <template v-if="vm.pwdOpen">
                        <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;background:var(--mid);border-radius:11px;padding:14px;">
                          <input :value="vm.pwdOld" @input="vm.onPwdOld" type="password" placeholder="当前密码" style="border:1px solid var(--line2);border-radius:9px;padding:10px 12px;background:var(--bg);color:var(--text);font:500 13px/1 var(--font);"/>
                          <input :value="vm.pwdNew" @input="vm.onPwdNew" type="password" placeholder="新密码（至少 6 位）" style="border:1px solid var(--line2);border-radius:9px;padding:10px 12px;background:var(--bg);color:var(--text);font:500 13px/1 var(--font);"/>
                          <button @click="vm.submitPwd" :disabled="vm.pwdBusy" style="align-self:flex-start;height:34px;padding:0 16px;border:0;border-radius:9px;background:var(--accent);color:#fff;font:600 12.5px/1 var(--font);cursor:pointer;">{{ vm.pwdBusy ? '提交中…' : '确认修改' }}</button>
                        </div>
                      </template>
                    </div>
                  </div>
                  <button @click="vm.logout" style="align-self:flex-start;height:38px;padding:0 16px;border:1px solid var(--danger);border-radius:11px;background:var(--danger-bg);color:var(--danger);font:600 12.5px/1 var(--font);cursor:pointer;display:flex;align-items:center;gap:7px;"><i class="ph ph-sign-out"></i>退出登录</button>
                </template>
                <template v-if="vm.isSetGeneral">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px 18px;box-shadow:var(--shadow);">
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">外观主题</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">明亮 / 深色，保存到账号，下次登录生效</div></div><div style="display:inline-flex;background:var(--mid);border-radius:8px;padding:3px;gap:2px;"><button @click="vm.setThemeLight" :style="vm.themeLightStyle">明亮</button><button @click="vm.setThemeDark" :style="vm.themeDarkStyle">深色</button></div></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">默认工作区</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">下次登录时进入的空间</div></div><div style="display:inline-flex;background:var(--mid);border-radius:8px;padding:3px;gap:2px;"><button @click="vm.setDefWork" :style="vm.sDefaultWork">工作</button><button @click="vm.setDefPersonal" :style="vm.sDefaultPersonal">个人</button></div></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">默认视图</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">下次登录首屏进入的页面</div></div><select :value="vm.sDefaultView" @change="vm.onDefaultView" style="border:1px solid var(--line2);border-radius:9px;padding:8px 10px;background:var(--bg);color:var(--text);font:600 12.5px/1 var(--font);cursor:pointer;"><template v-for="(o, __i23) in vm.viewOptions" :key="__i23"><option :value="o.value">{{ o.label }}</option></template></select></div>
                  </div>
                  <div style="background:var(--mid);border-radius:12px;padding:12px 15px;font:500 12px/1.6 var(--font);color:var(--text3);">以上设置即时保存到你的账号。</div>
                </template>
                <template v-if="vm.isSetAi && !vm.canAdmin">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);display:flex;align-items:center;gap:12px;">
                    <span style="width:40px;height:40px;border-radius:11px;background:var(--accent-bg);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:20px;flex:0 0 auto;"><i class="ph ph-lock-simple"></i></span>
                    <div style="flex:1;min-width:0;"><div style="font:600 14px/1.3 var(--font);color:var(--text);">AI 接入由管理员统一配置</div><div style="font:500 12px/1.5 var(--font);color:var(--text3);margin-top:3px;">当前模型：{{ vm.aiIsRule ? '规则版（离线）' : (vm.aiModel || vm.aiPreset) }} · 全团队共享，成员无需配置即可使用</div></div>
                  </div>
                </template>
                <template v-if="vm.isSetAi && vm.canAdmin">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:14px;">
                    <label style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">服务商预设</span><select :value="vm.aiPreset" @change="vm.onAiPreset" style="border:1px solid var(--line2);border-radius:10px;padding:10px 12px;background:var(--bg);color:var(--text);font:500 13.5px/1 var(--font);cursor:pointer;"><template v-for="(o, __ip) in vm.aiPresetOptions" :key="__ip"><option :value="o.value">{{ o.label }}</option></template></select><span v-if="vm.aiPresetHint" style="font:500 11.5px/1.4 var(--font);color:var(--text3);">{{ vm.aiPresetHint }}</span></label>
                    <template v-if="!vm.aiIsRule">
                      <label style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">Base URL</span><input :value="vm.aiBaseUrl" @input="vm.onAiBaseUrl" placeholder="https://api.deepseek.com/v1（Claude 可留空用官方）" style="border:1px solid var(--line2);border-radius:10px;padding:10px 12px;background:var(--bg);color:var(--text);font:500 13px/1 var(--font);"/></label>
                      <label style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">模型</span><input :value="vm.aiModel" @input="vm.onAiModel" placeholder="如 deepseek-chat / qwen-plus / claude-sonnet-5" style="border:1px solid var(--line2);border-radius:10px;padding:10px 12px;background:var(--bg);color:var(--text);font:500 13px/1 var(--font);"/></label>
                      <label style="display:flex;flex-direction:column;gap:6px;"><span style="font:600 12px/1 var(--font);color:var(--text2);">API Key <span v-if="vm.aiHasKey" style="color:var(--text3);font-weight:500;">· 已配置（留空则不修改）</span></span><input :value="vm.sApiKey" @input="vm.onApiKey" type="password" :placeholder="vm.aiHasKey?'••••••（已配置）':'sk-...'" style="border:1px solid var(--line2);border-radius:10px;padding:10px 12px;background:var(--bg);color:var(--text);font:500 13px/1 'Hanken Grotesk',monospace;"/></label>
                      <div style="display:flex;align-items:center;gap:14px;padding-top:2px;"><div style="flex:1;"><div style="font:600 13px/1.3 var(--font);color:var(--text);">失败兜底</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">模型调用失败时自动回退规则版，不丢输入</div></div><span @click="vm.toggleAiFallback" :style="vm.aiFallbackTrack"><span :style="vm.aiFallbackKnob"></span></span></div>
                    </template>
                    <div v-else style="background:var(--mid);border-radius:12px;padding:12px 15px;font:500 12px/1.6 var(--font);color:var(--text3);">规则版为离线关键词分类，无需 API Key。切换到其他服务商即可接入真实模型（支持任意 OpenAI 兼容服务）。</div>
                  </div>
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow);display:flex;align-items:center;gap:14px;"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">连接状态</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">用一条样例验证服务商 / 模型 / Key</div></div><template v-if="vm.aiTested"><span style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 11.5px/1 var(--font);"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></span>可用</span></template><button @click="vm.testConn" style="height:34px;padding:0 14px;border:1px solid var(--line2);border-radius:9px;background:var(--bg);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;">测试连接</button></div>
                  <div style="display:flex;align-items:center;gap:12px;"><button @click="vm.saveSettings" style="height:40px;padding:0 18px;border:0;border-radius:11px;background:var(--accent);color:#fff;font:600 13px/1 var(--font);cursor:pointer;box-shadow:var(--shadow);">保存配置</button><span style="font:500 12px/1.5 var(--font);color:var(--text3);">仅保存在你的账号下 · Key 不回显</span></div>
                </template>
                <template v-if="vm.isSetNotif">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px 18px;box-shadow:var(--shadow);">
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">任务指派</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">有人把任务指派给你</div></div><span @click="vm.toggleNpAssign" :style="vm.npAssignTrack"><span :style="vm.npAssignKnob"></span></span></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">到期提醒</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">任务临近截止时间</div></div><span @click="vm.toggleNpDue" :style="vm.npDueTrack"><span :style="vm.npDueKnob"></span></span></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">AI 失败告警</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">AI 生成失败需要排查</div></div><span @click="vm.toggleNpFail" :style="vm.npFailTrack"><span :style="vm.npFailKnob"></span></span></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">完成动态</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">团队成员完成任务</div></div><span @click="vm.toggleNpDone" :style="vm.npDoneTrack"><span :style="vm.npDoneKnob"></span></span></div>
                  </div>
                  <div style="background:var(--mid);border-radius:12px;padding:12px 15px;font:500 12px/1.6 var(--font);color:var(--text3);">关闭后，对应类型的通知不再出现在左侧通知中心。</div>
                </template>
                <template v-if="vm.isSetPrivacy">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px 18px;box-shadow:var(--shadow);">
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">AI 可见范围</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">AI 制定计划时可读取的数据</div></div><div style="display:inline-flex;background:var(--mid);border-radius:8px;padding:3px;gap:2px;"><button @click="vm.setVisScope" :style="vm.sVisScope">仅可见范围</button><button @click="vm.setVisAll" :style="vm.sVisAll">全部 todo</button></div></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">默认开启隐私模式</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">登录后自动隐藏跨空间数据</div></div><span @click="vm.togglePm" :style="vm.pmTrack"><span :style="vm.pmKnob"></span></span></div>
                  </div>
                  <div style="background:var(--mid);border-radius:12px;padding:13px 15px;font:500 12.5px/1.6 var(--font);color:var(--text2);">隐私模式开启时，AI 只读取当前工作区（工作 / 个人）可见内容，非 todo 内容默认不参与计划。</div>
                </template>
                <template v-if="vm.isSetData">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px 18px;box-shadow:var(--shadow);">
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--text);">导出全部数据</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">任务、待澄清、非 todo 与生成记录 (JSON)</div></div><button @click="vm.exportData" style="height:34px;padding:0 14px;border:1px solid var(--line2);border-radius:9px;background:var(--bg);color:var(--text2);font:600 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="ph ph-download-simple"></i>导出</button></div>
                    <div style="display:flex;align-items:center;gap:14px;padding:15px 0;"><div style="flex:1;"><div style="font:600 13.5px/1.3 var(--font);color:var(--danger);">清空测试数据</div><div style="font:500 12px/1.45 var(--font);color:var(--text3);margin-top:3px;">删除当前账号下的全部测试数据，不可恢复</div></div><button @click="vm.clearData" style="height:34px;padding:0 14px;border:1px solid var(--danger);border-radius:9px;background:var(--danger-bg);color:var(--danger);font:600 12.5px/1 var(--font);cursor:pointer;">清空</button></div>
                  </div>
                </template>
              </div>
            </div>
          </template>
          <template v-if="vm.showAdminContent">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <i class="ph ph-chart-bar" style="font-size:19px;color:var(--accent-ink);"></i>
              <span style="font:600 16px/1 var(--display);color:var(--text);">内部后台</span>
              <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;background:var(--mid);font:600 11px/1 var(--font);color:var(--text2);"><i class="ph ph-eye"></i>只读</span>
              <div style="flex:1"></div>
            </div>
            <div style="flex:1;overflow:auto;padding:26px 24px;">
              <template v-if="!vm.hasAdminUser">
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text3);padding-top:90px;"><i class="ph ph-chart-bar" style="font-size:30px;"></i><div style="font:500 13px/1 var(--font);">{{ vm.adminLoading ? '加载中…' : '暂无用户数据' }}</div></div>
              </template>
              <div v-if="vm.hasAdminUser" style="max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:18px;">
                <div style="display:flex;align-items:center;gap:14px;"><span style="width:46px;height:46px;border-radius:13px;background:#D9CFC0;color:#5b5348;display:flex;align-items:center;justify-content:center;font:600 18px/1 var(--display);">{{ vm.auName.slice(-1) }}</span><div style="flex:1;"><div style="font:600 17px/1.2 var(--display);color:var(--text);">{{ vm.auName }} <span style="font:600 11px/1 var(--font);color:var(--accent-ink);background:var(--accent-bg);border-radius:20px;padding:3px 8px;margin-left:6px;">{{ vm.auRole }}</span></div><div style="font:500 12.5px/1.3 var(--font);color:var(--text3);margin-top:2px;">{{ vm.auEmail }}</div></div><span style="padding:5px 11px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 11.5px/1 var(--font);">{{ vm.auStatus }}</span></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;box-shadow:var(--shadow);"><div style="font:600 26px/1 var(--display);color:var(--accent-ink);">{{ vm.auTasks }}</div><div style="font:500 12px/1 var(--font);color:var(--text3);margin-top:6px;">正式任务</div></div>
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;box-shadow:var(--shadow);"><div style="font:600 26px/1 var(--display);color:var(--idea);">{{ vm.auIdeas }}</div><div style="font:500 12px/1 var(--font);color:var(--text3);margin-top:6px;">待澄清</div></div>
                  <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;box-shadow:var(--shadow);"><div style="font:600 26px/1 var(--display);color:var(--nono);">{{ vm.auNon }}</div><div style="font:500 12px/1 var(--font);color:var(--text3);margin-top:6px;">非 todo</div></div>
                </div>
                <template v-if="vm.hasErrors"><div style="display:flex;align-items:center;gap:9px;background:var(--danger-bg);border-radius:11px;padding:12px 14px;font:600 12.5px/1.4 var(--font);color:var(--danger);"><i class="ph ph-warning-circle" style="font-size:16px;"></i>当前有 {{ vm.errorCount }} 条 AI 生成失败待排查</div></template>
                <div style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin-top:2px;">原始输入 → AI 判断 → 生成结果</div>
                <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);">
                  <div style="display:grid;grid-template-columns:1fr 84px 1fr 74px;gap:0;background:var(--mid);border-bottom:1px solid var(--line);"><div style="padding:10px 14px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">原始输入</div><div style="padding:10px 8px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">判断</div><div style="padding:10px 8px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">生成结果</div><div style="padding:10px 8px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">时间</div></div>
                  <template v-for="(r, __i26) in vm.adminLog" :key="__i26"><div style="display:grid;grid-template-columns:1fr 84px 1fr 74px;gap:0;border-bottom:1px solid var(--line);align-items:center;"><div style="padding:11px 14px;font:500 12.5px/1.4 var(--font);color:var(--text2);">{{ r.raw }}</div><div style="padding:11px 8px;"><span :style="`display:inline-flex;align-items:center;gap:4px;font:600 11px/1 var(--font);color:${r.kc};`"><span :style="`width:6px;height:6px;border-radius:50%;background:${r.kc};`"></span>{{ r.kind }}</span></div><div style="padding:11px 8px;font:500 12.5px/1.4 var(--font);color:var(--text);">{{ r.result }}</div><div style="padding:11px 8px;font:500 11px/1.3 var(--font);color:var(--text3);">{{ r.gen }}</div></div></template>
                  <template v-if="!vm.hasAdminLog"><div style="padding:16px 14px;font:500 12.5px/1.4 var(--font);color:var(--text3);">该用户还没有生成记录</div></template>
                </div>
                <div style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin-top:2px;">AI 失败与异常</div>
                <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);">
                  <div style="display:grid;grid-template-columns:64px 1fr 118px 96px;gap:0;background:var(--mid);border-bottom:1px solid var(--line);"><div style="padding:10px 14px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">用户</div><div style="padding:10px 8px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">原始输入</div><div style="padding:10px 8px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">错误类型</div><div style="padding:10px 8px;font:700 10.5px/1 var(--font);letter-spacing:.05em;color:var(--text3);text-transform:uppercase;">状态</div></div>
                  <template v-for="(e, __i27) in vm.adminErrors" :key="__i27"><div style="display:grid;grid-template-columns:64px 1fr 118px 96px;gap:0;border-bottom:1px solid var(--line);align-items:center;"><div style="padding:11px 14px;font:600 12px/1.3 var(--font);color:var(--text);">{{ e.user }}</div><div style="padding:11px 8px;font:500 12.5px/1.4 var(--font);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ e.raw }}</div><div style="padding:11px 8px;font:500 11.5px/1.3 var(--font);color:var(--text2);">{{ e.errType }}</div><div style="padding:11px 8px;"><span :style="`display:inline-flex;padding:3px 8px;border-radius:20px;font:600 10.5px/1.4 var(--font);color:${e.stColor};background:${e.stBg};`">{{ e.status }}</span></div></div></template>
                  <template v-if="!vm.hasAdminErrors"><div style="padding:16px 14px;font:500 12.5px/1.4 var(--font);color:var(--text3);">没有 AI 失败记录，运行正常</div></template>
                </div>
                <div style="font:500 12px/1.6 var(--font);color:var(--text3);">后台只读，用于团队观察测试数据、排查 AI 判断问题，不可编辑用户数据。</div>
              </div>
            </div>
          </template>
          <template v-if="vm.isProjects">
            <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px;padding:0 18px;background:var(--panel);">
              <span :style="`width:12px;height:12px;border-radius:4px;background:${vm.spColor};flex:0 0 auto;`"></span>
              <span style="font:600 16px/1 var(--display);color:var(--text);">{{ vm.spName }}</span>
              <span style="font:500 12.5px/1 var(--font);color:var(--text3);">{{ vm.spDone }}/{{ vm.spCount }} 完成</span>
              <div style="flex:1"></div>
              <span :style="vm.modeChipStyle"><i :class="`ph ${vm.modeIcon}`" style="font-size:13px;"></i>{{ vm.modeLabel }}</span>
            </div>
            <div style="flex:1;overflow:auto;padding:22px;">
              <div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:18px;">
                <div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);"><div style="font:500 13.5px/1.6 var(--font);color:var(--text2);">{{ vm.spDesc }}</div><div style="margin-top:14px;display:flex;align-items:center;gap:12px;"><div style="flex:1;height:8px;border-radius:4px;background:var(--mid);overflow:hidden;"><div :style="`height:100%;width:${vm.spPct}%;background:${vm.spColor};border-radius:4px;`"></div></div><span style="font:600 13px/1 var(--font);color:var(--text);">{{ vm.spPct }}%</span></div></div>
                <div style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;">项目任务 · {{ vm.spCount }}</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <template v-for="(t, __i28) in vm.spTasks" :key="__i28"><div @click="t.open" style="display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:12px 14px;cursor:pointer;box-shadow:var(--shadow);" data-hv="2"><span :style="`width:8px;height:8px;border-radius:50%;background:${t.assigneeColor};flex:0 0 auto;`"></span><div style="flex:1;min-width:0;"><div :style="`font:600 13.5px/1.4 var(--font);color:${t.titleColor};${t.titleDeco}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`">{{ t.title }}</div><div style="font:500 11px/1 var(--font);color:var(--text3);margin-top:3px;">{{ t.statusLabel }} · {{ t.due }}</div></div><span :style="t.prioStyle">{{ t.prio }}</span><span :style="`width:24px;height:24px;border-radius:50%;background:${t.assigneeColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11px/1 var(--font);flex:0 0 auto;`">{{ t.assigneeInitial }}</span></div></template>
                </div>
              </div>
            </div>
          </template>
          <template v-if="vm.showAdminDenied">
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px;text-align:center;">
              <div style="width:56px;height:56px;border-radius:16px;background:var(--danger-bg);color:var(--danger);display:flex;align-items:center;justify-content:center;font-size:26px;"><i class="ph ph-lock-key"></i></div>
              <div style="font:600 18px/1.3 var(--display);color:var(--text);">需要管理员权限</div>
              <div style="max-width:360px;font:500 13px/1.6 var(--font);color:var(--text3);">内部后台仅对「管理员」角色开放。你当前是「{{ vm.roleLabel }}」。首个注册的账号自动成为管理员。</div>
            </div>
          </template>
          <template v-if="vm.isStub">
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text3);">
              <i :class="`ph ${vm.stubIcon}`" style="font-size:32px;"></i>
              <div style="font:600 16px/1 var(--display);color:var(--text2);">{{ vm.stubName }}</div>
              <div style="font:500 12.5px/1 var(--font);">即将展开</div>
            </div>
          </template>
          <template v-if="vm.detailOpen">
            <div @click="vm.closeDetail" style="position:absolute;inset:0;background:#2b241a30;z-index:8;"></div>
            <div style="position:absolute;top:0;right:0;bottom:0;width:440px;max-width:92%;background:var(--panel);border-left:1px solid var(--line);box-shadow:-16px 0 50px #2b241a1f;z-index:9;display:flex;flex-direction:column;animation:lx-slide .28s ease;">
              <div style="height:57px;flex:0 0 57px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:0 16px;">
                <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;background:var(--accent-bg);color:var(--accent-ink);font:600 11.5px/1 var(--font);"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></span>任务</span>
                <div style="flex:1"></div>
                <button @click="vm.closeDetail" style="width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--text2);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;" data-hv="0"><i class="ph ph-x"></i></button>
              </div>
              <div style="flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:20px;">
                <input :value="vm.dTitle" @change="vm.onTitle" style="border:0;background:transparent;font:600 20px/1.35 var(--display);color:var(--text);width:100%;"/>
                <div style="display:inline-flex;background:var(--mid);border-radius:9px;padding:3px;gap:2px;align-self:flex-start;">
                  <button @click="vm.tabDetail" :style="vm.dTabDetailStyle">详情</button>
                  <button @click="vm.tabComments" :style="vm.dTabCommentStyle">评论</button>
                  <button @click="vm.tabActivity" :style="vm.dTabActStyle">活动</button>
                </div>
                <template v-if="vm.isDetailTab">
                <div style="display:flex;flex-direction:column;gap:20px;">
                <div style="display:flex;flex-direction:column;gap:14px;">
                  <div style="display:flex;align-items:center;gap:12px;"><span style="width:76px;flex:0 0 76px;font:600 12px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-circle-dashed"></i>状态</span><div style="display:inline-flex;background:var(--mid);border-radius:8px;padding:3px;gap:2px;"><button @click="vm.setTodo" :style="vm.stTodoStyle">待办</button><button @click="vm.setProg" :style="vm.stProgStyle">进行中</button><button @click="vm.setDone" :style="vm.stDoneStyle">已完成</button></div></div>
                  <div style="display:flex;align-items:center;gap:12px;"><span style="width:76px;flex:0 0 76px;font:600 12px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-folder"></i>项目</span><span style="font:500 13.5px/1 var(--font);color:var(--text);">{{ vm.dProject }}</span></div>
                  <div style="display:flex;align-items:center;gap:12px;"><span style="width:76px;flex:0 0 76px;font:600 12px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-calendar-blank"></i>截止</span><span style="font:500 13.5px/1 var(--font);color:var(--text);">{{ vm.dDue }}</span></div>
                  <div style="display:flex;align-items:center;gap:12px;"><span style="width:76px;flex:0 0 76px;font:600 12px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-flag"></i>优先级</span><div style="display:inline-flex;background:var(--mid);border-radius:8px;padding:3px;gap:2px;"><button @click="vm.setP1" :style="vm.p1Style">P1</button><button @click="vm.setP2" :style="vm.p2Style">P2</button><button @click="vm.setP3" :style="vm.p3Style">P3</button><button @click="vm.setP4" :style="vm.p4Style">P4</button></div></div>
                  <div style="display:flex;align-items:center;gap:12px;"><span style="width:76px;flex:0 0 76px;font:600 12px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-user"></i>负责人</span><div style="display:flex;flex-wrap:wrap;gap:7px;"><template v-for="(m, __i29) in vm.detailMembers" :key="__i29"><button @click="m.assign" :style="m.style"><span :style="`width:19px;height:19px;border-radius:50%;background:${m.color};color:#fff;display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font);flex:0 0 auto;`">{{ m.initial }}</span>{{ m.name }}</button></template></div></div>
                  <div style="display:flex;align-items:flex-start;gap:12px;"><span style="width:76px;flex:0 0 76px;font:600 12px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;padding-top:8px;"><i class="ph ph-note"></i>备注</span><textarea :value="vm.dNotes" @change="vm.onNotes" placeholder="补充说明…" style="flex:1;border:1px solid var(--line2);border-radius:10px;background:var(--bg);padding:9px 11px;font:500 13px/1.55 var(--font);color:var(--text);resize:none;height:64px;"></textarea></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;">
                  <div style="display:flex;align-items:center;gap:8px;"><span style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;">子任务</span><span style="font:600 11px/1 var(--font);color:var(--text3);">{{ vm.subDone }}/{{ vm.subCount }}</span></div>
                  <template v-for="(sb, __i30) in vm.subs" :key="__i30"><div style="display:flex;align-items:center;gap:9px;"><span @click="sb.toggle" :style="sb.boxStyle"><i class="ph ph-check" :style="`font-size:10px;color:#fff;${sb.check}`"></i></span><span :style="sb.textStyle">{{ sb.text }}</span></div></template>
                  <template v-if="vm.canEdit"><div style="display:flex;align-items:center;gap:8px;background:var(--mid);border-radius:9px;padding:8px 11px;"><i class="ph ph-plus" style="color:var(--text3);font-size:14px;"></i><input id="lx-sub" @keydown="vm.subKey" placeholder="添加子任务，回车确认" style="border:0;background:transparent;flex:1;min-width:0;color:var(--text);font:500 12.5px/1 var(--font);"/></div></template>
                </div>
                <div style="height:1px;background:var(--line);"></div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                  <div style="font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--text3);text-transform:uppercase;">来源与 AI 生成记录</div>
                  <div style="background:var(--mid);border-radius:12px;padding:13px 14px;display:flex;flex-direction:column;gap:5px;">
                    <div style="font:600 11px/1 var(--font);color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ph ph-quotes"></i>原始输入</div>
                    <div style="font:500 13.5px/1.55 var(--font);color:var(--text);">{{ vm.dRaw }}</div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:9px;padding:2px 2px;">
                    <div style="display:flex;align-items:center;gap:8px;font:500 12.5px/1 var(--font);color:var(--text2);"><i class="ph ph-sparkle" style="color:var(--accent-ink);"></i>AI 判断为<b style="color:var(--accent-ink);">任务</b><span style="color:var(--text3);">· 置信度 {{ vm.dConf }}</span></div>
                    <div style="font:500 12.5px/1.55 var(--font);color:var(--text2);padding-left:24px;">{{ vm.dReason }}</div>
                    <div style="display:flex;align-items:center;gap:8px;font:500 11.5px/1 var(--font);color:var(--text3);padding-left:24px;"><i class="ph ph-clock"></i>生成于 {{ vm.dGen }} · {{ vm.dEdited }}</div>
                  </div>
                </div>
                <div style="height:1px;background:var(--line);"></div>
                <template v-if="vm.canEdit"><button @click="vm.moveOut" style="width:100%;height:40px;border:1px solid var(--danger);border-radius:11px;background:var(--danger-bg);color:var(--danger);font:600 13px/1 var(--font);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;"><i class="ph ph-arrow-u-up-left"></i>移出 todo（这不是一个任务）</button></template>
                </div>
                </template>
                <template v-if="vm.isCommentTab">
                  <div style="display:flex;flex-direction:column;gap:15px;">
                    <template v-for="(c, __i31) in vm.comments" :key="__i31"><div style="display:flex;gap:10px;"><span :style="`width:28px;height:28px;flex:0 0 auto;border-radius:50%;background:${c.color};color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px/1 var(--font);`">{{ c.initial }}</span><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;"><span style="font:600 12.5px/1 var(--font);color:var(--text);">{{ c.author }}</span><span style="font:500 11px/1 var(--font);color:var(--text3);">{{ c.time }}</span></div><div style="font:500 13px/1.55 var(--font);color:var(--text2);margin-top:5px;">{{ c.text }}</div></div></div></template>
                    <template v-if="vm.canEdit"><div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line2);border-radius:11px;background:var(--bg);padding:8px 8px 8px 12px;"><input id="lx-cmt" @keydown="vm.cmtKey" placeholder="写评论，回车发送…" style="border:0;background:transparent;flex:1;min-width:0;color:var(--text);font:500 13px/1 var(--font);"/><button @click="vm.addComment" style="border:0;background:var(--accent);color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto;"><i class="ph ph-paper-plane-tilt"></i></button></div></template>
                  </div>
                </template>
                <template v-if="vm.isActivityTab">
                  <div style="display:flex;flex-direction:column;">
                    <template v-for="(a, __i32) in vm.activity" :key="__i32"><div style="display:flex;gap:11px;"><div style="display:flex;flex-direction:column;align-items:center;flex:0 0 auto;"><span style="width:9px;height:9px;border-radius:50%;background:var(--accent);margin-top:4px;"></span><span style="flex:1;width:1.5px;background:var(--line);margin:2px 0;"></span></div><div style="padding-bottom:16px;flex:1;"><div style="font:500 13px/1.5 var(--font);color:var(--text);">{{ a.text }}</div><div style="font:500 11px/1 var(--font);color:var(--text3);margin-top:3px;">{{ a.time }}</div></div></div></template>
                  </div>
                </template>
              </div>
            </div>
          </template>
          <template v-if="vm.toast">
            <div style="position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:20;background:var(--text);color:var(--bg);padding:11px 18px;border-radius:12px;font:600 13px/1 var(--font);box-shadow:0 12px 30px #2b241a33;display:flex;align-items:center;gap:8px;animation:lx-pop .25s ease;"><i class="ph ph-check-circle"></i>{{ vm.toast }}</div>
          </template>
        </main>
      </div>
      <template v-if="vm.isMobile">
        <div :style="vm.bottomNavStyle">
          <template v-for="(n, __i33) in vm.mobileNav" :key="__i33"><button @click="n.go" style="flex:1;border:0;background:transparent;padding:7px 0;display:flex;align-items:center;justify-content:center;cursor:pointer;"><span :style="`width:44px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:21px;color:${n.color};background:${n.bg};`"><i :class="`ph ${n.icon}`"></i></span></button></template>
        </div>
      </template>
    </div>
  </template>
</div>
</template>

<script>
import { reactive, computed, onMounted, onUpdated, onBeforeUnmount, nextTick } from 'vue';
import { api, setToken, getToken } from './lib/api.js';

// ---- backend <-> frontend display helpers ----
function lxPad(n){ return String(n).padStart(2,'0'); }
function lxFmtDue(iso){
  if(!iso) return '待定';
  const d=new Date(iso), t=new Date();
  const sod=(x)=>new Date(x.getFullYear(),x.getMonth(),x.getDate());
  const diff=Math.round((sod(d)-sod(t))/86400000);
  const hm=lxPad(d.getHours())+':'+lxPad(d.getMinutes());
  if(diff===0) return '今天 '+hm;
  if(diff===1) return '明天 '+hm;
  if(diff===-1) return '昨天 '+hm;
  if(diff>1&&diff<=6) return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  return lxPad(d.getMonth()+1)+'/'+lxPad(d.getDate());
}
function lxIsToday(iso){ if(!iso) return false; const d=new Date(iso),t=new Date(); return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate(); }

class Component {
  _seq = 100;
  _pending = null;
  // stable color per author name (no hardcoded member list — accounts are real now)
  _colorPool = ['#5F7D64','#B07A2A','#7C6FB0','#3E68C4','#B0553F'];
  _memberColor(name){ if(!name) return '#9A948B'; let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))|0; return this._colorPool[Math.abs(h)%this._colorPool.length]; }
  // AI 接入预设：选中即预填，全部字段仍可自由编辑；「自定义」适配任何 OpenAI 兼容服务。
  _aiPresets = [
    {name:'规则版（离线）', provider:'rule', baseUrl:'', models:[], hint:'无需 Key，离线规则分类'},
    {name:'OpenAI', provider:'openai', baseUrl:'https://api.openai.com/v1', models:['gpt-4o','gpt-4o-mini','o3'], hint:''},
    {name:'Claude', provider:'anthropic', baseUrl:'', models:['claude-sonnet-5','claude-opus-4-8','claude-haiku-4-5-20251001'], hint:'Base URL 留空使用官方接口'},
    {name:'DeepSeek', provider:'openai', baseUrl:'https://api.deepseek.com/v1', models:['deepseek-chat','deepseek-reasoner'], hint:''},
    {name:'通义千问', provider:'openai', baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1', models:['qwen-max','qwen-plus','qwen-turbo'], hint:''},
    {name:'Kimi', provider:'openai', baseUrl:'https://api.moonshot.cn/v1', models:['moonshot-v1-8k','moonshot-v1-32k'], hint:''},
    {name:'豆包', provider:'openai', baseUrl:'https://ark.cn-beijing.volces.com/api/v3', models:[], hint:'模型填接入点 ID'},
    {name:'Gemini', provider:'openai', baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai', models:['gemini-2.5-pro','gemini-2.5-flash'], hint:'走 OpenAI 兼容层'},
    {name:'自定义', provider:'openai', baseUrl:'', models:[], hint:'任何 OpenAI 兼容服务：自填 Base URL 与模型'},
  ];
  state = {
    authed: false,
    authMode: 'login', authName: '', authEmail: '', authPassword: '', authError: '', authBusy: false,
    view: 'chat',
    theme: 'light',
    workspace: 'work',
    privacy: false,
    dbView: 'all', dbLayout: 'table', dbSearch: '', dbProject: 'all', dbPriority: 'all', dbSortKey: '', dbSortDir: 'asc', dbSelected: [],
    role: 'admin',
    detailTab: 'detail', notifOpen: false, searchOpen: false, searchQuery: '', paletteIndex: 0, shortcutsOpen: false, selProjectId: null,
    recent: [],
    taskSubs: {},
    taskComments: {},
    taskActivity: {},
    notifications: [],
    projects: [],
    aiErrors: [],
    adminUsers: [], adminSelId: null, adminRecords: [], adminUserErrors: [], adminLoading: false,
    feedQuery: '',
    pwdOpen: false, pwdOld: '', pwdNew: '', pwdBusy: false,
    detailId: null,
    thinking: false, thinkText: '',
    toast: null,
    isMobile: false, mobilePane: 'main',
    mentionOpen: false, mentionQuery: '', mentionAt: -1, mentionIndex: 0, pendingRefs: [],
    selIdeaId: null, selNonId: null, agentSection: 'soul', setSection: 'account',
    agent: {soul:'', memory:'', preferences:'', workingStyle:'', privacyRules:'', followup:''},
    settings: {name:'', email:'', apiKey:'', aiTested:false, defaultWs:'work', defaultView:'chat', aiVisibility:'visible_scope_only', privacyDefault:false, notifPrefs:{assign:true,due:true,fail:true,done:true}, aiPreset:'规则版（离线）', aiProvider:'rule', aiBaseUrl:'', aiModel:'', aiHasKey:false, aiFallback:true},
    tasks: [],
    ideas: [],
    nonTodos: [],
    messages: [],
    feed: []
  };
  TOK = {
    light: {'--bg':'#FBF9F4','--panel':'#FFFFFF','--mid':'#F4F1EA','--rail':'#F1ECE3','--elev':'#FFFFFF','--text':'#2C2823','--text2':'#75706A','--text3':'#ABA49B','--line':'#ECE6DC','--line2':'#E1DACE','--accent':'#5F7D64','--accent-ink':'#456049','--accent-bg':'#E9F0EA','--idea':'#A97C2E','--idea-bg':'#F6EDDB','--nono':'#8C877F','--nono-bg':'#EFEBE3','--danger':'#B0553F','--danger-bg':'#F4E7E1','--shadow':'0 1px 2px #2b241a10,0 10px 30px #2b241a12'},
    dark: {'--bg':'#211E1A','--panel':'#272320','--mid':'#231F1B','--rail':'#1C1915','--elev':'#2C2723','--text':'#ECE7DF','--text2':'#A79F94','--text3':'#7A7368','--line':'#34302A','--line2':'#3E392F','--accent':'#88AB8B','--accent-ink':'#B4D2B7','--accent-bg':'#28312A','--idea':'#D3A85F','--idea-bg':'#332818','--nono':'#9A9389','--nono-bg':'#2A2621','--danger':'#D98A72','--danger-bg':'#382520','--shadow':'0 1px 2px #0000004d,0 12px 34px #00000066'}
  };
  applyTheme() { const m=this.TOK[this.state.theme]; for(const p in m) document.body.style.setProperty(p,m[p]); const ic=document.getElementById('lx-thm'); if(ic) ic.className='ph ph-'+(this.state.theme==='dark'?'sun':'moon'); const ic2=document.getElementById('lx-thm2'); if(ic2) ic2.className='ph ph-'+(this.state.theme==='dark'?'sun':'moon'); }
  applyNav() { const ids={chat:'nav-chat',database:'nav-database',projects:'nav-projects',clarify:'nav-clarify',nontodo:'nav-nontodo',agent:'nav-agent',settings:'nav-settings',admin:'nav-admin'}; Object.values(ids).forEach(id=>{const e=document.getElementById(id); if(e){e.style.background='transparent';e.style.color='var(--text2)';}}); const a=document.getElementById(ids[this.state.view]); if(a){a.style.background='var(--accent-bg)';a.style.color='var(--accent-ink)';} const na=document.getElementById('nav-admin'); if(na) na.style.opacity=this.state.role==='admin'?'1':'.4'; }
  componentDidMount() { this.applyTheme(); this.applyNav(); this._onResize=()=>{ const w=window.innerWidth||document.documentElement.clientWidth||1200; const m=w<820; if(m!==this.state.isMobile) this.setState({isMobile:m}); }; this._onResize(); window.addEventListener('resize',this._onResize); requestAnimationFrame(()=>this._onResize()); setTimeout(()=>this._onResize(),0); setTimeout(()=>this._onResize(),250); try{ this._ro=new ResizeObserver(()=>this._onResize()); this._ro.observe(document.documentElement); }catch(e){} this._onKey=(e)=>{ if(!this.state.authed) return; if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); this.setState(s=>({searchOpen:!s.searchOpen,searchQuery:'',paletteIndex:0})); return; } if(e.key==='Escape'){ this.setState({searchOpen:false,notifOpen:false,shortcutsOpen:false}); return; } if(this.state.searchOpen) return; const tag=(e.target&&e.target.tagName)||''; if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return; if(e.key==='/'){ e.preventDefault(); this.setState({searchOpen:true,searchQuery:'',paletteIndex:0}); return; } if(e.key==='?'){ e.preventDefault(); this.setState(s=>({shortcutsOpen:!s.shortcutsOpen})); return; } if(e.key==='n'||e.key==='N'){ e.preventDefault(); this.go('chat'); setTimeout(()=>{const c=document.getElementById('lx-composer'); if(c)c.focus();},60); return; } const k=(e.key||'').toLowerCase(); if(this._gPending){ this._gPending=false; const map={c:'chat',d:'database',p:'projects',s:'settings',l:'clarify',a:'agent',t:'nontodo'}; if(map[k]){ e.preventDefault(); this.go(map[k]); } return; } if(k==='g'){ this._gPending=true; clearTimeout(this._gTimer); this._gTimer=setTimeout(()=>{this._gPending=false;},900); } }; window.addEventListener('keydown',this._onKey); if(getToken()){ api.me().then(u=>{ this._applyUser(u); return this.loadState(); }).then(()=>this._enterApp()).catch(()=>{ setToken(''); }); } }
  componentWillUnmount() { if(this._onResize) window.removeEventListener('resize',this._onResize); if(this._ro) try{ this._ro.disconnect(); }catch(e){} }
  componentDidUpdate() { this.applyNav(); }
  _projName(pid){ if(!pid) return '收件箱'; const p=(this.state.projects||[]).find(x=>x.id===pid); return p?p.name:pid; }
  _mapTask(t){ return { id:t.id, title:t.title, status:t.status, project:this._projName(t.projectId), due:lxFmtDue(t.dueAt), today:lxIsToday(t.dueAt), priority:t.priority||3, scope:t.privacyScope||'work', notes:t.notes||'', raw:t.notes||'', reason:'', conf:t.confidence!=null?String(t.confidence):'', gen:t.createdAt||'', edited:false, _projectId:t.projectId||null, _dueAt:t.dueAt||null }; }
  _mapIdea(i){ return { id:i.id, title:i.title, raw:i.rawText, status:i.status, suggest:i.suggestedNextAction, reason:i.aiReason, scope:i.privacyScope||'work', gen:i.createdAt||'' }; }
  _mapNon(n){ return { id:n.id, title:n.title, text:n.summary||n.rawText, raw:n.rawText, reason:n.reason, dest:n.suggestedDestination||'archive', scope:n.privacyScope||'work', gen:n.createdAt||'', corrected:!!n.corrected }; }
  async loadState(){
    try{
      const [st, ai] = await Promise.all([ api.getState(), api.getAiConfig().catch(()=>null) ]);
      // projects first (task mapping resolves project names from them)
      this.setState({ projects:(st.projects||[]).map((p,idx)=>({ id:p.id, name:p.name, desc:p.description||'', status:p.status||'进行中', color:['#5F7D64','#B07A2A','#3E68C4','#7C6FB0'][idx%4] })) });
      const as=st.appSettings||{}, ap=st.agentProfile||{};
      const feed=[];
      (st.tasks||[]).slice(0,5).forEach(t=>feed.push({id:t.id,kind:'task',title:t.title,time:lxFmtDue(t.createdAt),refId:t.id}));
      (st.todoIdeas||[]).slice(0,3).forEach(i=>feed.push({id:i.id,kind:'idea',title:i.title,time:lxFmtDue(i.createdAt),refId:i.id}));
      (st.nonTodoOutputs||[]).slice(0,3).forEach(n=>feed.push({id:n.id,kind:'nono',title:n.title,time:lxFmtDue(n.createdAt),refId:n.id}));
      const presetName = ai ? ((this._aiPresets.find(p=>p.provider===ai.provider && (p.baseUrl||'')===(ai.baseUrl||''))||{}).name || (ai.provider==='rule'?'规则版（离线）':'自定义')) : '规则版（离线）';
      // server chat history → message bubbles (entity cards only appear live)
      const messages=(st.chat||[]).slice(-60).map(m=> m.role==='user'
        ? {id:m.id,role:'user',text:m.text}
        : {id:m.id,role:'ai',kind:'text',text:m.text,isErr:!!m.isError});
      const np=as.notifPrefs&&typeof as.notifPrefs==='object'?as.notifPrefs:{};
      this.setState(s=>({
        tasks:(st.tasks||[]).map(t=>this._mapTask(t)),
        ideas:(st.todoIdeas||[]).filter(i=>i.status==='clarifying').map(i=>this._mapIdea(i)),
        nonTodos:(st.nonTodoOutputs||[]).map(n=>this._mapNon(n)),
        notifications:(st.notifications||[]).map(n=>({id:n.id,type:n.type,icon:n.icon||'ph-bell',color:n.color||'var(--accent-ink)',text:n.text,time:lxFmtDue(n.createdAt),read:!!n.read})),
        feed,
        messages,
        theme: as.theme==='dark'?'dark':'light',
        agent:{ soul:ap.soul||'', memory:ap.memory||'', preferences:ap.preferences||'', workingStyle:ap.workingStyle||'', privacyRules:ap.privacyRules||'', followup:ap.defaultFollowupStrategy||'' },
        workspace: as.workspaceMode||s.workspace,
        privacy: as.privacyMode!=null?!!as.privacyMode:s.privacy,
        settings:{ ...s.settings, defaultWs:as.workspaceMode||s.settings.defaultWs, defaultView:as.defaultView||s.settings.defaultView, aiVisibility:as.aiVisibility||s.settings.aiVisibility, privacyDefault:as.privacyMode!=null?!!as.privacyMode:s.settings.privacyDefault, notifPrefs:{assign:np.assign!==false,due:np.due!==false,fail:np.fail!==false,done:np.done!==false}, apiKey:'', aiTested: ai?!!ai.hasKey:s.settings.aiTested, aiPreset:presetName, aiProvider: ai?ai.provider:s.settings.aiProvider, aiBaseUrl: ai?(ai.baseUrl||''):s.settings.aiBaseUrl, aiModel: ai?(ai.model||''):s.settings.aiModel, aiHasKey: ai?!!ai.hasKey:s.settings.aiHasKey, aiFallback: ai?(ai.fallbackToRule!==false):s.settings.aiFallback },
        _loaded:true,
      }), ()=>{ this.applyTheme(); this.scrollMsgs(); });
    }catch(e){ if(e&&e.status===401){ setToken(''); this.setState({authed:false}); } else { this.flashToast('数据加载失败，请刷新重试'); } }
  }
  _applyUser(u){ if(!u) return; this.setState(s=>({role:u.role||'member', settings:{...s.settings, name:u.name||s.settings.name, email:u.email||s.settings.email}})); }
  _enterApp(){ const ok=['chat','database','projects','clarify','nontodo','agent','settings']; this.setState(s=>({authed:true, view:ok.includes(s.settings.defaultView)?s.settings.defaultView:'chat', workspace:s.settings.defaultWs||'work', privacy:!!s.settings.privacyDefault, authPassword:'', authError:''}), ()=>{ this.applyTheme(); this.applyNav(); this.scrollMsgs(); }); }
  async submitAuth(){
    const s=this.state;
    const email=(s.authEmail||'').trim(), pw=s.authPassword||'', name=(s.authName||'').trim();
    if(s.authMode==='register'&&!name){ this.setState({authError:'请输入显示名称'}); return; }
    if(!email){ this.setState({authError:'请输入邮箱'}); return; }
    if(!pw){ this.setState({authError:'请输入密码'}); return; }
    this.setState({authBusy:true, authError:''});
    try{
      const r = s.authMode==='register' ? await api.register(name,email,pw) : await api.login(email,pw);
      setToken(r.token);
      this._applyUser(r.user);
      await this.loadState();
      this.setState({authBusy:false});
      this._enterApp();
      this.flashToast(s.authMode==='register'?'注册成功 · 欢迎使用':'欢迎回来');
    }catch(e){ this.setState({authBusy:false, authError:(e&&e.message)||'请求失败，请稍后再试'}); }
  }
  doLogout(){ api.logout().catch(()=>{}); setToken(''); this.setState({authed:false, authMode:'login', authPassword:'', authError:''}); }
  pickAiPreset(p){ this.setState(s=>({settings:{...s.settings, aiPreset:p.name, aiProvider:p.provider, aiBaseUrl:p.baseUrl, aiModel:(p.models&&p.models[0])||'', aiTested:false}})); }
  setAiField(field,val){ this.setState(s=>({settings:{...s.settings, [field]:val, aiTested:false, ...(field==='aiBaseUrl'||field==='aiModel'?{aiPreset: s.settings.aiPreset==='规则版（离线）'?s.settings.aiPreset:'自定义'}:{})}})); }
  toggleTheme() { this.setState(s=>({theme:s.theme==='dark'?'light':'dark'}), ()=>{ this.applyTheme(); api.updateSettings({theme:this.state.theme}).catch(()=>{}); }); }
  go(view) { this.setState({view, detailId:null, mobilePane:(view==='chat'||view==='database')?'main':'list'}, ()=>{ if(view==='chat') this.scrollMsgs(); }); if(view==='admin') this.fetchAdmin(); }
  scrollMsgs() { const b=document.getElementById('lx-msgs'); if(b) b.scrollTop=b.scrollHeight; }
  visible(scope) { return !this.state.privacy || scope===this.state.workspace || scope==='mixed'; }
  // 轻量意图预判（与后端 detectIntent 同源的规则）：给「思考中」状态一行真实的分析文案。
  guessIntent(t){
    const m=(t||'').trim();
    if(/(记一下|记个|提醒我|帮我记|加个任务|新建任务|加一条|建个任务)/.test(m)) return 'capture';
    if(/^(你好|您好|hi|hello|嗨|哈喽|hey|早上好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|谢啦|辛苦了)[呀啊哦呢!！。?？~～\s]*$/i.test(m)) return 'greeting';
    if(m.length<=24&&/(你是谁|你能做什么|你会什么|你能干什么|能干嘛|会干嘛|怎么用|使用说明|有什么功能|帮助|help)/i.test(m)) return 'help';
    if(['做什么','接下来','安排什么','该干嘛','下一步做','两小时','怎么安排','规划一下','帮我规划','帮我安排'].some(k=>m.includes(k))) return 'plan';
    if(/^(有什么|有哪些|哪些|列出|列一下|看看我?|查看|查一下|查询|显示|盘点|汇总|统计)/.test(m)&&/(任务|待办|todo|事情|安排|到期|没做|完成)/i.test(m)) return 'query';
    if(/(到期|逾期|过期)/.test(m)&&/(哪些|什么|有没有|多少)/.test(m)&&m.length<=30) return 'query';
    if(/^(?:帮我)?(?:把)?(.{1,50}?)(?:标记为?完成|置为完成|标记完成|完成掉|搞定了|做完了|已完成|完成了)[。!！~～]*$/.test(m)||/^完成(?:任务)?[:：]/.test(m)) return 'complete';
    if(/^(?:帮我)?(?:把)?(.{1,50}?)(?:删了|删掉|删除|删除掉)[。!！~～]*$/.test(m)||/^(?:帮我)?删除/.test(m)||/^删掉/.test(m)) return 'delete';
    if(/[?？]$/.test(m)||/^(为什么|什么是|如何|怎么样|怎么办|是不是|能不能|可不可以|有没有)/.test(m)) return 'question';
    return 'capture';
  }
  _thinkLabel(intent){
    const llm=this.state.settings.aiProvider&&this.state.settings.aiProvider!=='rule';
    const map={
      greeting:'识别为问候 · 正在组织回复…',
      help:'识别为功能咨询 · 正在整理能力清单…',
      plan:'识别为规划请求 · 正在按截止与优先级编排…',
      query:'识别为查询请求 · 正在检索任务清单…',
      complete:'识别为完成命令 · 正在匹配目标任务…',
      delete:'识别为删除命令 · 正在匹配目标任务…',
      question:'识别为提问 · 正在组织回答…',
      capture:'初步判断为待归档内容 · 正在分类并提取时间 / 优先级…',
    };
    return (llm?'':'')+(map[intent]||'正在处理…');
  }
  _startThinking(text){
    clearTimeout(this._thinkTimer);
    this.setState({thinking:true,thinkText:'正在分析意图…'});
    const label=this._thinkLabel(this.guessIntent(text));
    this._thinkTimer=setTimeout(()=>{ if(this.state.thinking) this.setState({thinkText:label}, ()=>this.scrollMsgs()); },420);
  }
  retry(msgId,text){
    this.setState(s=>({messages:s.messages.map(m=>m.id===msgId?{...m,retrying:true}:m)}));
    api.capture(text,'chat').then(({result,entityType,entity})=>{
      let aiMsg, add={};
      if(entityType==='task'){ const nt=this._mapTask(entity); add.tasks=[nt,...this.state.tasks]; aiMsg={id:msgId,role:'ai',kind:'task',title:nt.title,reason:result.reason||'',chips:[{i:'ph-calendar-blank',t:'截止 '+nt.due},{i:'ph-folder',t:nt.project},{i:'ph-flag',t:'P'+nt.priority}],refId:nt.id}; }
      else if(entityType==='todo_idea'){ const ni=this._mapIdea(entity); add.ideas=[ni,...this.state.ideas]; aiMsg={id:msgId,role:'ai',kind:'idea',title:ni.title,reason:result.reason||'',suggest:ni.suggest,refId:ni.id}; }
      else { const nn=this._mapNon(entity); add.nonTodos=[nn,...this.state.nonTodos]; aiMsg={id:msgId,role:'ai',kind:'nono',text:nn.title,reason:result.reason||'',refId:nn.id}; }
      this.setState(s=>({...add,messages:s.messages.map(m=>m.id===msgId?aiMsg:m),aiErrors:s.aiErrors.map(e=>(e.raw===text&&e.status==='failed')?{...e,status:'已重试成功'}:e)}), ()=>this.scrollMsgs());
      this.flashToast('已重试 · 生成成功');
    }).catch(e=>{ this.setState(s=>({messages:s.messages.map(m=>m.id===msgId?{...m,retrying:false}:m)})); this.flashToast('重试失败：'+e.message); });
  }
  async send() {
    if(this.state.role==='viewer'){ this.flashToast('只读模式 · 无法创建内容'); return; }
    const el=document.getElementById('lx-composer'); if(!el) return;
    const t=(el.value||'').trim(); const refs=this.state.pendingRefs.slice();
    if(!t && !refs.length) return; el.value='';
    const uid='m'+(++this._seq);
    const userMsg={id:uid,role:'user',text:t||'（就引用内容继续）',refs:refs.map(r=>r.label)};
    this.setState(s=>({messages:[...s.messages,userMsg],pendingRefs:[],mentionOpen:false,mentionQuery:''}), ()=>this.scrollMsgs());
    this._startThinking(refs.length?'帮我规划':t);

    // @引用 → 计划 / 拆解（暂为本地建议，不落库）
    if(refs.length){
      const parent=refs[0].label, isProj=refs[0].type==='project';
      let plan, planTitle, planSub, planNote;
      if(isProj){
        const pts=this.state.tasks.filter(x=>x.project===parent && x.status!=='done' && this.visible(x.scope)).slice(0,4);
        plan=pts.length?pts.map((x,i)=>({n:i+1,t:x.title,d:x.due||'待定'})):[{n:1,t:'该项目下暂无未完成任务',d:''}];
        planTitle='基于 @'+parent+' 的下一步计划'; planSub='只使用该项目下的可见未完成任务'; planNote='未使用非 todo 内容';
      } else {
        const subsDef=[['梳理目标与范围','25 min'],['完成核心部分','45 min'],['自查并同步 / 提交','20 min']];
        plan=subsDef.map((s,i)=>({n:i+1,t:parent+' · '+s[0],d:s[1]}));
        planTitle='基于 @'+parent+' 拆成 3 个小任务'; planSub='（引用拆解建议）'; planNote='来源 @'+parent;
      }
      const aiMsg={id:'m'+(++this._seq),role:'ai',kind:'plan',planTitle,planSub,planNote,plan};
      setTimeout(()=>this.setState(s=>({thinking:false,messages:[...s.messages,aiMsg]}), ()=>this.scrollMsgs()),260);
      return;
    }

    // 纯文本 → 后端 /api/chat（意图识别：命令/问题直接执行或回答，内容才落库）
    try{
      const res=await api.chat(t);
      const newMsgs=[]; let tasks=this.state.tasks.slice(), ideas=this.state.ideas.slice(), nonTodos=this.state.nonTodos.slice(), feedArr=this.state.feed.slice();
      // 1) created entities → cards
      for(const it of (res.entities||[])){
        const reason=(it.result&&it.result.reason)||res.reply||'';
        if(it.type==='task'){
          const nt=this._mapTask(it.entity); tasks=[nt,...tasks]; feedArr=[{id:nt.id,kind:'task',title:nt.title,time:'刚刚',refId:nt.id},...feedArr];
          newMsgs.push({id:'m'+(++this._seq),role:'ai',kind:'task',title:nt.title,reason,chips:[{i:'ph-calendar-blank',t:'截止 '+nt.due},{i:'ph-folder',t:nt.project},{i:'ph-flag',t:'P'+nt.priority}],refId:nt.id});
        } else if(it.type==='todo_idea'){
          const ni=this._mapIdea(it.entity); ideas=[ni,...ideas]; feedArr=[{id:ni.id,kind:'idea',title:ni.title,time:'刚刚',refId:ni.id},...feedArr];
          newMsgs.push({id:'m'+(++this._seq),role:'ai',kind:'idea',title:ni.title,reason:ni.reason||reason,suggest:ni.suggest,refId:ni.id});
        } else {
          const nn=this._mapNon(it.entity); nonTodos=[nn,...nonTodos]; feedArr=[{id:nn.id,kind:'nono',title:nn.title,time:'刚刚',refId:nn.id},...feedArr];
          newMsgs.push({id:'m'+(++this._seq),role:'ai',kind:'nono',text:nn.title,reason:nn.reason||reason,refId:nn.id});
        }
      }
      // 2) performed actions → update local rows
      for(const p of (res.performed||[])){
        if(p.type==='complete_task'&&p.task){ const mt=this._mapTask(p.task); tasks=tasks.map(x=>x.id===mt.id?{...x,...mt}:x); }
        else if(p.type==='update_task'&&p.task){ const mt=this._mapTask(p.task); tasks=tasks.map(x=>x.id===mt.id?{...x,...mt}:x); }
        else if(p.type==='delete_task'){ tasks=tasks.filter(x=>x.id!==p.id); feedArr=feedArr.filter(f=>f.refId!==p.id); }
        else if(p.type==='remember'){ api.getAgent().then(ap=>this.setState(s=>({agent:{...s.agent, memory:ap.memory||s.agent.memory}}))).catch(()=>{}); }
      }
      // 3) plan card
      if(res.plan&&res.plan.length){
        newMsgs.push({id:'m'+(++this._seq),role:'ai',kind:'plan',planTitle:'接下来 · 建议计划',planSub:'基于当前可见 todo',planNote:'未使用非 todo 内容制定计划',plan:res.plan.map((p,i)=>({n:i+1,t:p.task.title,d:(p.minutes||30)+' min'}))});
      }
      // 4) natural-language reply bubble (skip when a capture card already tells the story)
      const showReply=res.reply&&((res.entities||[]).length===0||res.intent==='agent');
      if(showReply) newMsgs.push({id:'m'+(++this._seq),role:'ai',kind:'text',text:res.reply});
      if(!newMsgs.length&&res.reply) newMsgs.push({id:'m'+(++this._seq),role:'ai',kind:'text',text:res.reply});
      this.setState(s=>({tasks,ideas,nonTodos,feed:feedArr,thinking:false,messages:[...s.messages,...newMsgs]}), ()=>{ this.scrollMsgs(); const c=document.getElementById('lx-composer'); if(c)c.focus(); });
    }catch(e){
      const aiMsg={id:'m'+(++this._seq),role:'ai',kind:'error',errType:(e&&e.message)||'请求失败',retryText:t};
      this.setState(s=>({thinking:false,messages:[...s.messages,aiMsg],aiErrors:[{id:'e'+(++this._seq),user:s.settings.name,raw:t,errType:(e&&e.message)||'请求失败',time:'刚刚',status:'failed'},...s.aiErrors]}), ()=>this.scrollMsgs());
    }
  }
  onComposerInput(e){ const el=e.target; const val=el.value; const caret=(el.selectionStart!=null)?el.selectionStart:val.length; const upto=val.slice(0,caret); const at=upto.lastIndexOf('@'); if(at>=0){ const q=upto.slice(at+1); if(!/\s/.test(q)){ this.setState({mentionOpen:true,mentionQuery:q,mentionAt:at,mentionIndex:0}); return; } } if(this.state.mentionOpen) this.setState({mentionOpen:false,mentionQuery:''}); }
  mentionCandidates(){ const mq=(this.state.mentionQuery||'').toLowerCase(); const f=(arr)=>mq?arr.filter(x=>x.label.toLowerCase().includes(mq)):arr; const T=f(this.state.tasks.filter(t=>this.visible(t.scope)).map(t=>({type:'task',id:t.id,label:t.title}))).slice(0,4); const P=f([...new Set(this.state.tasks.map(t=>t.project))].map(p=>({type:'project',id:'p:'+p,label:p}))).slice(0,4); return [...T,...P]; }
  pickMention(item){ const el=document.getElementById('lx-composer'); const at=this.state.mentionAt; if(el&&at>=0){ const val=el.value; const caret=(el.selectionStart!=null)?el.selectionStart:val.length; el.value=val.slice(0,at)+val.slice(caret); } this.setState(s=>({pendingRefs:s.pendingRefs.some(r=>r.id===item.id)?s.pendingRefs:[...s.pendingRefs,{type:item.type,id:item.id,label:item.label}],mentionOpen:false,mentionQuery:''}),()=>{const e2=document.getElementById('lx-composer'); if(e2)e2.focus();}); }
  removeRef(id){ this.setState(s=>({pendingRefs:s.pendingRefs.filter(r=>r.id!==id)})); }
  atButton(){ const el=document.getElementById('lx-composer'); if(!el) return; el.focus(); const v=el.value; const sep=(v===''||v.endsWith(' '))?'':' '; el.value=v+sep+'@'; this.setState({mentionOpen:true,mentionQuery:'',mentionAt:el.value.length-1,mentionIndex:0}); }
  mentionEnterOrSend(){ if(this.state.mentionOpen){ const items=this.mentionCandidates(); const it=items[this.state.mentionIndex||0]||items[0]; if(it){ this.pickMention(it); return; } this.setState({mentionOpen:false}); return; } this.send(); }
  openTask(id){ this.setState({detailId:id}); const t=this.state.tasks.find(x=>x.id===id); if(t) this.pushRecent({type:'task',id,label:t.title}); api.getTaskDetail(id).then(d=>{ if(!d||!d.task) return; const gr=d.generationRecord; this.setState(s=>({ taskSubs:{...s.taskSubs,[id]:(d.subtasks||[]).map(x=>({id:x.id,text:x.text,done:x.done}))}, taskComments:{...s.taskComments,[id]:(d.comments||[]).map(c=>({author:c.author,text:c.text,time:c.createdAt||''}))}, taskActivity:{...s.taskActivity,[id]:(d.activity||[]).map(a=>({text:a.text,time:a.createdAt||''}))}, tasks: gr? s.tasks.map(x=>x.id===id?{...x,raw:gr.rawInput||x.raw,reason:gr.aiReason||x.reason,conf:gr.confidence!=null?String(gr.confidence):x.conf,gen:gr.createdAt||x.gen}:x):s.tasks })); }).catch(()=>{}); }
  pushRecent(item){ this.setState(s=>({recent:[item,...(s.recent||[]).filter(r=>!(r.type===item.type&&r.id===item.id))].slice(0,6)})); }
  closePalette(){ this.setState({searchOpen:false,searchQuery:'',paletteIndex:0}); }
  openRecent(r){ if(r.type==='task')this.openTask(r.id); else if(r.type==='project')this.setState({view:'projects',selProjectId:r.id}); }
  paletteCapture(text){ if(this.state.role==='viewer'){this.flashToast('只读模式 · 无法创建内容');this.closePalette();return;} this.setState({view:'chat',searchOpen:false,searchQuery:'',paletteIndex:0}, ()=>{ const c=document.getElementById('lx-composer'); if(c){ c.value=text; } this.send(); }); }
  buildPalette(){
    const st=this.state; const q=(st.searchQuery||'').trim(); const ql=q.toLowerCase(); const groups=[];
    const nav=(v,label,icon)=>({icon,label,run:()=>{this.go(v);this.closePalette();}});
    const cmds=[
      {icon:'ph-plus-circle',label:'新建捕获（聊天输入）',run:()=>{this.go('chat');this.closePalette();setTimeout(()=>{var c=document.getElementById('lx-composer');if(c)c.focus();},60);}},
      nav('chat','前往 · 聊天','ph-chat-circle'), nav('database','前往 · Todo 数据库','ph-table'), nav('projects','前往 · 项目','ph-folders'), nav('clarify','前往 · 待澄清区','ph-lightbulb'), nav('nontodo','前往 · 非 todo 隔离区','ph-tray'), nav('agent','前往 · Agent 配置','ph-sparkle'), nav('settings','前往 · 设置','ph-gear'),
      {icon:'ph-moon',label:'切换 明 / 暗 主题',run:()=>{this.toggleTheme();this.closePalette();}},
      {icon:'ph-briefcase',label:'切换工作区（工作 / 个人）',run:()=>{this.setState(s=>({workspace:s.workspace==='work'?'personal':'work'}));this.closePalette();}},
      {icon:'ph-lock-simple',label:'切换隐私模式',run:()=>{this.setState(s=>({privacy:!s.privacy}));this.closePalette();}}
    ];
    if(st.role==='admin') cmds.push(nav('admin','前往 · 内部后台','ph-chart-bar'));
    if(!q){
      const rec=(st.recent||[]).map(r=>({icon:r.type==='task'?'ph-check-square':r.type==='project'?'ph-folder':'ph-note',label:r.label,run:()=>{this.openRecent(r);this.closePalette();}}));
      if(rec.length) groups.push({name:'最近',items:rec});
      groups.push({name:'快捷命令',items:cmds});
    } else {
      groups.push({name:'捕获',items:[{icon:'ph-lightning',label:'捕获：“'+q+'”',run:()=>this.paletteCapture(q)}]});
      const fc=cmds.filter(c=>c.label.toLowerCase().includes(ql)); if(fc.length) groups.push({name:'命令',items:fc});
      const ft=st.tasks.filter(t=>this.visible(t.scope)&&t.title.toLowerCase().includes(ql)).slice(0,5).map(t=>({icon:'ph-check-square',label:t.title,run:()=>{this.openTask(t.id);this.closePalette();}})); if(ft.length) groups.push({name:'任务',items:ft});
      const fp=st.projects.filter(p=>p.name.toLowerCase().includes(ql)).map(p=>({icon:'ph-folder',label:p.name,run:()=>{this.setState({view:'projects',selProjectId:p.id});this.closePalette();}})); if(fp.length) groups.push({name:'项目',items:fp});
      const fi=st.ideas.filter(i=>this.visible(i.scope)&&i.title.toLowerCase().includes(ql)).slice(0,3).map(i=>({icon:'ph-lightbulb',label:i.title,run:()=>{this.setState({view:'clarify',selIdeaId:i.id});this.closePalette();}})); if(fi.length) groups.push({name:'待澄清',items:fi});
      const fn=st.nonTodos.filter(n=>this.visible(n.scope)&&n.title.toLowerCase().includes(ql)).slice(0,3).map(n=>({icon:'ph-tray',label:n.title,run:()=>{this.setState({view:'nontodo',selNonId:n.id});this.closePalette();}})); if(fn.length) groups.push({name:'非 todo',items:fn});
    }
    const flat=[]; groups.forEach(g=>g.items.forEach(it=>{it.flatIdx=flat.length; flat.push(it);}));
    return {groups,flat};
  }
  paletteKey(e){ const flat=this.buildPalette().flat; const n=flat.length; if(e.key==='ArrowDown'){e.preventDefault();this.setState(s=>({paletteIndex:Math.min((s.paletteIndex||0)+1,Math.max(0,n-1))}));} else if(e.key==='ArrowUp'){e.preventDefault();this.setState(s=>({paletteIndex:Math.max((s.paletteIndex||0)-1,0)}));} else if(e.key==='Enter'){e.preventDefault();const it=flat[this.state.paletteIndex||0]||flat[0]; if(it)it.run();} else if(e.key==='Escape'){this.setState({searchOpen:false});} }
  openFeed(f){ if(f.kind==='task') this.setState({view:'chat',detailId:f.refId}); else if(f.kind==='idea') this.setState({view:'clarify',mobilePane:'main'}); else this.setState({view:'nontodo',mobilePane:'main'}); }
  patchTask(id,patch){ this.setState(s=>({tasks:s.tasks.map(t=>t.id===id?{...t,...patch,edited:true}:t)})); const body={}; ['title','notes','status','priority','assignee'].forEach(k=>{ if(k in patch) body[k]=patch[k]; }); if('scope' in patch) body.privacyScope=patch.scope; if(Object.keys(body).length) api.updateTask(id,body).catch(()=>{}); }
  moveOut(id){ const t=this.state.tasks.find(x=>x.id===id); this.setState(s=>({tasks:s.tasks.filter(x=>x.id!==id),detailId:null})); api.taskMoveOut(id).then(r=>{ if(r&&r.nonTodo) this.setState(s=>({nonTodos:[this._mapNon(r.nonTodo),...s.nonTodos]})); this.flashToast('已移出 todo · 保留来源与生成记录'); }).catch(e=>{ if(t) this.setState(s=>({tasks:[t,...s.tasks]})); this.flashToast('移出失败：'+e.message); }); }
  flashToast(msg){ this.setState({toast:msg}); this._toastTimer&&clearTimeout(this._toastTimer); this._toastTimer=setTimeout(()=>this.setState({toast:null}),2600); }
  convertIdea(id){ const it=this.state.ideas.find(x=>x.id===id); const ideas=this.state.ideas.filter(x=>x.id!==id); this.setState({ideas, selIdeaId:ideas[0]?ideas[0].id:null}); api.ideaConvert(id).then(r=>{ if(r&&r.task) this.setState(s=>({tasks:[this._mapTask(r.task),...s.tasks]})); this.flashToast('已转为正式任务 · 进入 Todo 数据库'); }).catch(e=>{ if(it) this.setState(s=>({ideas:[it,...s.ideas]})); this.flashToast('转换失败：'+e.message); }); }
  discardIdea(id){ const it=this.state.ideas.find(x=>x.id===id); const ideas=this.state.ideas.filter(x=>x.id!==id); this.setState({ideas, selIdeaId:ideas[0]?ideas[0].id:null}); api.ideaDiscard(id).then(()=>this.flashToast('已放弃该待澄清项')).catch(e=>{ if(it) this.setState(s=>({ideas:[it,...s.ideas]})); this.flashToast('操作失败：'+e.message); }); }
  nonConvert(id){ const n=this.state.nonTodos.find(x=>x.id===id); const nonTodos=this.state.nonTodos.filter(x=>x.id!==id); this.setState({nonTodos, selNonId:nonTodos[0]?nonTodos[0].id:null}); api.nonToTodo(id).then(r=>{ if(r&&r.task) this.setState(s=>({tasks:[this._mapTask(r.task),...s.tasks]})); this.flashToast('已转为 todo · 进入 Todo 数据库'); }).catch(e=>{ if(n) this.setState(s=>({nonTodos:[n,...s.nonTodos]})); this.flashToast('转换失败：'+e.message); }); }
  removeNon(id,msg){ const n=this.state.nonTodos.find(x=>x.id===id); const nonTodos=this.state.nonTodos.filter(x=>x.id!==id); this.setState({nonTodos, selNonId:nonTodos[0]?nonTodos[0].id:null}); api.nonDiscard(id).then(()=>this.flashToast(msg)).catch(e=>{ if(n) this.setState(s=>({nonTodos:[n,...s.nonTodos]})); this.flashToast('操作失败：'+e.message); }); }
  updateAgent(field,val){ this.setState(s=>({agent:{...s.agent,[field]:val}})); const map={soul:'soul',memory:'memory',preferences:'preferences',workingStyle:'workingStyle',privacyRules:'privacyRules',followup:'defaultFollowupStrategy'}; const col=map[field]; if(col) api.updateAgent({[col]:val}).catch(()=>{}); }
  updateSetting(field,val){ this.setState(s=>({settings:{...s.settings,[field]:val}})); const map={defaultWs:'workspaceMode',defaultView:'defaultView',aiVisibility:'aiVisibility',privacyDefault:'privacyMode'}; const col=map[field]; if(col) api.updateSettings({[col]: field==='privacyDefault'?!!val:val}).catch(()=>{}); }
  submitPwd(){
    const {pwdOld,pwdNew}=this.state;
    if(!pwdNew||pwdNew.length<6){ this.flashToast('新密码至少 6 位'); return; }
    this.setState({pwdBusy:true});
    api.changePassword(pwdOld,pwdNew).then(()=>{ this.setState({pwdBusy:false,pwdOpen:false,pwdOld:'',pwdNew:''}); this.flashToast('密码已更新'); })
      .catch(e=>{ this.setState({pwdBusy:false}); this.flashToast('修改失败：'+e.message); });
  }
  doExport(){
    api.exportData().then(data=>{
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='linx-export-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
      this.flashToast('已导出全部数据 (JSON)');
    }).catch(e=>this.flashToast('导出失败：'+e.message));
  }
  doClearData(){
    if(!window.confirm('确定清空当前账号下的全部任务、想法与聊天记录吗？此操作不可恢复。')) return;
    api.clearData().then(()=>this.loadState().then(()=>this.flashToast('已清空数据'))).catch(e=>this.flashToast('清空失败：'+e.message));
  }
  copyNonText(){ const st=this.state; const n=st.nonTodos.find(x=>x.id===st.selNonId)||st.nonTodos[0]; if(!n) return; const txt=n.raw||n.text||n.title; const done=()=>this.flashToast('已复制到剪贴板'); if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(()=>this.flashToast('复制失败')); } else { const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');done();}catch(e){this.flashToast('复制失败');} ta.remove(); } }
  exportNonMd(){ const st=this.state; const n=st.nonTodos.find(x=>x.id===st.selNonId)||st.nonTodos[0]; if(!n) return; const md='# '+n.title+'\n\n'+(n.text||'')+'\n\n---\n原始输入：'+(n.raw||'')+'\n\nAI 判断：'+(n.reason||'')+'\n导出于 '+new Date().toLocaleString(); const blob=new Blob([md],{type:'text/markdown'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(n.title||'non-todo').slice(0,24)+'.md'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); this.flashToast('已导出 Markdown'); }
  fetchAdmin(){
    if(this.state.role!=='admin') return;
    this.setState({adminLoading:true});
    api.adminOverview().then(ov=>{
      const users=ov.users||[];
      const selId=this.state.adminSelId&&users.some(u=>u.id===this.state.adminSelId)?this.state.adminSelId:(users[0]?users[0].id:null);
      this.setState({adminUsers:users,adminSelId:selId,adminLoading:false});
      if(selId) this.fetchAdminUser(selId);
    }).catch(e=>{ this.setState({adminLoading:false}); this.flashToast('后台数据加载失败：'+e.message); });
  }
  fetchAdminUser(id){
    this.setState({adminSelId:id});
    api.adminUser(id).then(d=>{
      this.setState({adminRecords:(d.records||[]),adminUserErrors:(d.errors||[])});
    }).catch(()=>{});
  }
  _aiCfg(){ const s=this.state.settings; const cfg={ provider:s.aiProvider||'rule', baseUrl:(s.aiBaseUrl||'').trim(), model:(s.aiModel||'').trim(), fallbackToRule:s.aiFallback!==false }; if((s.apiKey||'').trim()) cfg.apiKey=s.apiKey.trim(); return cfg; }
  testConn(){ this.flashToast('测试中…'); api.testAiConfig(this._aiCfg()).then(r=>{ this.setState(s=>({settings:{...s.settings,aiTested:!!r.ok}})); this.flashToast(r.ok?('连接正常 · '+(r.kind||'模型可用')):('连接失败：'+(r.error||''))); }).catch(e=>{ this.setState(s=>({settings:{...s.settings,aiTested:false}})); this.flashToast('测试失败：'+e.message); }); }
  toggleNotifPref(k){ this.setState(s=>({settings:{...s.settings,notifPrefs:{...s.settings.notifPrefs,[k]:!s.settings.notifPrefs[k]}}}), ()=>api.updateSettings({notifPrefs:this.state.settings.notifPrefs}).catch(()=>{})); }
  setDbLayout(l){ this.setState({dbLayout:l}); }
  toggleSort(key){ this.setState(s=>({dbSortKey:key, dbSortDir:(s.dbSortKey===key&&s.dbSortDir==='asc')?'desc':'asc'})); }
  toggleSelect(id){ this.setState(s=>({dbSelected:s.dbSelected.includes(id)?s.dbSelected.filter(x=>x!==id):[...s.dbSelected,id]})); }
  selectAll(ids){ this.setState(s=>({dbSelected:(ids.length>0 && ids.every(i=>s.dbSelected.includes(i)))?[]:ids.slice()})); }
  clearSel(){ this.setState({dbSelected:[]}); }
  batchStatus(status){ const ids=this.state.dbSelected.slice(); this.setState(s=>({tasks:s.tasks.map(t=>ids.includes(t.id)?{...t,status,edited:true}:t), dbSelected:[]})); ids.forEach(id=>api.updateTask(id,{status}).catch(()=>{})); this.flashToast('已更新 '+ids.length+' 项状态'); }
  batchPriority(p){ const ids=this.state.dbSelected.slice(); this.setState(s=>({tasks:s.tasks.map(t=>ids.includes(t.id)?{...t,priority:p,edited:true}:t), dbSelected:[]})); ids.forEach(id=>api.updateTask(id,{priority:p}).catch(()=>{})); this.flashToast('已设为 P'+p); }
  batchMoveOut(){ const ids=this.state.dbSelected.slice(); this.setState(s=>({tasks:s.tasks.filter(t=>!ids.includes(t.id)), dbSelected:[]})); Promise.all(ids.map(id=>api.taskMoveOut(id).then(r=>r&&r.nonTodo).catch(()=>null))).then(rs=>{ const nons=rs.filter(Boolean).map(n=>this._mapNon(n)); if(nons.length) this.setState(s=>({nonTodos:[...nons,...s.nonTodos]})); }); this.flashToast('已移出 '+ids.length+' 项 · 保留来源'); }
  batchDelete(){ const ids=this.state.dbSelected.slice(); this.setState(s=>({tasks:s.tasks.filter(t=>!ids.includes(t.id)), dbSelected:[]})); ids.forEach(id=>api.deleteTask(id).catch(()=>{})); this.flashToast('已删除 '+ids.length+' 项'); }
  assignTask(id,name){ this.setState(s=>({tasks:s.tasks.map(t=>t.id===id?{...t,assignee:name}:t), taskActivity:{...s.taskActivity,[id]:[{text:'指派给 '+name,time:'刚刚'},...(s.taskActivity[id]||[])]}})); api.updateTask(id,{assignee:name}).catch(()=>{}); this.flashToast('已指派给 '+name); }
  logActivity(id,text){ this.setState(s=>({taskActivity:{...s.taskActivity,[id]:[{text,time:'刚刚'},...(s.taskActivity[id]||[])]}})); }
  dSetStatus(status){ const id=this.state.detailId; this.patchTask(id,{status}); this.logActivity(id,'状态改为「'+{todo:'待办',in_progress:'进行中',done:'已完成'}[status]+'」'); }
  addSub(){ const el=document.getElementById('lx-sub'); if(!el)return; const v=(el.value||'').trim(); if(!v)return; el.value=''; const id=this.state.detailId; api.addSubtask(id,v).then(sub=>{ this.setState(s=>({taskSubs:{...s.taskSubs,[id]:[...(s.taskSubs[id]||[]),{id:sub.id,text:sub.text,done:sub.done}]}, taskActivity:{...s.taskActivity,[id]:[{text:'添加子任务：'+v,time:'刚刚'},...(s.taskActivity[id]||[])]}})); }).catch(e=>this.flashToast('添加失败：'+e.message)); }
  toggleSub(sid){ const id=this.state.detailId; this.setState(s=>({taskSubs:{...s.taskSubs,[id]:(s.taskSubs[id]||[]).map(x=>x.id===sid?{...x,done:!x.done}:x)}})); api.toggleSubtask(sid).catch(()=>{}); }
  addComment(){ const el=document.getElementById('lx-cmt'); if(!el)return; const v=(el.value||'').trim(); if(!v)return; el.value=''; const id=this.state.detailId; const author=this.state.settings.name; api.addComment(id,v,author).then(c=>{ this.setState(s=>({taskComments:{...s.taskComments,[id]:[...(s.taskComments[id]||[]),{author:c.author,text:c.text,time:c.createdAt||'刚刚'}]}, taskActivity:{...s.taskActivity,[id]:[{text:'发表了评论',time:'刚刚'},...(s.taskActivity[id]||[])]}})); }).catch(e=>this.flashToast('评论失败：'+e.message)); }
  fmtTask(t){
    const statusLabel={todo:'待办',in_progress:'进行中',done:'已完成'}[t.status];
    const done=t.status==='done';
    const prog=t.status==='in_progress';
    const prioColors={1:['var(--danger)','var(--danger-bg)'],2:['var(--idea)','var(--idea-bg)'],3:['var(--text2)','var(--mid)'],4:['var(--text3)','var(--mid)']}[t.priority];
    const selected=this.state.dbSelected.includes(t.id);
    const asg=t.assignee||this.state.settings.name||'我';
    return {
      id:t.id, title:t.title, project:t.project, due:t.due, statusLabel,
      selected, rowBg:selected?'var(--accent-bg)':'transparent',
      selBoxStyle:'width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;'+(selected?'background:var(--accent);border:1px solid var(--accent);':'border:1.5px solid var(--line2);background:var(--panel);'),
      selCheck:selected?'':'display:none;',
      toggleSel:(e)=>{ if(e&&e.stopPropagation)e.stopPropagation(); this.toggleSelect(t.id); },
      onDragStart:()=>{ this._dragId=t.id; },
      titleColor: done?'var(--text3)':'var(--text)',
      titleDeco: done?'text-decoration:line-through;':'',
      dueColor: (t.due==='今天 17:00'||t.due==='明天'||t.today)?'var(--accent-ink)':'var(--text2)',
      checkStyle:'width:18px;height:18px;border-radius:6px;display:flex;align-items:center;justify-content:center;'+(done?'background:var(--accent);border:2px solid var(--accent);':prog?'border:2px solid var(--idea);':'border:2px solid var(--line2);'),
      checkIcon: done?'':'display:none;',
      prio:'P'+t.priority,
      prioStyle:'display:inline-flex;padding:3px 8px;border-radius:6px;font:700 11px/1 var(--font);color:'+prioColors[0]+';background:'+prioColors[1]+';',
      assignee:asg, assigneeInitial:asg.slice(-1), assigneeColor:this._memberColor(asg),
      scopeColor: t.scope==='work'?'var(--accent)':'var(--idea)',
      scopeLabel: t.scope==='work'?'工作':'个人',
      open:()=>this.openTask(t.id)
    };
  }
  renderVals() {
    const st=this.state;
    const view=st.view;
    const isChat=view==='chat', isDatabase=view==='database';
    const isClarify=view==='clarify', isNonTodo=view==='nontodo', isAgent=view==='agent', isSettings=view==='settings', isAdmin=view==='admin';
    const implemented=['chat','database','clarify','nontodo','agent','settings','admin','projects'];
    const isStub=!implemented.includes(view);
    const stubMeta={clarify:['待澄清区','ph-lightbulb'],nontodo:['非 todo 隔离区','ph-tray'],agent:['Agent 配置','ph-sparkle'],settings:['设置','ph-gear'],admin:['内部只读后台','ph-chart-bar']}[view]||['',''];
    const segBase='border:0;padding:5px 12px;border-radius:7px;font:600 12.5px/1 var(--font);cursor:pointer;';
    const segOn=segBase+'background:var(--panel);color:var(--text);box-shadow:var(--shadow);';
    const segOff='border:0;padding:5px 12px;border-radius:7px;font:500 12.5px/1 var(--font);cursor:pointer;background:transparent;color:var(--text2);';
    const modeLabel=(st.workspace==='work'?'工作':'个人')+(st.privacy?' · 隐私':'');
    const modeChipStyle='display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:20px;background:var(--mid);font:600 12px/1 var(--font);color:var(--text2);';
    // feed
    const dotOf={task:'var(--accent)',idea:'var(--idea)',nono:'var(--nono)'};
    const labelOf={task:'任务',idea:'待澄清',nono:'非 todo'};
    const fq=(st.feedQuery||'').toLowerCase();
    const feed=st.feed.filter(f=>{const ref=(st.tasks.find(t=>t.id===f.refId)||st.ideas.find(i=>i.id===f.refId)||st.nonTodos.find(n=>n.id===f.refId)); return ref?this.visible(ref.scope):true;}).filter(f=>!fq||String(f.title||'').toLowerCase().includes(fq)).map(f=>({title:f.title,time:f.time,label:labelOf[f.kind],dot:dotOf[f.kind],textColor:f.kind==='nono'?'var(--text2)':'var(--text)',open:()=>this.openFeed(f)}));
    // messages
    const messages=st.messages.map(m=>({...m,isSys:m.role==='sys',isUser:m.role==='user',isAgentText:m.role==='ai'&&m.kind==='text',isTask:m.role==='ai'&&m.kind==='task',isIdea:m.role==='ai'&&m.kind==='idea',isNono:m.role==='ai'&&m.kind==='nono',isPlan:m.role==='ai'&&m.kind==='plan',isError:m.role==='ai'&&m.kind==='error',retry:()=>this.retry(m.id,m.retryText),hasRefs:!!(m.refs&&m.refs.length),open:()=>{if(m.kind==='task')this.openTask(m.refId);else if(m.kind==='idea')this.setState({view:'clarify'});}}));
    // database
    const visTasks=st.tasks.filter(t=>this.visible(t.scope));
    const counts={all:visTasks.length,today:visTasks.filter(t=>t.today).length,open:visTasks.filter(t=>t.status!=='done').length,done:visTasks.filter(t=>t.status==='done').length};
    const dbViewName={all:'全部任务',today:'今日',open:'未完成',done:'已完成'}[st.dbView];
    const rowBase='display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;font:500 13px/1 var(--font);cursor:pointer;color:var(--text2);background:transparent;';
    const rowOn='display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;font:600 13px/1 var(--font);cursor:pointer;color:var(--accent-ink);background:var(--accent-bg);';
    const dbDefs=[['all','全部任务','ph-stack'],['today','今日','ph-sun-horizon'],['open','未完成','ph-circle-dashed'],['done','已完成','ph-check-circle']];
    const dbViews=dbDefs.map(([k,name,icon])=>({name,icon,count:counts[k],style:st.dbView===k?rowOn:rowBase,select:()=>this.setState({dbView:k,mobilePane:'main'})}));
    let dbase=visTasks;
    if(st.dbProject!=='all') dbase=dbase.filter(t=>t.project===st.dbProject);
    if(st.dbPriority!=='all') dbase=dbase.filter(t=>t.priority===Number(st.dbPriority));
    const dq=(st.dbSearch||'').toLowerCase(); if(dq) dbase=dbase.filter(t=>t.title.toLowerCase().includes(dq));
    let tbl=dbase;
    if(st.dbView==='today') tbl=dbase.filter(t=>t.today);
    else if(st.dbView==='open') tbl=dbase.filter(t=>t.status!=='done');
    else if(st.dbView==='done') tbl=dbase.filter(t=>t.status==='done');
    if(st.dbSortKey){ const dir=st.dbSortDir==='asc'?1:-1; const dOrd=(d)=>{const m={'昨天':0,'今天':1,'明天':2,'后天':3,'周一':4,'周二':4,'周三':4,'周四':5,'周五':6,'下周':8,'月底':9,'待定':99};for(const k in m){if(d&&d.indexOf(k)>=0)return m[k];}return 50;}; const sOrd={todo:0,in_progress:1,done:2}; tbl=[...tbl].sort((a,b)=>{ if(st.dbSortKey==='title')return dir*a.title.localeCompare(b.title,'zh'); if(st.dbSortKey==='project')return dir*a.project.localeCompare(b.project,'zh'); if(st.dbSortKey==='priority')return dir*(a.priority-b.priority); if(st.dbSortKey==='due')return dir*(dOrd(a.due)-dOrd(b.due)); if(st.dbSortKey==='status')return dir*(sOrd[a.status]-sOrd[b.status]); return 0; }); }
    const filteredTasks=tbl.map(t=>this.fmtTask(t));
    const isTableView=st.dbLayout==='table', isBoardView=st.dbLayout==='board';
    const boardDefs=[['todo','待办','var(--text3)'],['in_progress','进行中','var(--idea)'],['done','已完成','var(--accent)']];
    const boardCols=boardDefs.map(d=>({key:d[0],name:d[1],color:d[2],count:dbase.filter(t=>t.status===d[0]).length,cards:dbase.filter(t=>t.status===d[0]).map(t=>this.fmtTask(t)),onDrop:(e)=>{if(e&&e.preventDefault)e.preventDefault(); const id=this._dragId; if(id)this.patchTask(id,{status:d[0]}); this._dragId=null;},onOver:(e)=>{if(e&&e.preventDefault)e.preventDefault();}}));
    const projectOptions=[{value:'all',label:'全部项目'}].concat([...new Set(st.tasks.map(t=>t.project))].map(p=>({value:p,label:p})));
    const priorityOptions=[{value:'all',label:'全部优先级'},{value:'1',label:'P1 紧急'},{value:'2',label:'P2 高'},{value:'3',label:'P3 中'},{value:'4',label:'P4 低'}];
    const layoutSeg=(on)=>'border:0;padding:6px 12px;border-radius:7px;font:'+(on?'600':'500')+' 12.5px/1 var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:5px;'+(on?'background:var(--panel);color:var(--text);box-shadow:var(--shadow);':'background:transparent;color:var(--text2);');
    const sortCaret=(key)=>st.dbSortKey===key?(st.dbSortDir==='asc'?'ph-caret-up':'ph-caret-down'):'ph-arrows-down-up';
    const hdrCol=(key,label)=>({label,icon:sortCaret(key),color:st.dbSortKey===key?'var(--text)':'var(--text3)',iconColor:st.dbSortKey===key?'var(--accent-ink)':'var(--text3)',sort:()=>this.toggleSort(key)});
    const hdrTitle=hdrCol('title'), hdrProject=hdrCol('project'), hdrDue=hdrCol('due'), hdrPriority=hdrCol('priority');
    const selIds=filteredTasks.map(t=>t.id);
    const allSelected=selIds.length>0 && selIds.every(id=>st.dbSelected.includes(id));
    const selAllBoxStyle='width:17px;height:17px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;'+(allSelected?'background:var(--accent);border:1px solid var(--accent);':'border:1.5px solid var(--line2);background:var(--panel);');
    // detail
    const dt=st.tasks.find(t=>t.id===st.detailId)||null;
    const detailOpen=!!dt;
    const canEdit=st.role!=='viewer', isViewer=st.role==='viewer', canAdmin=st.role==='admin';
    const roleLabel={admin:'管理员',member:'成员',viewer:'只读'}[st.role];
    const showAdminContent=isAdmin&&canAdmin, showAdminDenied=isAdmin&&!canAdmin;
    const dAssignee=dt?(dt.assignee||st.settings.name||'我'):'';
    const mChipOn='display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 5px;border-radius:20px;cursor:pointer;font:600 12px/1 var(--font);border:1px solid var(--accent);background:var(--accent-bg);color:var(--accent-ink);';
    const mChipOff='display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 5px;border-radius:20px;cursor:pointer;font:600 12px/1 var(--font);border:1px solid var(--line2);background:var(--panel);color:var(--text2);';
    const memberNames=[...new Set([st.settings.name||'我',...st.tasks.map(t=>t.assignee).filter(Boolean)])];
    const detailMembers=memberNames.map(nm=>({name:nm,initial:nm.slice(-1),color:this._memberColor(nm),style:dAssignee===nm?mChipOn:mChipOff,assign:()=>this.assignTask(st.detailId,nm)}));
    const dtab=st.detailTab;
    const subsArr=dt?(st.taskSubs[dt.id]||[]):[];
    const subs=subsArr.map(x=>({text:x.text,done:x.done,boxStyle:'width:16px;height:16px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer;'+(x.done?'background:var(--accent);border:1px solid var(--accent);':'border:1.5px solid var(--line2);background:var(--bg);'),check:x.done?'':'display:none;',textStyle:'flex:1;font:500 13px/1.5 var(--font);color:'+(x.done?'var(--text3)':'var(--text)')+';'+(x.done?'text-decoration:line-through;':''),toggle:()=>this.toggleSub(x.id)}));
    const subDone=subsArr.filter(x=>x.done).length;
    const comments=(dt?(st.taskComments[dt.id]||[]):[]).map(c=>({author:c.author,text:c.text,time:c.time,initial:c.author.slice(-1),color:this._memberColor(c.author)}));
    const activity=dt?((st.taskActivity[dt.id]&&st.taskActivity[dt.id].length)?st.taskActivity[dt.id]:[{text:'任务已创建',time:dt.gen}]):[];
    const visNotifs=st.notifications.filter(n=>st.settings.notifPrefs[n.type]!==false);
    const unread=visNotifs.filter(n=>!n.read).length;
    const notifs=visNotifs.map(n=>({icon:n.icon,color:n.color,text:n.text,time:n.time,dot:n.read?'transparent':n.color}));
    const pal=this.buildPalette(); const paletteGroups=pal.groups.map(g=>({name:g.name,items:g.items.map(it=>({icon:it.icon,label:it.label,run:it.run,bg:it.flatIdx===(st.paletteIndex||0)?'var(--mid)':'transparent'}))}));
    const isProjects=view==='projects';
    const projList=st.projects.map(p=>{ const ts=st.tasks.filter(t=>t.project===p.name&&this.visible(t.scope)); const done=ts.filter(t=>t.status==='done').length; return {name:p.name,desc:p.desc,color:p.color,count:ts.length,done,pct:ts.length?Math.round(done/ts.length*100):0,bg:st.selProjectId===p.id?'var(--accent-bg)':'transparent',select:()=>this.setState({selProjectId:p.id,mobilePane:'main'})}; });
    const selProject=st.projects.find(p=>p.id===st.selProjectId)||st.projects[0];
    const spTasks=selProject?st.tasks.filter(t=>t.project===selProject.name&&this.visible(t.scope)).map(t=>this.fmtTask(t)):[];
    const spDone=selProject?st.tasks.filter(t=>t.project===selProject.name&&t.status==='done'&&this.visible(t.scope)).length:0;
    const spPct=spTasks.length?Math.round(spDone/spTasks.length*100):0;
    const pS=(n)=>dt&&dt.priority===n?segOn:segOff;
    const stS=(k)=>dt&&dt.status===k?segOn:segOff;
    const liOff='display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;cursor:pointer;background:transparent;color:var(--text2);';
    const liOn='display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;cursor:pointer;background:var(--accent-bg);color:var(--accent-ink);';
    const visIdeas=st.ideas.filter(i=>this.visible(i.scope));
    const selIdea=st.ideas.find(i=>i.id===st.selIdeaId&&this.visible(i.scope))||visIdeas[0]||null;
    const ideaList=visIdeas.map(i=>({title:i.title,preview:i.raw,bg:(selIdea&&i.id===selIdea.id)?'var(--accent-bg)':'transparent',select:()=>this.setState({selIdeaId:i.id,mobilePane:'main'})}));
    const visNon=st.nonTodos.filter(n=>this.visible(n.scope));
    const selNon=st.nonTodos.find(n=>n.id===st.selNonId&&this.visible(n.scope))||visNon[0]||null;
    const destLabel={copy:'建议复制',export:'建议导出',archive:'建议归档',discard:'建议删除'};
    const nonList=visNon.map(n=>({title:n.title,preview:n.text,dest:destLabel[n.dest]||'建议归档',bg:(selNon&&n.id===selNon.id)?'var(--accent-bg)':'transparent',select:()=>this.setState({selNonId:n.id,mobilePane:'main'})}));
    const agentDefs=[['soul','人格 Soul','ph-fingerprint','人格、原则、语气、决策倾向'],['memory','记忆 Memory','ph-brain','长期背景、固定项目、用户习惯'],['preferences','偏好','ph-sliders-horizontal','输出偏好、排序偏好、沟通偏好'],['workingStyle','工作方式','ph-strategy','GTD、时间块等方法论偏好'],['privacyRules','隐私规则','ph-lock-simple','哪些内容默认 work / personal，AI 何时不可读取'],['followup','追问策略','ph-chats-circle','任务不清楚时如何追问']];
    const agentSections=agentDefs.map(d=>({name:d[1],icon:d[2],style:st.agentSection===d[0]?liOn:liOff,select:()=>this.setState({agentSection:d[0],mobilePane:'main'})}));
    const agCur=agentDefs.find(d=>d[0]===st.agentSection)||agentDefs[0];
    const setDefs=[['account','账号','ph-user-circle'],['general','通用','ph-sliders-horizontal'],['ai','AI 接入','ph-plugs-connected'],['notifications','通知','ph-bell'],['privacy','隐私与安全','ph-shield-check'],['data','数据','ph-database']];
    const setSections=setDefs.map(d=>({name:d[1],icon:d[2],style:st.setSection===d[0]?liOn:liOff,select:()=>this.setState({setSection:d[0],mobilePane:'main'})}));
    const setName={account:'账号',general:'通用',ai:'AI 接入',notifications:'通知',privacy:'隐私与安全',data:'数据'}[st.setSection];
    const setViewOpts=[{value:'chat',label:'聊天'},{value:'database',label:'Todo 数据库'},{value:'projects',label:'项目'}];
    const setSw=(on)=>({track:'width:38px;height:22px;border-radius:12px;cursor:pointer;flex:0 0 auto;position:relative;background:'+(on?'var(--accent)':'var(--line2)')+';',knob:'position:absolute;top:3px;left:'+(on?'19px':'3px')+';width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0003;'});
    // 内部后台：真实用户 / 生成记录 / 异常（仅 admin，可见 fetchAdmin）
    const userList=st.adminUsers.map(u=>({name:u.name,email:u.email,status:u.errorCount>0?(u.errorCount+' 失败'):'正常',err:u.errorCount>0,initial:(u.name||'?').slice(-1),bg:st.adminSelId===u.id?'var(--accent-bg)':'transparent',select:()=>{this.fetchAdminUser(u.id);this.setState({mobilePane:'main'});}}));
    const selUser=st.adminUsers.find(u=>u.id===st.adminSelId)||st.adminUsers[0]||null;
    const kindMeta={task:['任务','var(--accent)'],todo_idea:['待澄清','var(--idea)'],non_todo:['非 todo','var(--nono)']};
    const adminLog=st.adminRecords.map(r=>({raw:r.rawInput,kind:(kindMeta[r.aiKind]||['其他','var(--text3)'])[0],kc:(kindMeta[r.aiKind]||['其他','var(--text3)'])[1],result:r.resultTitle||'（已删除）',gen:lxFmtDue(r.createdAt)}));
    const adminErrors=st.adminUserErrors.map(e=>({raw:e.rawInput,errType:(e.message||'').slice(0,40)||'未知错误',time:lxFmtDue(e.createdAt),user:selUser?selUser.name:'',status:'failed',failed:true,stColor:'var(--danger)',stBg:'var(--danger-bg)'}));
    const errorCount=selUser?(selUser.errorCount||0):0;
    const mob=st.isMobile, pane=st.mobilePane, showList=pane==='list';
    let shellStyle,railStyle,paneWrapStyle,midStyle,mainStyle,bottomNavStyle,showBack;
    if(!mob){
      shellStyle='display:flex;height:100vh;';
      railStyle='width:66px;flex:0 0 66px;background:var(--rail);border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:5px;z-index:5;';
      paneWrapStyle='flex:1;display:flex;min-width:0;position:relative;';
      midStyle='width:304px;flex:0 0 304px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-width:0;';
      mainStyle='flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;background:var(--bg);';
      bottomNavStyle='display:none;'; showBack=false;
    } else {
      shellStyle='display:flex;flex-direction:column;height:100vh;';
      railStyle='display:none;';
      paneWrapStyle='flex:1;display:flex;min-width:0;position:relative;overflow:hidden;';
      midStyle=showList?'flex:1;min-width:0;width:100%;background:var(--panel);display:flex;flex-direction:column;':'display:none;';
      mainStyle=showList?'display:none;':'flex:1;min-width:0;min-height:0;width:100%;display:flex;flex-direction:column;position:relative;background:var(--bg);';
      bottomNavStyle='display:flex;flex:0 0 auto;border-top:1px solid var(--line);background:var(--panel);padding:6px 2px;';
      showBack=!showList;
    }
    const navDefs2=[['chat','ph-chat-circle'],['database','ph-table'],['projects','ph-folders'],['clarify','ph-lightbulb'],['nontodo','ph-tray'],['settings','ph-gear']];
    const mobileNav=navDefs2.map(d=>({icon:d[1],color:view===d[0]?'var(--accent-ink)':'var(--text3)',bg:view===d[0]?'var(--accent-bg)':'transparent',go:()=>this.go(d[0])}));
    const mentionItems=this.mentionCandidates().map((x,idx)=>({label:x.label,icon:x.type==='project'?'ph-folder':'ph-check-square',typeLabel:x.type==='project'?'项目':'任务',bg:idx===(st.mentionIndex||0)?'var(--mid)':'transparent',pick:()=>this.pickMention(x)}));
    const pendingRefsView=st.pendingRefs.map(r=>({label:r.label,remove:()=>this.removeRef(r.id)}));
    return {
      showLogin:!st.authed, authed:st.authed,
      isMobile:mob, shellStyle, railStyle, paneWrapStyle, midStyle, mainStyle, bottomNavStyle, showBack, mobileNav, back:()=>this.setState({mobilePane:'list'}),
      mentionOpen:st.mentionOpen, mentionItems, noMention:mentionItems.length===0, pendingRefs:pendingRefsView, hasPendingRefs:st.pendingRefs.length>0, onComposerInput:(e)=>this.onComposerInput(e), atButton:()=>this.atButton(),
      authMode:st.authMode, isRegister:st.authMode==='register', authName:st.authName, authEmail:st.authEmail, authPassword:st.authPassword, authError:st.authError, authBusy:st.authBusy,
      onAuthName:(e)=>this.setState({authName:e.target.value}), onAuthEmail:(e)=>this.setState({authEmail:e.target.value}), onAuthPassword:(e)=>this.setState({authPassword:e.target.value}),
      switchAuthMode:()=>this.setState(s=>({authMode:s.authMode==='login'?'register':'login', authError:''})),
      submitAuth:()=>this.submitAuth(), authKey:(e)=>{ if(e.key==='Enter'){ e.preventDefault(); this.submitAuth(); } },
      toggleTheme:()=>this.toggleTheme(),
      goChat:()=>this.go('chat'), goDatabase:()=>this.go('database'), goClarify:()=>this.go('clarify'), goNonTodo:()=>this.go('nontodo'), goAgent:()=>this.go('agent'), goSettings:()=>this.go('settings'), goAdmin:()=>this.go('admin'),
      isChat, isDatabase, isStub, stubName:stubMeta[0], stubIcon:stubMeta[1],
      view,
      workspace:st.workspace, privacy:st.privacy,
      setWork:()=>{ this.setState({workspace:'work'}); api.updateSettings({workspaceMode:'work'}).catch(()=>{}); }, setPersonal:()=>{ this.setState({workspace:'personal'}); api.updateSettings({workspaceMode:'personal'}).catch(()=>{}); },
      togglePrivacy:()=>this.setState(s=>({privacy:!s.privacy}), ()=>api.updateSettings({privacyMode:this.state.privacy}).catch(()=>{})),
      wsWorkStyle: st.workspace==='work'?segOn:segOff,
      wsPersonalStyle: st.workspace==='personal'?segOn:segOff,
      privBtnStyle:'width:30px;height:30px;border:0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;'+(st.privacy?'background:var(--accent-bg);color:var(--accent-ink);':'background:var(--mid);color:var(--text3);'),
      modeLabel, modeChipStyle, modeIcon: st.privacy?'ph-lock-simple':'ph-briefcase',
      feed, feedCount:feed.length, feedEmpty:feed.length===0, feedQuery:st.feedQuery, onFeedQuery:(e)=>this.setState({feedQuery:e.target.value}),
      messages, thinking:st.thinking, thinkText:st.thinkText||'正在分析意图…',
      send:()=>this.send(), sendKey:(e)=>{ if(this.state.mentionOpen){ const n=this.mentionCandidates().length; if(e.key==='ArrowDown'){e.preventDefault();this.setState(s=>({mentionIndex:Math.min((s.mentionIndex||0)+1,Math.max(0,n-1))}));return;} if(e.key==='ArrowUp'){e.preventDefault();this.setState(s=>({mentionIndex:Math.max((s.mentionIndex||0)-1,0)}));return;} if(e.key==='Escape'){e.preventDefault();this.setState({mentionOpen:false});return;} } if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.mentionEnterOrSend();} },
      taskTotal:visTasks.length,
      dbViews, dbViewName, filteredCount:filteredTasks.length, filteredTasks, tableEmpty:filteredTasks.length===0,
      newCapture:()=>{ this.go('chat'); setTimeout(()=>{const c=document.getElementById('lx-composer'); if(c)c.focus();},80); },
      dbLayout:st.dbLayout, isTableView, isBoardView, setTable:()=>this.setDbLayout('table'), setBoard:()=>this.setDbLayout('board'), tableSegStyle:layoutSeg(isTableView), boardSegStyle:layoutSeg(isBoardView),
      dbSearch:st.dbSearch, onDbSearch:(e)=>this.setState({dbSearch:e.target.value}),
      dbProject:st.dbProject, onDbProject:(e)=>this.setState({dbProject:e.target.value}), projectOptions,
      dbPriority:st.dbPriority, onDbPriority:(e)=>this.setState({dbPriority:e.target.value}), priorityOptions,
      hdrTitle, hdrProject, hdrDue, hdrPriority, boardCols,
      selectedCount:st.dbSelected.length, hasSelection:st.dbSelected.length>0, allSelected, allSelectedCheck:allSelected?'':'display:none;', selAllBoxStyle, onSelectAll:()=>this.selectAll(selIds), clearSel:()=>this.clearSel(),
      batchDone:()=>this.batchStatus('done'), batchProg:()=>this.batchStatus('in_progress'), batchP1:()=>this.batchPriority(1), batchMoveOut:()=>this.batchMoveOut(), batchDelete:()=>this.batchDelete(),
      detailOpen,
      dTitle:dt?dt.title:'', dProject:dt?dt.project:'', dDue:dt?dt.due:'', dNotes:dt?dt.notes:'', dRaw:dt?dt.raw:'', dReason:dt?dt.reason:'', dConf:dt?dt.conf:'', dGen:dt?dt.gen:'', dEdited:dt?(dt.edited?'用户已修改过':'未被修改'):'',
      onTitle:(e)=>this.patchTask(st.detailId,{title:e.target.value}),
      onNotes:(e)=>this.patchTask(st.detailId,{notes:e.target.value}),
      setTodo:()=>this.dSetStatus('todo'), setProg:()=>this.dSetStatus('in_progress'), setDone:()=>this.dSetStatus('done'),
      stTodoStyle:stS('todo'), stProgStyle:stS('in_progress'), stDoneStyle:stS('done'),
      setP1:()=>this.patchTask(st.detailId,{priority:1}), setP2:()=>this.patchTask(st.detailId,{priority:2}), setP3:()=>this.patchTask(st.detailId,{priority:3}), setP4:()=>this.patchTask(st.detailId,{priority:4}),
      p1Style:pS(1), p2Style:pS(2), p3Style:pS(3), p4Style:pS(4),
      closeDetail:()=>this.setState({detailId:null}),
      moveOut:()=>this.moveOut(st.detailId),
      isClarify, isNonTodo, isAgent, isSettings, isAdmin,
      ideaList, clarifyCount:visIdeas.length, hasIdea:!!selIdea, noIdea:!selIdea,
      ciTitle:selIdea?selIdea.title:'', ciRaw:selIdea?selIdea.raw:'', ciReason:selIdea?selIdea.reason:'', ciSuggest:selIdea?selIdea.suggest:'', ciGen:selIdea?selIdea.gen:'', ciScope:selIdea?(selIdea.scope==='work'?'工作':'个人'):'',
      convertIdea:()=>selIdea&&this.convertIdea(selIdea.id), discardIdea:()=>selIdea&&this.discardIdea(selIdea.id),
      nonList, nonCount:visNon.length, hasNon:!!selNon, noNon:!selNon,
      cnTitle:selNon?selNon.title:'', cnText:selNon?selNon.text:'', cnRaw:selNon?selNon.raw:'', cnReason:selNon?selNon.reason:'', cnDest:selNon?(destLabel[selNon.dest]||'建议归档'):'', cnGen:selNon?selNon.gen:'',
      nonConvert:()=>selNon&&this.nonConvert(selNon.id), nonArchive:()=>selNon&&this.removeNon(selNon.id,'已归档'), nonDelete:()=>selNon&&this.removeNon(selNon.id,'已删除'), nonCopy:()=>this.copyNonText(), nonExport:()=>this.exportNonMd(),
      agentSections, agName:agCur[1], agDesc:agCur[3], agValue:st.agent[st.agentSection], onAgent:(e)=>this.updateAgent(st.agentSection,e.target.value), saveAgent:()=>this.flashToast('Agent 配置已保存'),
      setSections, setName,
      isSetAccount:st.setSection==='account', isSetGeneral:st.setSection==='general', isSetAi:st.setSection==='ai', isSetNotif:st.setSection==='notifications', isSetPrivacy:st.setSection==='privacy', isSetData:st.setSection==='data',
      sName:st.settings.name, sEmail:st.settings.email, meBig:(st.settings.name||'我').slice(-1), onName:(e)=>{ const v=e.target.value; this.setState(s=>({settings:{...s.settings,name:v}})); if(v.trim()) api.updateMe({name:v.trim()}).catch(()=>{}); },
      changePwd:()=>this.setState(s=>({pwdOpen:!s.pwdOpen,pwdOld:'',pwdNew:''})),
      pwdOpen:st.pwdOpen, pwdOld:st.pwdOld, pwdNew:st.pwdNew, pwdBusy:st.pwdBusy,
      onPwdOld:(e)=>this.setState({pwdOld:e.target.value}), onPwdNew:(e)=>this.setState({pwdNew:e.target.value}), submitPwd:()=>this.submitPwd(),
      sDefaultWork:st.settings.defaultWs==='work'?segOn:segOff, sDefaultPersonal:st.settings.defaultWs==='personal'?segOn:segOff, setDefWork:()=>this.updateSetting('defaultWs','work'), setDefPersonal:()=>this.updateSetting('defaultWs','personal'),
      themeLightStyle:st.theme==='light'?segOn:segOff, themeDarkStyle:st.theme==='dark'?segOn:segOff,
      setThemeLight:()=>{ if(this.state.theme!=='light') this.toggleTheme(); }, setThemeDark:()=>{ if(this.state.theme!=='dark') this.toggleTheme(); },
      sDefaultView:st.settings.defaultView, onDefaultView:(e)=>this.updateSetting('defaultView',e.target.value), viewOptions:setViewOpts,
      aiPreset:st.settings.aiPreset, aiPresetOptions:this._aiPresets.map(p=>({value:p.name,label:p.name})), onAiPreset:(e)=>{ const p=this._aiPresets.find(x=>x.name===e.target.value); if(p) this.pickAiPreset(p); },
      aiPresetHint:(this._aiPresets.find(p=>p.name===st.settings.aiPreset)||{}).hint||'', aiIsRule:st.settings.aiProvider==='rule',
      aiBaseUrl:st.settings.aiBaseUrl, aiModel:st.settings.aiModel, onAiBaseUrl:(e)=>this.setAiField('aiBaseUrl',e.target.value), onAiModel:(e)=>this.setAiField('aiModel',e.target.value),
      sApiKey:st.settings.apiKey, aiHasKey:st.settings.aiHasKey, onApiKey:(e)=>this.setAiField('apiKey',e.target.value),
      aiFallbackTrack:setSw(st.settings.aiFallback!==false).track, aiFallbackKnob:setSw(st.settings.aiFallback!==false).knob, toggleAiFallback:()=>this.setAiField('aiFallback',!(st.settings.aiFallback!==false)),
      aiTested:st.settings.aiTested, testConn:()=>this.testConn(),
      npAssignTrack:setSw(st.settings.notifPrefs.assign).track, npAssignKnob:setSw(st.settings.notifPrefs.assign).knob, toggleNpAssign:()=>this.toggleNotifPref('assign'),
      npDueTrack:setSw(st.settings.notifPrefs.due).track, npDueKnob:setSw(st.settings.notifPrefs.due).knob, toggleNpDue:()=>this.toggleNotifPref('due'),
      npFailTrack:setSw(st.settings.notifPrefs.fail).track, npFailKnob:setSw(st.settings.notifPrefs.fail).knob, toggleNpFail:()=>this.toggleNotifPref('fail'),
      npDoneTrack:setSw(st.settings.notifPrefs.done).track, npDoneKnob:setSw(st.settings.notifPrefs.done).knob, toggleNpDone:()=>this.toggleNotifPref('done'),
      sVisScope:st.settings.aiVisibility==='visible_scope_only'?segOn:segOff, sVisAll:st.settings.aiVisibility==='all_todo'?segOn:segOff, setVisScope:()=>this.updateSetting('aiVisibility','visible_scope_only'), setVisAll:()=>this.updateSetting('aiVisibility','all_todo'),
      pmTrack:setSw(st.settings.privacyDefault).track, pmKnob:setSw(st.settings.privacyDefault).knob, togglePm:()=>this.updateSetting('privacyDefault',!st.settings.privacyDefault),
      saveSettings:()=>{ api.updateAiConfig(this._aiCfg()).then(()=>{ this.setState(s=>({settings:{...s.settings,apiKey:''}})); this.flashToast('AI 接入配置已保存'); }).catch(e=>this.flashToast('保存失败：'+e.message)); }, exportData:()=>this.doExport(), clearData:()=>this.doClearData(), logout:()=>this.doLogout(),
      userList, hasAdminUser:!!selUser, adminLoading:st.adminLoading, auName:selUser?selUser.name:'—', auEmail:selUser?selUser.email:'', auStatus:selUser?(selUser.errorCount>0?(selUser.errorCount+' 失败'):'正常'):'', auRole:selUser?({admin:'管理员',member:'成员'}[selUser.role]||selUser.role):'', auTasks:selUser?selUser.taskCount:0, auIdeas:selUser?selUser.ideaCount:0, auNon:selUser?selUser.nonCount:0, auErr:!!(selUser&&selUser.errorCount>0), adminLog, hasAdminLog:adminLog.length>0,
      adminErrors, hasAdminErrors:adminErrors.length>0, hasErrors:errorCount>0, errorCount,
      canEdit, isViewer, canAdmin, roleLabel, showAdminContent, showAdminDenied,
      detailMembers, dAssignee, dAssigneeInitial:dAssignee.slice(-1), dAssigneeColor:this._memberColor(dAssignee),
      isDetailTab:dtab==='detail', isCommentTab:dtab==='comments', isActivityTab:dtab==='activity', tabDetail:()=>this.setState({detailTab:'detail'}), tabComments:()=>this.setState({detailTab:'comments'}), tabActivity:()=>this.setState({detailTab:'activity'}),
      dTabDetailStyle:dtab==='detail'?segOn:segOff, dTabCommentStyle:dtab==='comments'?segOn:segOff, dTabActStyle:dtab==='activity'?segOn:segOff,
      subs, subCount:subsArr.length, subDone, hasSubs:subsArr.length>0, addSub:()=>this.addSub(), subKey:(e)=>{if(e.key==='Enter'){e.preventDefault();this.addSub();}},
      comments, hasComments:comments.length>0, addComment:()=>this.addComment(), cmtKey:(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.addComment();}}, activity,
      notifOpen:st.notifOpen, toggleNotif:()=>this.setState(s=>({notifOpen:!s.notifOpen})), closeNotif:()=>this.setState({notifOpen:false}), notifs, unread, hasUnread:unread>0, markAllRead:()=>{ this.setState(s=>({notifications:s.notifications.map(n=>({...n,read:true}))})); api.markAllNotificationsRead().catch(()=>{}); },
      searchOpen:st.searchOpen, openSearch:()=>this.setState({searchOpen:true,searchQuery:'',paletteIndex:0}), closeSearch:()=>this.setState({searchOpen:false}), searchQuery:st.searchQuery, onSearch:(e)=>this.setState({searchQuery:e.target.value,paletteIndex:0}), paletteGroups, paletteKey:(e)=>this.paletteKey(e), stop:(e)=>{if(e&&e.stopPropagation)e.stopPropagation();}, shortcutsOpen:st.shortcutsOpen, toggleShortcuts:()=>this.setState(s=>({shortcutsOpen:!s.shortcutsOpen})), closeShortcuts:()=>this.setState({shortcutsOpen:false}),
      isProjects, goProjects:()=>this.go('projects'), projList, spName:selProject?selProject.name:'', spDesc:selProject?selProject.desc:'', spColor:selProject?selProject.color:'var(--accent)', spTasks, spCount:spTasks.length, spDone, spPct,
      toast:st.toast
    };
  }
}

export default {
  name: 'LinXApp',
  setup() {
    const inst = new Component();
    inst.state = reactive(inst.state);
    inst.setState = function (patch, cb) {
      const p = (typeof patch === 'function') ? patch(this.state) : patch;
      if (p) Object.assign(this.state, p);
      if (cb) nextTick(() => cb());
    };
    const vm = computed(() => inst.renderVals());
    onMounted(() => { if (inst.componentDidMount) inst.componentDidMount(); });
    onUpdated(() => { if (inst.componentDidUpdate) inst.componentDidUpdate(); });
    onBeforeUnmount(() => { if (inst.componentWillUnmount) inst.componentWillUnmount(); });
    return { vm };
  }
};
</script>
