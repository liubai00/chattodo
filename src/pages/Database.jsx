import { useState } from 'react'
import { useStore } from '../store'
import { isToday, formatDue, isOverdue, PRIORITY_LABEL } from '../lib/utils'
import { ScopeChip } from '../components/chips'

const VIEWS = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今日' },
  { key: 'open', label: '未完成' },
  { key: 'done', label: '已完成' },
]

export default function Database() {
  const { visible, actions } = useStore()
  const [view, setView] = useState('open')

  const tasks = visible.tasks.filter((t) => {
    if (view === 'today') return isToday(t.dueAt) && t.status !== 'archived'
    if (view === 'open') return t.status === 'todo' || t.status === 'in_progress'
    if (view === 'done') return t.status === 'done'
    return t.status !== 'archived'
  })

  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>Todo 数据库</h2>
        <p>正式任务的统一视图。主系统稳定色，与隔离区清晰区分。</p>
      </div>

      <div className="tabs">
        {VIEWS.map((v) => (
          <button key={v.key} className={`tab ${view === v.key ? 'on' : ''}`} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <div className="e-ico">☰</div>
          <p>这个视图下暂无任务。</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 38 }}></th>
                <th>标题</th>
                <th style={{ width: 96 }}>优先级</th>
                <th style={{ width: 110 }}>截止</th>
                <th style={{ width: 78 }}>时长</th>
                <th style={{ width: 72 }}>范围</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const done = t.status === 'done'
                return (
                  <tr key={t.id} className={done ? 'done' : ''}>
                    <td>
                      <button
                        className={`check ${done ? 'on' : ''}`}
                        onClick={() => (done ? actions.taskReopen(t.id) : actions.taskDone(t.id))}
                        aria-label={done ? '重开' : '完成'}
                      >
                        {done ? '✓' : ''}
                      </button>
                    </td>
                    <td>
                      <span className="t-title">{t.title}</span>
                      {t.tags?.length > 0 && (
                        <span style={{ marginLeft: 8 }}>
                          {t.tags.map((tag) => (
                            <span key={tag} className="chip tag" style={{ marginRight: 4 }}>
                              #{tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${t.priority <= 1 ? 'p1' : t.priority === 2 ? 'p2' : 'p3'}`}>
                        {PRIORITY_LABEL[t.priority]?.split(' ')[0]}
                      </span>
                    </td>
                    <td>
                      {t.dueAt ? (
                        <span
                          className={`chip due ${isOverdue(t.dueAt) && !done ? 'over' : isToday(t.dueAt) ? 'today' : ''}`}
                        >
                          {formatDue(t.dueAt)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-3)' }}>{t.durationMinutes ? `${t.durationMinutes}m` : '—'}</td>
                    <td>
                      <ScopeChip scope={t.privacyScope} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
