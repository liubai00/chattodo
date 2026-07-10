// 主题应用：设置 data-theme 属性 + 把 Attio token 子集写入 body 内联变量
// （供旧 App.vue 的大量内联样式 var(--bg) 等引用），并同步 rail 上的主题图标。
// 旧 App.applyTheme 与新视图共用本模块，避免迁移期出现两套主题逻辑。
// 注：light/dark 映射相同--真正的明暗切换由 tokens.css 响应 data-theme 驱动；
//     --accent 故意不在此列（会与 :root 的 --accent 形成自引用）。

import type { Theme } from '@/shared/enums/theme'
export type { Theme }

const TOK: Record<Theme, Record<string, string>> = {
  light: {
    '--bg': 'var(--surface-sunken)', '--panel': 'var(--surface-base)', '--mid': 'var(--surface-hover)',
    '--rail': 'var(--surface-sunken)', '--elev': 'var(--surface-raised)', '--text': 'var(--text-primary)',
    '--text2': 'var(--text-secondary)', '--text3': 'var(--text-tertiary)', '--line': 'var(--border-default)',
    '--line2': 'var(--border-strong)', '--accent-ink': 'var(--accent-active)', '--accent-bg': 'var(--accent-soft)',
    '--idea': 'var(--status-warning)', '--idea-bg': 'var(--status-warning-soft)', '--nono': 'var(--text-tertiary)',
    '--nono-bg': 'var(--surface-active)', '--danger': 'var(--status-error)', '--danger-bg': 'var(--status-error-soft)',
    '--shadow': 'var(--shadow-md)',
  },
  dark: {
    '--bg': 'var(--surface-sunken)', '--panel': 'var(--surface-base)', '--mid': 'var(--surface-hover)',
    '--rail': 'var(--surface-sunken)', '--elev': 'var(--surface-raised)', '--text': 'var(--text-primary)',
    '--text2': 'var(--text-secondary)', '--text3': 'var(--text-tertiary)', '--line': 'var(--border-default)',
    '--line2': 'var(--border-strong)', '--accent-ink': 'var(--accent-active)', '--accent-bg': 'var(--accent-soft)',
    '--idea': 'var(--status-warning)', '--idea-bg': 'var(--status-warning-soft)', '--nono': 'var(--text-tertiary)',
    '--nono-bg': 'var(--surface-active)', '--danger': 'var(--status-error)', '--danger-bg': 'var(--status-error-soft)',
    '--shadow': 'var(--shadow-md)',
  },
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light')
  const m = TOK[theme]
  for (const p in m) document.body.style.setProperty(p, m[p])
  const ic = document.getElementById('lx-thm'); if (ic) ic.className = 'ph ph-' + (theme === 'dark' ? 'sun' : 'moon')
  const ic2 = document.getElementById('lx-thm2'); if (ic2) ic2.className = 'ph ph-' + (theme === 'dark' ? 'sun' : 'moon')
}
