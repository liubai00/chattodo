import { useEffect, useState } from 'react'
import * as api from '../lib/api'

const PROVIDERS = [
  { value: 'rule', label: '规则版（离线）' },
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic Claude' },
]

const inputStyle = {
  width: '100%', border: '1px solid var(--border-strong, #d8d8dd)', borderRadius: 8,
  padding: '9px 11px', font: 'inherit', fontSize: 13.5, background: 'var(--surface-2, #f5f5f6)', outline: 'none',
}

function Choices({ value, options, onChange }) {
  return (
    <div className="choice-row">
      {options.map((o) => (
        <button key={o.value} className={`choice ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function AiModel() {
  const [cfg, setCfg] = useState(null)
  const [form, setForm] = useState({ provider: 'rule', baseUrl: '', model: '', apiKey: '', fallbackToRule: true })
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    api.getAiConfig().then((c) => {
      setCfg(c)
      setForm({ provider: c.provider, baseUrl: c.baseUrl || '', model: c.model || '', apiKey: '', fallbackToRule: c.fallbackToRule })
    })
  }, [])

  async function save() {
    const patch = { provider: form.provider, baseUrl: form.baseUrl, model: form.model, fallbackToRule: form.fallbackToRule }
    if (form.apiKey.trim()) patch.apiKey = form.apiKey.trim() // leave key untouched if blank
    const c = await api.updateAiConfig(patch)
    setCfg(c)
    setForm((f) => ({ ...f, apiKey: '' }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const draft = { provider: form.provider, baseUrl: form.baseUrl, model: form.model }
      if (form.apiKey.trim()) draft.apiKey = form.apiKey.trim()
      setTestResult(await api.testAiConfig(draft))
    } catch (e) {
      setTestResult({ ok: false, error: String(e.message || e) })
    }
    setTesting(false)
  }

  if (!cfg) {
    return <div className="content-inner"><div className="page-head"><h2>AI 模型</h2></div><p>加载中…</p></div>
  }

  const isLlm = form.provider !== 'rule'
  return (
    <div className="content-inner">
      <div className="page-head">
        <h2>AI 模型</h2>
        <p>选择 triage / 规划使用的模型。支持任意 OpenAI 兼容服务（DeepSeek、通义千问、豆包、Kimi 等）与 Anthropic Claude；规则版离线可用。</p>
      </div>

      <div className="form-card">
        <div className="field">
          <label>模型提供方</label>
          <div className="hint">规则版无需 Key；OpenAI 兼容需填 base URL、模型名与 Key。</div>
          <Choices value={form.provider} options={PROVIDERS} onChange={(v) => setForm({ ...form, provider: v })} />
        </div>

        {isLlm && (
          <>
            <div className="field">
              <label>Base URL</label>
              <div className="hint">DeepSeek: https://api.deepseek.com/v1 · 通义: https://dashscope.aliyuncs.com/compatible-mode/v1 · Claude 可留空（用官方）。</div>
              <input style={inputStyle} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" />
            </div>
            <div className="field">
              <label>模型名</label>
              <div className="hint">例如 deepseek-chat / qwen-plus / claude-3-5-sonnet-20241022</div>
              <input style={inputStyle} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-chat" />
            </div>
            <div className="field">
              <label>API Key {cfg.hasKey && <span style={{ color: 'var(--text-faint,#aaa)', fontWeight: 400, fontSize: 12 }}>· 已配置（留空则不修改）</span>}</label>
              <div className="hint">仅保存在本地后端数据库，读取时不会回显。</div>
              <input style={inputStyle} type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={cfg.hasKey ? '••••••（已配置）' : 'sk-...'} />
            </div>
            <div className="field">
              <label>失败兜底</label>
              <div className="hint">模型调用失败时自动回退规则版，保证输入不丢失。</div>
              <Choices value={form.fallbackToRule ? 'on' : 'off'} options={[{ value: 'on', label: '开启' }, { value: 'off', label: '关闭' }]} onChange={(v) => setForm({ ...form, fallbackToRule: v === 'on' })} />
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}>保存</button>
        <button className="btn" onClick={test} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
        <span className={`saved-flash ${saved ? 'show' : ''}`}>已保存 ✓</span>
        {testResult && (
          <span style={{ fontSize: 13, color: testResult.ok ? '#2f9e6e' : '#c0392b' }}>
            {testResult.ok ? `✓ 成功（${testResult.provider}）→ ${testResult.kind}：${testResult.title}` : `✗ ${testResult.error}`}
          </span>
        )}
      </div>
    </div>
  )
}
