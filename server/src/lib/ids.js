// ID + timestamp helpers (ported from src/lib/utils.js).
let counter = 1

export function makeId(prefix) {
  counter += 1
  const stamp = Date.now().toString(36)
  return `${prefix}_${stamp}${counter}`
}

const pad = (n) => String(n).padStart(2, '0')

export function nowIso() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

// Relative date at a fixed hour — used by seed data (ported from seed.js).
export function daysFromNow(days, hour = 18) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00`
}
