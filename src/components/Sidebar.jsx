import { useStore } from '../store'
import { SCOPE_LABEL } from '../lib/utils'

const NAV = [
  { key: 'dashboard', label: '工作台', ico: '◧', group: '主系统' },
  { key: 'inbox', label: 'Todo Inbox', ico: '✦', group: '主系统' },
  { key: 'database', label: 'Todo 数据库', ico: '☰', group: '主系统' },
  { key: 'nontodo', label: 'NonTodo 隔离', ico: '◇', group: '隔离区', isolation: true },
  { key: 'agent', label: 'Agent 设置', ico: '⚙', group: '设置' },
  { key: 'settings', label: 'App 设置', ico: '⊟', group: '设置' },
]

export default function Sidebar({ page, setPage }) {
  const { state, visible } = useStore()
  const counts = {
    inbox: visible.todoIdeas.filter((i) => i.status === 'clarifying').length,
    database: visible.tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').length,
    nontodo: visible.nonTodoOutputs.length,
  }

  let lastGroup = null
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div>
          <div className="brand-name">Chattodo</div>
          <div className="brand-sub">AI 想法处理器</div>
        </div>
      </div>

      {NAV.map((item) => {
        const showLabel = item.group !== lastGroup
        lastGroup = item.group
        return (
          <div key={item.key}>
            {showLabel && <div className="nav-section-label">{item.group}</div>}
            <button
              className={`nav-item ${item.isolation ? 'isolation' : ''} ${page === item.key ? 'active' : ''}`}
              onClick={() => setPage(item.key)}
            >
              <span className="ico">{item.ico}</span>
              <span>{item.label}</span>
              {counts[item.key] > 0 && <span className="count">{counts[item.key]}</span>}
            </button>
          </div>
        )
      })}

      <div className="sidebar-footer">
        <div className="scope-pill">
          <span className={`scope-dot ${state.appSettings.workspaceMode}`} />
          {SCOPE_LABEL[state.appSettings.workspaceMode]}空间
          {state.appSettings.privacyMode && ' · 隐私模式'}
        </div>
      </div>
    </aside>
  )
}
