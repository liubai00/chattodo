import { createContext, useContext, useMemo, useReducer } from 'react'
import { triageInput, detectIntent } from './lib/triage'
import { planNextBlock } from './lib/planning'
import { makeId, nowIso } from './lib/utils'
import {
  seedProjects, seedTasks, seedTodoIdeas, seedNonTodos, seedAgentProfile, seedAppSettings,
} from './lib/seed'

const StoreContext = createContext(null)

const initialState = {
  projects: seedProjects,
  tasks: seedTasks,
  todoIdeas: seedTodoIdeas,
  nonTodoOutputs: seedNonTodos,
  agentProfile: seedAgentProfile,
  appSettings: seedAppSettings,
  chat: [
    {
      id: 'msg_welcome', role: 'agent',
      text: '我是你的 todo-first agent。把任何想法丢给我，我会判断它是任务、待澄清想法，还是非 todo 信息。你也可以问我「接下来两小时做什么」。',
    },
  ],
}

// Privacy filter — implements the brief's visible-scope rules.
function visibleFilter(items, settings) {
  if (!settings.privacyMode) return items
  const mode = settings.workspaceMode // work | personal
  return items.filter((it) => it.privacyScope === mode || it.privacyScope === 'mixed')
}

function reducer(state, action) {
  switch (action.type) {
    case 'CAPTURE': {
      const { text, source } = action
      const result = triageInput(text)
      const ts = nowIso()
      if (result.kind === 'task') {
        const task = {
          id: makeId('task'), title: result.title, notes: '', status: 'todo',
          projectId: null, tags: result.tags || [], context: result.context || '',
          dueAt: result.dueAt || null, plannedAt: result.plannedAt || null,
          durationMinutes: result.durationMinutes || 30, priority: result.priority || 3,
          privacyScope: result.privacyScope, sourceIdeaId: null, createdAt: ts,
        }
        return { state: { ...state, tasks: [task, ...state.tasks] }, result }
      }
      if (result.kind === 'todo_idea') {
        const idea = {
          id: makeId('idea'), title: result.title, rawText: text, status: 'clarifying',
          suggestedNextAction: result.suggestedNextAction, aiReason: result.reason,
          privacyScope: result.privacyScope, source, createdAt: ts,
        }
        return { state: { ...state, todoIdeas: [idea, ...state.todoIdeas] }, result }
      }
      const non = {
        id: makeId('non'), title: result.title, summary: result.summary, rawText: text,
        reason: result.reason, suggestedDestination: result.suggestedDestination,
        privacyScope: result.privacyScope, source, createdAt: ts,
      }
      return { state: { ...state, nonTodoOutputs: [non, ...state.nonTodoOutputs] }, result }
    }

    case 'PUSH_CHAT':
      return { state: { ...state, chat: [...state.chat, action.message] } }

    case 'TASK_DONE':
      return {
        state: {
          ...state,
          tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, status: 'done' } : t)),
        },
      }
    case 'TASK_REOPEN':
      return {
        state: {
          ...state,
          tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, status: 'todo' } : t)),
        },
      }
    case 'TASK_UPDATE':
      return {
        state: {
          ...state,
          tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
        },
      }

    case 'IDEA_CONVERT': {
      const idea = state.todoIdeas.find((i) => i.id === action.id)
      if (!idea) return { state }
      const task = {
        id: makeId('task'), title: idea.title, notes: idea.rawText, status: 'todo',
        projectId: null, tags: [], context: '', dueAt: null, plannedAt: null,
        durationMinutes: 30, priority: 3, privacyScope: idea.privacyScope,
        sourceIdeaId: idea.id, createdAt: nowIso(),
      }
      return {
        state: {
          ...state,
          tasks: [task, ...state.tasks],
          todoIdeas: state.todoIdeas.map((i) => (i.id === action.id ? { ...i, status: 'converted' } : i)),
        },
      }
    }
    case 'IDEA_ARCHIVE':
      return {
        state: {
          ...state,
          todoIdeas: state.todoIdeas.map((i) => (i.id === action.id ? { ...i, status: 'archived' } : i)),
        },
      }
    case 'IDEA_DISCARD':
      return {
        state: { ...state, todoIdeas: state.todoIdeas.filter((i) => i.id !== action.id) },
      }

    case 'NON_DISCARD':
      return { state: { ...state, nonTodoOutputs: state.nonTodoOutputs.filter((n) => n.id !== action.id) } }
    case 'NON_TO_TODO': {
      const non = state.nonTodoOutputs.find((n) => n.id === action.id)
      if (!non) return { state }
      const task = {
        id: makeId('task'), title: non.title, notes: non.rawText, status: 'todo',
        projectId: null, tags: [], context: '', dueAt: null, plannedAt: null,
        durationMinutes: 30, priority: 3, privacyScope: non.privacyScope,
        sourceIdeaId: null, createdAt: nowIso(),
      }
      return {
        state: {
          ...state,
          tasks: [task, ...state.tasks],
          nonTodoOutputs: state.nonTodoOutputs.filter((n) => n.id !== action.id),
        },
      }
    }

    case 'AGENT_UPDATE':
      return { state: { ...state, agentProfile: { ...state.agentProfile, ...action.patch, updatedAt: nowIso() } } }
    case 'SETTINGS_UPDATE':
      return { state: { ...state, appSettings: { ...state.appSettings, ...action.patch, updatedAt: nowIso() } } }

    default:
      return { state }
  }
}

