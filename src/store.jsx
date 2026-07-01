import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import * as api from './lib/api'

const StoreContext = createContext(null)

// Privacy filter — mirrors the server's visibleFilter so the UI matches the API.
function visibleFilter(items, settings) {
  if (!settings?.privacyMode) return items
  const mode = settings.workspaceMode
  return items.filter((it) => it.privacyScope === mode || it.privacyScope === 'mixed')
}

const EMPTY_STATE = {
  projects: [],
  tasks: [],
  todoIdeas: [],
  nonTodoOutputs: [],
  agentProfile: { soul: '', memory: '', preferences: '', workingStyle: '', privacyRules: '', defaultFollowupStrategy: '', updatedAt: '' },
  appSettings: { workspaceMode: 'work', privacyMode: false, defaultView: 'dashboard', aiVisibility: 'visible_scope_only', updatedAt: '' },
  chat: [],
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(EMPTY_STATE)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    const s = await api.getState()
    setState({
      projects: s.projects,
      tasks: s.tasks,
      todoIdeas: s.todoIdeas,
      nonTodoOutputs: s.nonTodoOutputs,
      agentProfile: s.agentProfile,
      appSettings: s.appSettings,
      chat: s.chat,
    })
    return s
  }, [])

  useEffect(() => {
    refresh()
      .then(() => setLoaded(true))
      .catch((e) => { setError(e); setLoaded(true) })
  }, [refresh])

  const visible = useMemo(
    () => ({
      tasks: visibleFilter(state.tasks, state.appSettings),
      todoIdeas: visibleFilter(state.todoIdeas, state.appSettings),
      nonTodoOutputs: visibleFilter(state.nonTodoOutputs, state.appSettings),
    }),
    [state.tasks, state.todoIdeas, state.nonTodoOutputs, state.appSettings]
  )

  const actions = useMemo(() => {
    // Run an API call, then resync the whole state snapshot from the server.
    const after = async (promise) => {
      await promise
      await refresh()
    }
    return {
      capture: (text, source = 'web') => after(api.capture(text, source)),
      // Optimistic: show the user's message + a typing bubble immediately, then
      // resync from the server (LLM turns can take a couple seconds).
      sendChat: async (message) => {
        setState((s) => ({
          ...s,
          chat: [...s.chat,
            { id: 'tmp_user_' + Date.now(), role: 'user', text: message },
            { id: 'tmp_typing', role: 'agent', text: '…', typing: true }],
        }))
        try { await api.chat(message) } finally { await refresh() }
      },
      taskDone: (id) => after(api.taskDone(id)),
      taskReopen: (id) => after(api.taskReopen(id)),
      taskUpdate: (id, patch) => after(api.taskUpdate(id, patch)),
      ideaConvert: (id) => after(api.ideaConvert(id)),
      ideaArchive: (id) => after(api.ideaArchive(id)),
      ideaDiscard: (id) => after(api.ideaDiscard(id)),
      nonDiscard: (id) => after(api.nonDiscard(id)),
      nonToTodo: (id) => after(api.nonToTodo(id)),
      updateAgent: (patch) => after(api.updateAgent(patch)),
      updateSettings: (patch) => after(api.updateSettings(patch)),
      planNow: () => api.plan(),
      refresh,
    }
  }, [refresh])

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#666' }}>加载中…</div>
  }
  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#c0392b', lineHeight: 1.7 }}>
        无法连接后端：{String(error.message || error)}
        <br />
        请确认后端已启动：<code>cd server &amp;&amp; npm run dev</code>
      </div>
    )
  }

  return <StoreContext.Provider value={{ state, visible, actions }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
