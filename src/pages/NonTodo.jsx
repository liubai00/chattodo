import { useState } from 'react'
import { useStore } from '../store'
import { ScopeChip } from '../components/chips'

const DEST_LABEL = { copy: '复制保留', export: '导出 Markdown', archive: '归档', discard: '丢弃' }

export default function NonTodo() {
  const { visible, actions } = useStore()
  const [copiedId, setCopiedId] = useState(null)
  const items = visible.nonTodoOutputs

  function copy(item) {
    const md = `# ${item.title}\n\n${item.rawText}\n\n> ${item.reason}`
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(md).catch(() => {})
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>NonTodo 隔离输出</h2>
        <p>这些内容不进入 todo 主系统，也不参与计划与提醒。</p>
      </div>

      <div className="isolation-banner">
        <span>◇</span>
        <span>隔离区：以下内容不会被「接下来做什么」读取，需手动才能转为 todo。</span>
      </div>

      {items.length === 0 && (
        <div className="empty">
          <div className="e-ico">◇</div>
          <p>暂无隔离输出。非 todo 的灵感、摘录、参考会出现在这里。</p>
        </div>
      )}

      {items.map((item) => (
        <div className="card non" key={item.id}>
          <h4>{item.title}</h4>
          <div className="raw">{item.summary}</div>
          <div className="ai-reason">AI 判断：{item.reason}</div>

          <div className="meta-line">
            <ScopeChip scope={item.privacyScope} />
            <span className="chip tag">建议：{DEST_LABEL[item.suggestedDestination]}</span>
            <span className="chip tag">来源 {item.source}</span>
          </div>

          <div className="actions">
            <button className="btn sm" onClick={() => copy(item)}>
              {copiedId === item.id ? '已复制 ✓' : '复制'}
            </button>
            <button className="btn ghost sm" onClick={() => actions.nonToTodo(item.id)}>
              手动转成 todo
            </button>
            <button className="btn ghost sm danger" onClick={() => actions.nonDiscard(item.id)}>
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
