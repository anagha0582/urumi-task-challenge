import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, Boxes, HeartPulse, KeyRound, Radio, Users, Wrench } from 'lucide-react'
import { api, userFacingError } from '../api'
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components'
import { formatDate } from '../format'
import type { AuditEvent, AuthUser, GatewayServer } from '../types'

interface OverviewData {
  servers: GatewayServer[]
  users: number | null
  activity: AuditEvent[]
  myKeys: number | null
}

export function OverviewPage({ user, onNavigate }: { user: AuthUser; onNavigate: (page: 'servers' | 'audit' | 'keys') => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (user.role === 'admin') {
          const [serverResponse, userResponse, auditResponse] = await Promise.all([
            api.servers(),
            api.users(),
            api.audit(8),
          ])
          if (active) {
            setData({ servers: serverResponse.servers, users: userResponse.users.length, activity: auditResponse.events, myKeys: null })
          }
        } else {
          const keyResponse = await api.myKeys()
          if (active) setData({ servers: [], users: null, activity: [], myKeys: keyResponse.keys.filter((key) => !key.revokedAt).length })
        }
      } catch (cause) {
        if (active) setError(userFacingError(cause))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [user.role, revision])

  if (loading) return <LoadingState label="Loading your gateway overview…" />
  if (error) return <ErrorState message={error} onRetry={() => {
    setLoading(true)
    setError('')
    setRevision((value) => value + 1)
  }} />
  if (!data) return null

  const healthy = data.servers.filter((server) => server.enabled && server.status.toLowerCase() === 'healthy').length
  const enabled = data.servers.filter((server) => server.enabled).length
  const toolCount = data.servers.reduce((sum, server) => sum + server.tools.length, 0)

  if (user.role !== 'admin') {
    return (
      <section className="welcome-panel">
        <div className="welcome-orb"><KeyRound size={25} /></div>
        <p className="eyebrow">PERSONAL WORKSPACE</p>
        <h2>Welcome, {user.email}</h2>
        <p>Manage your personal gateway API keys from one secure place. Your access is scoped to your own account.</p>
        <div className="personal-key-summary"><KeyRound size={16} /><span><strong>{data.myKeys ?? 0}</strong> active personal {data.myKeys === 1 ? 'key' : 'keys'}</span></div>
        <button className="button button-primary" onClick={() => onNavigate('keys')} type="button">Manage my API keys <ArrowUpRight size={16} /></button>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="metric-grid" aria-label="Gateway metrics">
        <Metric icon={<Boxes size={18} />} label="Registered servers" value={data.servers.length} detail="Configured upstreams" />
        <Metric icon={<HeartPulse size={18} />} label="Healthy servers" value={healthy} detail="Reporting a healthy connection" tone={healthy ? 'positive' : 'default'} />
        <Metric icon={<Radio size={18} />} label="Enabled servers" value={enabled} detail="Available for gateway routing" />
        <Metric icon={<Wrench size={18} />} label="Cached tools" value={toolCount} detail="From currently cached server tools" />
        <Metric icon={<Users size={18} />} label="Users" value={data.users ?? 0} detail="Gateway accounts" />
      </section>

      <section className="content-panel">
        <div className="section-heading">
          <div><p className="eyebrow">INFRASTRUCTURE</p><h2>Server health</h2></div>
          <button className="button button-quiet button-small" onClick={() => onNavigate('servers')} type="button">View servers <ArrowUpRight size={15} /></button>
        </div>
        {data.servers.length === 0 ? (
          <EmptyState title="No MCP servers yet" description="Register an upstream server to start routing MCP tools." />
        ) : (
          <div className="server-health-list">
            {data.servers.slice(0, 6).map((server) => (
              <div className="health-row" key={server.id}>
                <div className="server-avatar"><Boxes size={17} /></div>
                <div className="health-name"><strong>{server.name}</strong><span>{server.slug}</span></div>
                <span className="health-tools">{server.tools.length} {server.tools.length === 1 ? 'tool' : 'tools'}</span>
                <StatusBadge tone={server.enabled && server.status.toLowerCase() === 'healthy' ? 'good' : server.enabled ? 'warning' : 'neutral'}>
                  {server.enabled ? server.status : 'disabled'}
                </StatusBadge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-panel">
        <div className="section-heading">
          <div><p className="eyebrow">LATEST EVENTS</p><h2>Recent activity</h2></div>
          <button className="button button-quiet button-small" onClick={() => onNavigate('audit')} type="button">Audit log <ArrowUpRight size={15} /></button>
        </div>
        {data.activity.length === 0 ? (
          <EmptyState title="No recent activity" description="Gateway audit events will appear here when requests are processed." />
        ) : (
          <div className="activity-list">
            {data.activity.slice(0, 5).map((event) => (
              <div className="activity-row" key={event.id}>
                <span className={`activity-icon ${event.success ? 'activity-success' : 'activity-failed'}`}><Activity size={16} /></span>
                <div className="activity-copy">
                  <strong>{event.action.replaceAll('_', ' ')}</strong>
                  <span>{[event.userEmail, event.serverSlug, event.toolName].filter(Boolean).join(' · ') || 'Gateway event'}</span>
                </div>
                <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                <StatusBadge tone={event.success ? 'good' : 'bad'}>{event.success ? 'Success' : 'Failed'}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ icon, label, value, detail, tone = 'default' }: { icon: React.ReactNode; label: string; value: number; detail: string; tone?: 'positive' | 'default' }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span className="metric-icon">{icon}</span>{tone === 'positive' && value > 0 && <span className="metric-indicator">Operational</span>}</div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  )
}
