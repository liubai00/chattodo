// Visible-scope filter — ported from src/store.jsx visibleFilter().
// When privacy mode is on, only show items in the active workspace (or 'mixed').
export function visibleFilter(items, settings) {
  if (!settings.privacyMode) return items
  const mode = settings.workspaceMode
  return items.filter((it) => it.privacyScope === mode || it.privacyScope === 'mixed')
}
