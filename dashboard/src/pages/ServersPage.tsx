import { useEffect, useState, type FormEvent } from 'react'
import { Boxes, ChevronDown, ChevronRight, CirclePlus, ExternalLink, Pencil, RefreshCw, Trash2, Wrench } from 'lucide-react'
import { api, userFacingError } from '../api'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, Modal, StatusBadge } from '../components'
import { formatDate } from '../format'
import type { GatewayServer } from '../types'

type ServerFormState = { name: string; slug: string; url: string; credential: string; credentialHeader: string }

export function ServersPage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [servers, setServers] = useState<GatewayServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<GatewayServer | null>(null)
  const [adding, setAdding] = useState(false)
  const [toolsFor, setToolsFor] = useState<GatewayServer | null>(null)
  const [confirm, setConfirm] = useState<{ server: GatewayServer; action: 'delete' | 'toggle' } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api.servers()
      .then((result) => { if (active) setServers(result.servers) })
      .catch((cause: unknown) => { if (active) setError(userFacingError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  const reload = () => {
    setLoading(true)
    setError('')
    setRevision((value) => value + 1)
  }
  const saveServer = async (form: ServerFormState) => {
    setBusy(true)
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: form.name.trim(),
          url: form.url.trim(),
        }
        if (form.credentialHeader.trim()) body.credentialHeader = form.credentialHeader.trim()
        if (form.credential) body.credential = form.credential
        await api.updateServer(editing.id, body)
        notify('Server updated successfully.')
      } else {
        await api.createServer({
          slug: form.slug.trim(),
          name: form.name.trim(),
          url: form.url.trim(),
          credentialHeader: form.credentialHeader.trim() || 'Authorization',
          ...(form.credential ? { credential: form.credential } : {}),
        })
        notify('MCP server registered successfully.')
      }
      setAdding(false)
      setEditing(null)
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
      throw cause
    } finally {
      setBusy(false)
    }
  }

  const confirmAction = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.action === 'delete') {
        await api.deleteServer(confirm.server.id)
        notify(`${confirm.server.name} was deleted.`)
      } else {
        await api.updateServer(confirm.server.id, { enabled: !confirm.server.enabled })
        notify(`${confirm.server.name} ${confirm.server.enabled ? 'disabled' : 'enabled'}.`)
      }
      setConfirm(null)
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading MCP servers…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <section className="content-panel">
        <div className="section-heading section-heading-wrap">
          <div><p className="eyebrow">UPSTREAM CONNECTIONS</p><h2>Registered servers <span className="heading-count">{servers.length}</span></h2><p className="section-subtitle">Manage the MCP servers connected to your gateway.</p></div>
          <div className="toolbar">
            <button className="button button-secondary" type="button" onClick={reload}><RefreshCw size={16} />Refresh</button>
            <button className="button button-primary" type="button" onClick={() => setAdding(true)}><CirclePlus size={16} />Add server</button>
          </div>
        </div>
        {servers.length === 0 ? (
          <EmptyState title="No servers registered" description="Add an MCP server endpoint to make its tools available through the gateway." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>SERVER</th><th>ENDPOINT</th><th>STATUS</th><th>TOOLS</th><th>LAST CHECKED</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {servers.map((server) => (
                  <tr key={server.id}>
                    <td><div className="table-primary"><span className="server-avatar"><Boxes size={16} /></span><span><strong>{server.name}</strong><small>{server.slug}</small></span></div></td>
                    <td><a className="endpoint-link" href={server.url} target="_blank" rel="noreferrer">{server.url}<ExternalLink size={13} /></a>{server.hasCredential && <small className="table-hint">Credential configured · header {server.credentialHeader || 'Authorization'}</small>}</td>
                    <td><StatusBadge tone={server.enabled && server.status.toLowerCase() === 'healthy' ? 'good' : server.enabled ? 'warning' : 'neutral'}>{server.enabled ? server.status : 'disabled'}</StatusBadge></td>
                    <td><button className="inline-link" type="button" onClick={() => setToolsFor(server)}><Wrench size={14} />{server.tools.length} {server.tools.length === 1 ? 'tool' : 'tools'}</button></td>
                    <td className="table-muted">{formatDate(server.lastCheckedAt)}</td>
                    <td><div className="row-actions">
                      <button className="icon-button" type="button" aria-label={`Toggle ${server.name}`} title={server.enabled ? 'Disable server' : 'Enable server'} onClick={() => setConfirm({ server, action: 'toggle' })}><span className="sr-only">{server.enabled ? 'Disable' : 'Enable'}</span>{server.enabled ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
                      <button className="icon-button" type="button" aria-label={`Edit ${server.name}`} onClick={() => setEditing(server)}><Pencil size={16} /></button>
                      <button className="icon-button icon-danger" type="button" aria-label={`Delete ${server.name}`} onClick={() => setConfirm({ server, action: 'delete' })}><Trash2 size={16} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(adding || editing) && (
        <ServerForm
          initial={editing}
          busy={busy}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSave={saveServer}
        />
      )}
      {toolsFor && <ToolsDialog server={toolsFor} onClose={() => setToolsFor(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'delete' ? 'Delete MCP server?' : `${confirm.server.enabled ? 'Disable' : 'Enable'} server?`}
          description={confirm.action === 'delete'
            ? `This will permanently remove ${confirm.server.name} (${confirm.server.slug}) from the gateway.`
            : `${confirm.server.enabled ? 'Disabling' : 'Enabling'} ${confirm.server.name} changes whether its tools are routed through the gateway.`}
          confirmLabel={confirm.action === 'delete' ? 'Delete server' : confirm.server.enabled ? 'Disable server' : 'Enable server'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </>
  )
}

function ServerForm({ initial, busy, onClose, onSave }: {
  initial: GatewayServer | null
  busy: boolean
  onClose: () => void
  onSave: (form: ServerFormState) => Promise<void>
}) {
  const [form, setForm] = useState<ServerFormState>({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    url: initial?.url ?? '',
    credential: '',
    credentialHeader: initial ? initial.credentialHeader ?? '' : 'Authorization',
  })
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.url.trim() || (!initial && !/^[a-z0-9-]+$/.test(form.slug))) {
      setError(initial ? 'Enter a server name and valid URL.' : 'Use a lowercase slug with only letters, numbers, and hyphens.')
      return
    }
    try {
      const parsedUrl = new URL(form.url.trim())
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
        setError('Use an HTTP or HTTPS URL without embedded credentials.')
        return
      }
    } catch {
      setError('Enter a valid server URL.')
      return
    }
    try {
      await onSave(form)
    } catch {
      setError('The server could not be saved. Check the values and try again.')
    }
  }
  return (
    <Modal title={initial ? 'Edit server' : 'Register MCP server'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>Server name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="WooCommerce" /></label>
        {!initial && <label>Slug<input required pattern="[a-z0-9-]+" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="woocommerce" /><span className="field-help">Lowercase letters, numbers, and hyphens only.</span></label>}
        <label>Server URL<input required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://example.com/mcp" /></label>
        <label>Credential header<input value={form.credentialHeader} onChange={(event) => setForm({ ...form, credentialHeader: event.target.value })} placeholder="Authorization" /></label>
        <label>{initial ? 'Replace credential (optional)' : 'Credential (optional)'}<input type="password" autoComplete="new-password" value={form.credential} onChange={(event) => setForm({ ...form, credential: event.target.value })} placeholder={initial?.hasCredential ? 'Leave blank to keep the current credential' : 'Enter upstream credential'} /><span className="field-help">Credentials are never displayed after saving.</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Register server'}</button></div>
      </form>
    </Modal>
  )
}

function ToolsDialog({ server, onClose }: { server: GatewayServer; onClose: () => void }) {
  return (
    <Modal title={`${server.name} tools`} onClose={onClose} wide>
      <p className="modal-copy">Tool names and descriptions are returned from the gateway’s current tool cache. Input schemas are not exposed by the dashboard API.</p>
      {server.tools.length === 0 ? (
        <EmptyState title="No cached tools available" description="The gateway has not returned cached tool information for this server. Tool refresh is not exposed through the current API." />
      ) : (
        <div className="tool-list">
          {server.tools.map((tool) => <article className="tool-item" key={tool.name}><span className="tool-symbol"><Wrench size={16} /></span><div><h3>{tool.name}</h3><p>{tool.description || 'No description provided.'}</p></div></article>)}
        </div>
      )}
    </Modal>
  )
}
