import { useStore } from '../store'
import { ScopeChip } from '../components/chips'

const STATUS_LABEL = {
  clarifying: '待澄清',
  converted: '已转任务',
  archived: '已归档',
}

export default function Inbox() {
  const { visible, actions } = useStore()
  const ideas = visible.todoIdeas.filter((i) => i.status !== 'discarded')

  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>Todo Inbox</h2>
        <p>存放还没完全澄清的 todo 类想法。澄清后再转入正式任务。</p>
      </div>

      {ideas.length === 0 && (
        <div className="empty">
          <div className="e-ico">✦</div>
          <p>Inbox 是空的。模糊的 todo 想法会先到这里等待澄清。</p>
        </div>
      )}

      {ideas.map((idea) => (
        <div className="card" key={idea.id}>
          <div className="card-row">
            <div style={{ flex: 1 }}>
              <h4>{idea.title}</h4>
              <div className="raw">「{idea.rawText}」</div>

              <div className="ai-reason">AI 判断：{idea.aiReason}</div>
              <div className="next-action">
                <b>建议下一步：</b>
                {idea.suggestedNextAction}
              </div>

              <div className="meta-line">
                <ScopeChip scope={idea.privacyScope} />
                <span className={`chip status-${idea.status}`}>{STATUS_LABEL[idea.status]}</span>
                <span className="chip tag">来源 {idea.source}</span>
              </div>

              {idea.status === 'clarifying' && (
                <div className="actions">
                  <button className="btn primary sm" onClick={() => actions.ideaConvert(idea.id)}>
                    转成任务
                  </button>
                  <button className="btn ghost sm" onClick={() => actions.ideaArchive(idea.id)}>
                    归档
                  </button>
                  <button className="btn ghost sm danger" onClick={() => actions.ideaDiscard(idea.id)}>
                    丢弃
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
