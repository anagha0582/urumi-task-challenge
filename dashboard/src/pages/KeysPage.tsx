import { useEffect, useState, type FormEvent } from 'react'
import { CirclePlus, KeyRound, RefreshCw } from 'lucide-react'
import { api, userFacingError } from '../api'
import { ConfirmDialog, CopyButton, EmptyState, ErrorState, LoadingState, Modal, StatusBadge } from '../components'
import { formatDate } from '../format'
import type { ApiKeyMetadata, AuthUser } from '../types'

export function KeysPage({ user, currentKeyId, onSignOut, notify }: {
  user: AuthUser
  currentKeyId: string
  onSignOut: () => void
  notify: (message: string, kind?: 'success' | 'error') => void
}) {
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<ApiKeyMetadata | null>(null)
  const [secret, setSecret] = useState<{ value: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api.myKeys()
      .then((result) => { if (active) setKeys(result.keys) })
      .catch((cause: unknown) => { if (active) setError(userFacingError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])
  const reload = () => {
    setLoading(true)
    setError('')
    setRevision((value) => value + 1)
  }

  const create = async (name: string) => {
    setBusy(true)
    try {
      const result = await api.createMyKey(name)
      setCreating(false)
      setSecret({ value: result.apiKey.key, name: result.apiKey.name })
      notify('API key created. Copy it now; it will not be shown again.')
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
      throw cause
    } finally {
      setBusy(false)
    }
  }
  const revoke = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await api.revokeMyKey(confirm.id)
      notify('API key revoked.')
      setConfirm(null)
      if (confirm.id === currentKeyId) {
        onSignOut()
        return
      }
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading your API keys…" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const activeKeys = keys.filter((key) => !key.revokedAt).length

  return (
    <>
      <section className="content-panel">
        <div className="section-heading section-heading-wrap">
          <div><p className="eyebrow">SELF-SERVICE ACCESS</p><h2>My API keys</h2><p className="section-subtitle">Keys for {user.email}. New secrets are shown only once.</p></div>
          <div className="toolbar">
            <button className="button button-secondary" type="button" onClick={reload}><RefreshCw size={16} />Refresh</button>
            <button className="button button-primary" type="button" onClick={() => setCreating(true)}><CirclePlus size={16} />Create key</button>
          </div>
        </div>
        <div className="inline-summary"><KeyRound size={16} />{activeKeys} active {activeKeys === 1 ? 'key' : 'keys'}</div>
        {keys.length === 0 ? <EmptyState title="No API keys" description="Create a personal key to authenticate with the gateway." /> : (
          <div className="key-list key-list-full">
            {keys.map((key) => (
              <div className="key-row" key={key.id}>
                <span className="key-icon"><KeyRound size={16} /></span>
                <div className="key-name"><strong>{key.name}</strong><small>ID {key.id}</small></div>
                <span className="table-muted">Created {formatDate(key.createdAt)}</span>
                <StatusBadge tone={key.revokedAt ? 'bad' : 'good'}>{key.revokedAt ? 'Revoked' : 'Active'}</StatusBadge>
                {key.revokedAt ? <span className="revoked-date">Revoked {formatDate(key.revokedAt)}</span> : <button className="button button-quiet button-small text-danger" type="button" disabled={busy} onClick={() => setConfirm(key)}>Revoke</button>}
              </div>
            ))}
          </div>
        )}
      </section>
      {creating && <CreateKeyModal busy={busy} onClose={() => setCreating(false)} onCreate={create} />}
      {confirm && <ConfirmDialog title="Revoke API key?" description={`“${confirm.name}” will immediately stop working. If this is the key for your current session, you will be signed out.`} confirmLabel="Revoke key" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void revoke()} />}
      {secret && <Modal title="Copy your new API key" onClose={() => setSecret(null)}>
        <p className="secret-warning">This secret is shown once. Copy it now and store it securely; it cannot be retrieved later.</p>
        <p className="field-label">{secret.name}</p>
        <div className="secret-value"><code>{secret.value}</code><CopyButton value={secret.value} label="Copy key" /></div>
        <div className="modal-actions"><button className="button button-primary" type="button" onClick={() => setSecret(null)}>Done</button></div>
      </Modal>}
    </>
  )
}

function CreateKeyModal({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Enter a name for this key.')
      return
    }
    try {
      await onCreate(name.trim())
    } catch (cause) {
      setError(userFacingError(cause))
    }
  }
  return (
    <Modal title="Create an API key" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>Key name<input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Local development" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button></div>
      </form>
    </Modal>
  )
}
