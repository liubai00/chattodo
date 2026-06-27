import { useStore } from '../store'

const TITLES = {
  dashboard: '工作台',
  inbox: 'Todo Inbox',
  database: 'Todo 数据库',
  nontodo: 'NonTodo 隔离输出',
  agent: 'Agent 设置',
  settings: 'App 设置',
}

export default function Topbar({ page }) {
  const { state, actions } = useStore()
  const { workspaceMode, privacyMode } = state.appSettings

  return (
    <header className="topbar">
      <h1>{TITLES[page]}</h1>
      <div className="spacer" />

      <div className="seg" role="group" aria-label="工作空间">
        <button
          className={workspaceMode === 'work' ? 'on' : ''}
          onClick={() => actions.updateSettings({ workspaceMode: 'work' })}
        >
          工作
        </button>
        <button
          className={workspaceMode === 'personal' ? 'on' : ''}
          onClick={() => actions.updateSettings({ workspaceMode: 'personal' })}
        >
          个人
        </button>
      </div>

      <button
        className={`privacy-toggle ${privacyMode ? 'on' : ''}`}
        onClick={() => actions.updateSettings({ privacyMode: !privacyMode })}
        title="隐私模式：仅展示当前空间可见内容"
      >
        <span className="switch" />
        隐私模式
      </button>
    </header>
  )
}
