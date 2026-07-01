import { useState } from 'react'
import { useStore } from '../store'
import { isToday } from '../lib/utils'
import { DueChip, PriorityChip, ScopeChip } from '../components/chips'

export default function Dashboard({ setPage }) {
  const { visible, actions } = useStore()
  const [plan, setPlan] = useState(null)

  const openTasks = visible.tasks.filter((t) => t.status !== 'done' && t.status !== 'archived')
  const todayTasks = openTasks.filter((t) => isToday(t.dueAt))
  const inboxCount = visible.todoIdeas.filter((i) => i.status === 'clarifying').length
  const recentIdeas = visible.todoIdeas.filter((i) => i.status === 'clarifying').slice(0, 3)

  function generatePlan() {
    actions.planNow().then(setPlan)
  }

  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>今天</h2>
        <p>打开后一眼看清当前状态，然后决定下一步。</p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="num">{todayTasks.length}</div>
          <div className="lab">今日任务</div>
        </div>
        <div className="stat">
          <div className="num">{inboxCount}</div>
          <div className="lab">待澄清 Inbox</div>
        </div>
        <div className="stat">
          <div className="num">{openTasks.length}</div>
          <div className="lab">未完成任务</div>
        </div>
        <div className="stat isolation">
          <div className="num">{visible.nonTodoOutputs.length}</div>
          <div className="lab">隔离输出</div>
        </div>
      </div>

      <div className="plan-card">
        <div className="ph">
          <h3>接下来两小时计划</h3>
          <span className="badge-ai">AI · 仅基于主 todo</span>
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn primary sm" onClick={generatePlan}>
              {plan ? '重新生成' : '生成计划'}
            </button>
          </div>
        </div>

        {!plan && <div className="plan-empty">基于截止时间、优先级与时长排序，自动排除隔离输出与隐私隐藏的任务。</div>}

        {plan && plan.plan.length === 0 && (
          <div className="plan-empty">当前可见 todo 中没有可安排的任务。</div>
        )}

        {plan && plan.plan.length > 0 && (
          <div className="plan-list">
            {plan.plan.map((p, i) => (
              <div className="plan-row" key={p.task.id}>
                <span className="idx">{i + 1}</span>
                <span className="pt">{p.task.title}</span>
                <span className="pm">约 {p.minutes} 分钟</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-title">最近待澄清</div>
      {recentIdeas.length === 0 && <div className="plan-empty">Inbox 已清空 ✦</div>}
      {recentIdeas.map((idea) => (
        <div className="card" key={idea.id}>
          <div className="card-row">
            <div style={{ flex: 1 }}>
              <h4>{idea.title}</h4>
              <div className="next-action">
                <b>建议下一步：</b>
                {idea.suggestedNextAction}
              </div>
              <div className="meta-line">
                <ScopeChip scope={idea.privacyScope} />
                <span className="chip status-clarifying">待澄清</span>
              </div>
            </div>
            <button className="btn sm" onClick={() => actions.ideaConvert(idea.id)}>
              转为任务
            </button>
          </div>
        </div>
      ))}

      <div className="section-title">今日任务</div>
      {todayTasks.length === 0 && <div className="plan-empty">今天没有到期任务。</div>}
      {todayTasks.map((t) => (
        <div className="card" key={t.id}>
          <div className="card-row">
            <button className="check" onClick={() => actions.taskDone(t.id)} aria-label="完成" />
            <div style={{ flex: 1 }}>
              <h4>{t.title}</h4>
              <div className="meta-line">
                <PriorityChip priority={t.priority} />
                <DueChip dueAt={t.dueAt} />
                <ScopeChip scope={t.privacyScope} />
              </div>
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={() => setPage('inbox')}>
          前往 Todo Inbox →
        </button>
      </div>
    </div>
  )
}
