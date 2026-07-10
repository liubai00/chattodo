// localStorage key 集中。本文件只收「跨域共享 / 应用层」键（当前为各视图分栏宽度）。
// 认证令牌键 TOKEN_KEY 属 infrastructure 层（见 @/infrastructure/request/token），
// 因 infrastructure 不可依赖 shared，故不在此重复声明（单一来源在 token.ts）。
export const STORAGE_KEYS = {
  /** 聊天视图左栏宽度 */
  PANE_CHAT: 'lx_pane_chat',
  /** 项目视图左栏宽度 */
  PANE_PROJECTS: 'lx_pane_projects',
  /** 数据库视图导航栏宽度 */
  PANE_DB: 'lx_pane_db',
  /** 非 todo 视图左栏宽度 */
  PANE_NONTODO: 'lx_pane_nontodo',
  /** 待澄清视图左栏宽度 */
  PANE_CLARIFY: 'lx_pane_clarify',
} as const
