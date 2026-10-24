import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Boxes,
  LayoutDashboard,
  LogOut,
  Network,
  Users,
  KeyRound,
  Menu,
  MessageSquare,
  X,
} from 'lucide-react'
import { api, clearApiKey, readApiKey, saveApiKey } from './api'
import { Toast } from './components'
import { AuditPage } from './pages/AuditPage'
import { ChatPage } from './pages/ChatPage'
import { KeysPage } from './pages/KeysPage'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { ServersPage } from './pages/ServersPage'
import { UsersPage } from './pages/UsersPage'
import type { AuthResponse } from './types'
import './App.css'

type Page = 'overview' | 'servers' | 'users' | 'audit' | 'keys' | 'chat'
type ToastMessage = { message: string; kind: 'success' | 'error' }

const pageDetails: Record<Page, { title: string; description: string }> = {
  overview: { title: 'Overview', description: 'A real-time view of your gateway and upstream connections.' },
  servers: { title: 'MCP Servers', description: 'Configure and monitor the upstream MCP servers connected to your gateway.' },
  users: { title: 'Users & API Keys', description: 'Manage user access and gateway API credentials.' },
  audit: { title: 'Audit Logs', description: 'Review recent activity across your gateway.' },
  keys: { title: 'My API Keys', description: 'Create and manage credentials for your account.' },
  chat: { title: 'Chat', description: 'Ask questions and use tools available through your MCP gateway.' },
}

function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [checking, setChecking] = useState(() => Boolean(readApiKey()))
  const [page, setPage] = useState<Page>('overview')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [authNotice, setAuthNotice] = useState('')

  const signOut = useCallback(() => {
    clearApiKey()
    setAuth(null)
    setPage('overview')
    setMobileNavOpen(false)
  }, [])

  useEffect(() => {
    let active = true
    const handleUnauthorized = () => signOut()
    window.addEventListener('urumi:unauthorized', handleUnauthorized)
    const key = readApiKey()
    if (!key) {
      return () => window.removeEventListener('urumi:unauthorized', handleUnauthorized)
    }
    api.me()
      .then((response) => { if (active) setAuth(response) })
      .catch(() => {
        clearApiKey()
        if (active) {
          setAuth(null)
          setAuthNotice('Your saved session could not be validated. Sign in again when the gateway is available.')
        }
      })
      .finally(() => { if (active) setChecking(false) })

    return () => {
      active = false
      window.removeEventListener('urumi:unauthorized', handleUnauthorized)
    }
  }, [signOut])

  const signIn = async (key: string) => {
    const response = await api.authenticate(key)
    saveApiKey(key)
    setAuth(response)
    setPage('overview')
  }

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind })
  }, [])

  if (checking) {
    return <main className="session-check"><span className="brand-mark"><Network size={20} /></span><span>Validating gateway session…</span></main>
  }
  if (!auth) return <LoginPage onSignIn={signIn} initialMessage={authNotice} />

  const isAdmin = auth.user.role === 'admin'
  const navigation: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ...(isAdmin
      ? [
          { id: 'servers' as const, label: 'MCP Servers', icon: Boxes },
          { id: 'users' as const, label: 'Users & API Keys', icon: Users },
          { id: 'audit' as const, label: 'Audit Logs', icon: Activity },
        ]
        : []),
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'keys', label: 'My API Keys', icon: KeyRound },
  ]
  const pageInfo = pageDetails[page]

  const navigate = (nextPage: Page) => {
    setPage(nextPage)
    setMobileNavOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileNavOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark"><Network size={19} /></span>
          <span className="brand-name">urumi<span className="brand-period">.</span></span>
          <span className="brand-tag">GATEWAY</span>
          <button className="icon-button mobile-close" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} type="button" className={`nav-item${page === item.id ? ' nav-active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
                <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{page === item.id && <span className="nav-current-dot" />}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-gateway"><span className="gateway-live-dot" /><span><strong>Gateway session active</strong><small>Authenticated</small></span></div>
          <div className="sidebar-user">
            <div className="user-avatar">{auth.user.email.slice(0, 1).toUpperCase()}</div>
            <div className="sidebar-user-text"><strong>{auth.user.email}</strong><span>{auth.user.role}</span></div>
            <button className="icon-button signout-icon" type="button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" aria-label="Close navigation" type="button" onClick={() => setMobileNavOpen(false)} />}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Gateway</span><span className="breadcrumb-slash">/</span><strong>{pageInfo.title}</strong></div>
          <div className="topbar-account"><span className="gateway-live-dot" />Authenticated<span className="topbar-divider" /><span>{auth.user.email}</span><button className="button button-quiet button-small topbar-signout" type="button" onClick={signOut}><LogOut size={15} />Sign out</button></div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><h1>{pageInfo.title}</h1><p>{pageInfo.description}</p></div>
            <span className={`role-pill role-${auth.user.role}`}>{auth.user.role}</span>
          </div>
          {page === 'overview' && <OverviewPage user={auth.user} onNavigate={navigate} />}
          {page === 'servers' && isAdmin && <ServersPage notify={notify} />}
          {page === 'users' && isAdmin && <UsersPage notify={notify} />}
          {page === 'audit' && isAdmin && <AuditPage />}
          {page === 'chat' && <ChatPage />}
          {page === 'keys' && <KeysPage user={auth.user} currentKeyId={auth.apiKey.id} onSignOut={signOut} notify={notify} />}
          {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
        </main>
        <footer className="app-footer"><span>Urumi Gateway</span><span>Secure access control plane</span></footer>
      </div>
    </div>
  )
}

export default App
