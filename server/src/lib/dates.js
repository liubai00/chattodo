// Date helpers (server-side subset of src/lib/utils.js).
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
