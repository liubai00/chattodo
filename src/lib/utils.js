let counter = 1
export function makeId(prefix) {
  counter += 1
  const stamp = Date.now().toString(36)
  return `${prefix}_${stamp}${counter}`
}

export function nowIso() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:00`
}

export function formatDue(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const today = new Date()
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / (1000 * 60 * 60 * 24))
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `明天 ${time}`
  if (diffDays === -1) return `昨天 ${time}`
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} 天后`
  if (diffDays < 0) return `逾期 ${Math.abs(diffDays)} 天`
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

export function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

export function isOverdue(iso) {
  if (!iso) return false
  return new Date(iso).getTime() < Date.now()
}

export const PRIORITY_LABEL = { 1: 'P1 · 最高', 2: 'P2 · 高', 3: 'P3 · 中', 4: 'P4 · 低' }
export const SCOPE_LABEL = { work: '工作', personal: '个人', mixed: '混合' }
