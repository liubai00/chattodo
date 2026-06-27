import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ChatDock from './components/ChatDock'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Database from './pages/Database'
import NonTodo from './pages/NonTodo'
import AgentSettings from './pages/AgentSettings'
import AppSettings from './pages/AppSettings'

export default function App() {
  const [page, setPage] = useState('dashboard')

  function renderPage() {
    switch (page) {
      case 'dashboard':
        return <Dashboard setPage={setPage} />
      case 'inbox':
        return <Inbox />
      case 'database':
        return <Database />
      case 'nontodo':
        return <NonTodo />
      case 'agent':
        return <AgentSettings />
      case 'settings':
        return <AppSettings />
      default:
        return <Dashboard setPage={setPage} />
    }
  }

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      <main className="main">
        <Topbar page={page} />
        <div className="content">{renderPage()}</div>
      </main>
      <ChatDock />
    </div>
  )
}
