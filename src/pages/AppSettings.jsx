import { useStore } from '../store'

function Choices({ value, options, onChange }) {
  return (
    <div className="choice-row">
      {options.map((o) => (
        <button
          key={o.value}
          className={`choice ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function AppSettings() {
  const { state, actions } = useStore()
  const s = state.appSettings

  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>App 设置</h2>
        <p>管理空间、隐私与默认视图。隐私模式会过滤主系统与隔离区的展示。</p>
      </div>

      <div className="form-card">
        <div className="field">
          <label>当前空间</label>
          <div className="hint">切换工作 / 个人空间。隐私模式开启时只展示对应空间内容。</div>
          <Choices
            value={s.workspaceMode}
            options={[
              { value: 'work', label: '工作 work' },
              { value: 'personal', label: '个人 personal' },
            ]}
            onChange={(v) => actions.updateSettings({ workspaceMode: v })}
          />
        </div>

        <div className="field">
          <label>隐私模式</label>
          <div className="hint">开启后：work 模式只展示 work / mixed；AI 计划只读取当前可见内容。</div>
          <Choices
            value={s.privacyMode ? 'on' : 'off'}
            options={[
              { value: 'off', label: '关闭' },
              { value: 'on', label: '开启' },
            ]}
            onChange={(v) => actions.updateSettings({ privacyMode: v === 'on' })}
          />
        </div>

        <div className="field">
          <label>默认视图</label>
          <div className="hint">每天打开后默认进入的页面。</div>
          <Choices
            value={s.defaultView}
            options={[
              { value: 'dashboard', label: '工作台' },
              { value: 'inbox', label: 'Inbox' },
              { value: 'database', label: '数据库' },
            ]}
            onChange={(v) => actions.updateSettings({ defaultView: v })}
          />
        </div>

        <div className="field">
          <label>AI 可见范围</label>
          <div className="hint">控制 AI 制定计划时能读取的数据范围。</div>
          <Choices
            value={s.aiVisibility}
            options={[
              { value: 'visible_scope_only', label: '仅当前可见范围' },
              { value: 'all_todo', label: '全部 todo' },
            ]}
            onChange={(v) => actions.updateSettings({ aiVisibility: v })}
          />
        </div>
      </div>

      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 14 }}>
        设置即时生效（原型阶段使用内存状态，刷新后回到初始数据）。
      </p>
    </div>
  )
}
