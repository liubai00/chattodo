import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

const SUGGESTIONS = [
  '接下来两小时做什么？',
  '下周三前提交 MVP 文档评审',
  '周末研究一下 Cubox、OmniFocus',
  'AI todo 可以借鉴 Cubox 的稍后读体验',
]

export default function ChatDock() {
  const { state, actions } = useStore()
  const [text, setText] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.chat])

  function send(value) {
    const msg = (value ?? text).trim()
    if (!msg) return
    actions.sendChat(msg)
    setText('')
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <aside className="chatdock">
      <div className="chat-head">
        <span className="dot" />
        <div>
          <div className="ct">常驻聊天框</div>
          <div className="cs">自然语言输入 · 判断 · 计划</div>
        </div>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {state.chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="who">{m.role === 'user' ? '你' : 'Agent'}</div>
            {m.typing ? (
              <div className="bubble typing"><span /><span /><span /></div>
            ) : (
              <div className="bubble">{m.text}</div>
            )}
          </div>
        ))}
      </div>

      <div className="chat-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggest" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <div className="box">
          <textarea
            rows={1}
            placeholder="输入想法、任务，或问「接下来做什么」…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button className="send-btn" disabled={!text.trim()} onClick={() => send()} aria-label="发送">
            ↑
          </button>
        </div>
        <div className="chat-hint">Enter 发送 · Shift+Enter 换行 · AI 会自动判断归类</div>
      </div>
    </aside>
  )
}
