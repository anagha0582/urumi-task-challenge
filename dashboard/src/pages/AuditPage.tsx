import { useEffect, useMemo, useState } from 'react'
import { Activity, Search, ShieldCheck, ShieldX, Timer, RefreshCw } from 'lucide-react'
import { api, userFacingError } from '../api'
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components'
import { formatDate } from '../format'
import type { AuditEvent } from '../types'

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    api.audit(200)
      .then((result) => { if (active) setEvents(result.events) })
      .catch((cause: unknown) => { if (active) setError(userFacingError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) => [
      event.action,
      event.userEmail,
      event.apiKeyName,
      event.serverSlug,
      event.toolName,
      event.success ? 'success' : 'failed',
    ].some((value) => value?.toLowerCase().includes(needle)))
  }, [events, query])

  if (loading) return <LoadingState label="Loading audit events…" />
  if (error) return <ErrorState message={error} onRetry={() => {
    setLoading(true)
    setError('')
    setRevision((value) => value + 1)
  }} />

  return (
    <section className="content-panel">
      <div className="section-heading section-heading-wrap">
        <div><p className="eyebrow">SECURITY &amp; OPERATIONS</p><h2>Audit log</h2><p className="section-subtitle">Recent gateway requests, newest first. Up to 200 events are returned by the API.</p></div>
        <div className="toolbar">
          <label className="search-box"><Search size={16} /><input aria-label="Search audit events" placeholder="Search events…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="button button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />Refresh</button>
        </div>
      </div>
      {events.length === 0 ? <EmptyState title="No audit events yet" description="Gateway activity will appear here as authenticated requests are processed." /> : filtered.length === 0 ? <EmptyState title="No matching events" description="Try a different search term." /> : (
        <div className="table-scroll">
          <table className="audit-table">
            <thead><tr><th>EVENT</th><th>USER / KEY</th><th>RESOURCE</th><th>RESULT</th><th>DURATION</th><th>TIME</th></tr></thead>
            <tbody>
              {filtered.map((event) => {
                const details = formatSafeDetails(event.details)
                return (
                  <tr key={event.id}>
                    <td><div className="audit-event"><span className={`audit-icon ${event.success ? 'audit-ok' : 'audit-error'}`}>{event.success ? <ShieldCheck size={16} /> : <ShieldX size={16} />}</span><span><strong>{event.action.replaceAll('_', ' ')}</strong>{details && <small className="audit-detail" title={details}>{details}</small>}</span></div></td>
                    <td><span className="cell-primary">{event.userEmail || 'Deleted user'}</span><small className="cell-secondary">{event.apiKeyName || '—'}</small></td>
                    <td><span className="cell-primary">{event.serverSlug || '—'}</span><small className="cell-secondary">{event.toolName || '—'}</small></td>
                    <td><StatusBadge tone={event.success ? 'good' : 'bad'}>{event.success ? 'Success' : 'Failed'}</StatusBadge></td>
                    <td className="table-muted">{event.durationMs === null ? '—' : <span className="duration-value"><Timer size={14} />{event.durationMs} ms</span>}</td>
                    <td className="table-muted">{formatDate(event.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {events.length > 0 && <div className="table-footer"><span><Activity size={14} />Showing {filtered.length} of {events.length} loaded events</span></div>}
    </section>
  )
}

function formatSafeDetails(details: Record<string, unknown>): string {
  const sensitive = /(?:api.?key|secret|credential|authorization|password|token|hash)/i
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (sensitive.test(key)) continue
    if (typeof value === 'string') {
      safe[key] = value
        .replace(/urumi_[A-Za-z0-9_-]+/g, '[redacted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .slice(0, 200)
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safe[key] = value
    }
  }
  if (Object.keys(safe).length === 0) return ''
  return JSON.stringify(safe).slice(0, 240)
}
