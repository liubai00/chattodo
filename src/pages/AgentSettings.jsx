import { useState } from 'react'
import { useStore } from '../store'

const FIELDS = [
  { key: 'soul', label: 'Soul · 人格', hint: '人格、原则、语气、决策倾向。' },
  { key: 'memory', label: 'Memory · 长期记忆', hint: '长期背景、固定项目、用户习惯。' },
  { key: 'preferences', label: 'Preferences · 偏好', hint: '输出偏好、排序偏好、沟通偏好。' },
  { key: 'workingStyle', label: 'Working Style · 工作方法', hint: 'GTD、OmniFocus、时间块等方法论偏好。' },
  { key: 'privacyRules', label: 'Privacy Rules · 隐私规则', hint: '默认 work/personal，AI 何时不能读取。' },
  { key: 'defaultFollowupStrategy', label: 'Followup · 追问策略', hint: '任务不清楚时如何追问。' },
]

export default function AgentSettings() {
  const { state, actions } = useStore()
  const [draft, setDraft] = useState(state.agentProfile)
  const [saved, setSaved] = useState(false)

  function save() {
    actions.updateAgent(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const dirty = FIELDS.some((f) => draft[f.key] !== state.agentProfile[f.key])

  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>Agent 设置</h2>
        <p>管理 agent 的人格、记忆与行为。也可以在右侧聊天框用自然语言修改。</p>
      </div>

      <div className="form-card">
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <div className="hint">{f.hint}</div>
            <textarea
              value={draft[f.key] || ''}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
        <button className="btn primary" onClick={save} disabled={!dirty}>
          保存修改
        </button>
        <span className={`saved-flash ${saved ? 'show' : ''}`}>已保存 ✓</span>
      </div>
    </div>
  )
}
