// 时间格式化助手。旧 App.vue 内联的 lxFmtDue/lxPad 是迁移期临时副本；新视图用本模块为准，P4 清理。
// lxFmtDue：ISO -> 相对友好描述（今天/明天/昨天 HH:mm、周几、或 M/D）。
export function lxPad(n: number): string {
  return String(n).padStart(2, '0')
}

export function lxFmtDue(iso?: string | null): string {
  if (!iso) return '待定'
  const d = new Date(iso), t = new Date()
  const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((sod(d).getTime() - sod(t).getTime()) / 86400000)
  const hm = lxPad(d.getHours()) + ':' + lxPad(d.getMinutes())
  if (diff === 0) return '今天 ' + hm
  if (diff === 1) return '明天 ' + hm
  if (diff === -1) return '昨天 ' + hm
  if (diff > 1 && diff <= 6) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return lxPad(d.getMonth() + 1) + '/' + lxPad(d.getDate())
}