function wrappedReducer(state, action) {
  const { state: next } = reducer(state, action)
  return next
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(wrappedReducer, initialState)

  const visible = useMemo(
    () => ({
      tasks: visibleFilter(state.tasks, state.appSettings),
      todoIdeas: visibleFilter(state.todoIdeas, state.appSettings),
      nonTodoOutputs: visibleFilter(state.nonTodoOutputs, state.appSettings),
    }),
    [state.tasks, state.todoIdeas, state.nonTodoOutputs, state.appSettings]
  )

  const actions = useMemo(() => {
    function pushAgent(text) {
      dispatch({ type: 'PUSH_CHAT', message: { id: makeId('msg'), role: 'agent', text } })
    }

    return {
      // Capture from chat: triage + reply, return the result.
      capture(text, source = 'chat') {
        const result = triageInput(text)
        dispatch({ type: 'CAPTURE', text, source })
        return result
      },

      // Full chat turn used by ChatDock.
      sendChat(message) {
        dispatch({ type: 'PUSH_CHAT', message: { id: makeId('msg'), role: 'user', text: message } })
        const intent = detectIntent(message)
        if (intent === 'plan') {
          // Compute against the current visible tasks snapshot.
          const tasks = visibleFilter(state.tasks, state.appSettings)
          const { plan } = planNextBlock(tasks)
          if (plan.length === 0) {
            pushAgent('当前可见 todo 中没有可安排的任务。先添加几条任务，或切换隐私范围试试。')
          } else {
            const lines = plan
              .map((p, i) => `${i + 1}. ${p.task.title}（约 ${p.minutes} 分钟）`)
              .join('\n')
            pushAgent(`基于当前可见 todo，建议接下来这样安排：\n${lines}\n\n（已排除 NonTodo 隔离输出与隐私隐藏的任务）`)
          }
          return
        }
        const result = triageInput(message)
        dispatch({ type: 'CAPTURE', text: message, source: 'chat' })
        if (result.kind === 'task') {
          pushAgent(`✅ 已进入 todo 主系统：${result.title}\n${result.reason}`)
        } else if (result.kind === 'todo_idea') {
          pushAgent(`📥 已进入 Todo Inbox：${result.title}\n建议下一步：${result.suggestedNextAction}`)
        } else {
          pushAgent(`◽️ 非 todo，已隔离输出：${result.title}\n原因：${result.reason}（未进入 todo 主系统）`)
        }
      },

      taskDone: (id) => dispatch({ type: 'TASK_DONE', id }),
      taskReopen: (id) => dispatch({ type: 'TASK_REOPEN', id }),
      taskUpdate: (id, patch) => dispatch({ type: 'TASK_UPDATE', id, patch }),
      ideaConvert: (id) => dispatch({ type: 'IDEA_CONVERT', id }),
      ideaArchive: (id) => dispatch({ type: 'IDEA_ARCHIVE', id }),
      ideaDiscard: (id) => dispatch({ type: 'IDEA_DISCARD', id }),
      nonDiscard: (id) => dispatch({ type: 'NON_DISCARD', id }),
      nonToTodo: (id) => dispatch({ type: 'NON_TO_TODO', id }),
      updateAgent: (patch) => dispatch({ type: 'AGENT_UPDATE', patch }),
      updateSettings: (patch) => dispatch({ type: 'SETTINGS_UPDATE', patch }),
      planNow() {
        const tasks = visibleFilter(state.tasks, state.appSettings)
        return planNextBlock(tasks)
      },
    }
  }, [state])

  const value = { state, visible, actions }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
