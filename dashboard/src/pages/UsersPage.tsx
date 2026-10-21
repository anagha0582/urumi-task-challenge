import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronRight, CirclePlus, KeyRound, RefreshCw, Shield, UserPlus, X } from 'lucide-react'
import { api, userFacingError } from '../api'
import { ConfirmDialog, CopyButton, EmptyState, ErrorState, LoadingState, Modal, StatusBadge } from '../components'
import { formatDate } from '../format'
import type { ApiKeyMetadata, GatewayUser } from '../types'

export function UsersPage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [users, setUsers] = useState<GatewayUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ApiKeyMetadata | null>(null)
  const [secret, setSecret] = useState<{ key: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api.users()
      .then((result) => { if (active) setUsers(result.users) })
      .catch((cause: unknown) => { if (active) setError(userFacingError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  const reload = () => {
    setLoading(true)
    setError('')
    setRevision((value) => value + 1)
  }
  const createUser = async (email: string, role: 'admin' | 'member', keyName: string) => {
    setBusy(true)
    try {
      const response = await api.createUser({ email, role, keyName })
      setCreating(false)
      setSecret({ key: response.apiKey, name: `Initial key for ${response.user.email}` })
      notify('User created. Copy the generated API key now; it will not be shown again.')
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
      throw cause
    } finally {
      setBusy(false)
    }
  }
  const createKey = async (user: GatewayUser) => {
    setBusy(true)
    try {
      const response = await api.createUserKey(user.id, 'API key')
      setSecret({ key: response.apiKey.key, name: response.apiKey.name })
      notify(`A new key was created for ${user.email}.`)
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
    } finally {
      setBusy(false)
    }
  }
  const revoke = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await api.revokeKey(confirm.id)
      notify('API key revoked.')
      setConfirm(null)
      reload()
    } catch (cause) {
      notify(userFacingError(cause), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading users and key metadata…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <section className="content-panel">
        <div className="section-heading section-heading-wrap">
          <div><p className="eyebrow">ACCESS CONTROL</p><h2>Users &amp; API keys <span className="heading-count">{users.length}</span></h2><p className="section-subtitle">Manage gateway accounts and their active credentials.</p></div>
          <div className="toolbar">
            <button className="button button-secondary" type="button" onClick={reload}><RefreshCw size={16} />Refresh</button>
            <button className="button button-primary" type="button" onClick={() => setCreating(true)}><UserPlus size={16} />Create user</button>
          </div>
        </div>
        {users.length === 0 ? <EmptyState title="No users found" description="Create a user to grant access to the gateway." /> : (
          <div className="user-list">
            {users.map((user) => {
              const activeKeys = user.keys.filter((key) => !key.revokedAt).length
              const isExpanded = expanded === user.id
              return (
                <article className="user-entry" key={user.id}>
                  <div className="user-row">
                    <button className="user-expand icon-button" type="button" aria-label={`${isExpanded ? 'Hide' : 'Show'} keys for ${user.email}`} onClick={() => setExpanded(isExpanded ? null : user.id)}>
                      {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    </button>
                    <span className="user-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
                    <div className="user-main"><strong>{user.email}</strong><span>Joined {formatDate(user.createdAt)}</span></div>
                    <StatusBadge tone={user.role === 'admin' ? 'warning' : 'neutral'}>{user.role === 'admin' ? <><Shield size={12} />Administrator</> : 'Member'}</StatusBadge>
                    <span className="user-key-count"><KeyRound size={15} />{activeKeys} active {activeKeys === 1 ? 'key' : 'keys'}</span>
                    <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => void createKey(user)}><CirclePlus size={14} />New key</button>
                  </div>
                  {isExpanded && (
                    <div className="key-list">
                      {user.keys.length === 0 ? <p className="muted-copy">No keys have been created for this user.</p> : user.keys.map((key) => (
                        <div className="key-row" key={key.id}>
                          <span className="key-icon"><KeyRound size={15} /></span>
                          <div className="key-name"><strong>{key.name}</strong><small>ID {key.id}</small></div>
                          <span className="table-muted">Created {formatDate(key.createdAt)}</span>
                          <StatusBadge tone={key.revokedAt ? 'bad' : 'good'}>{key.revokedAt ? 'Revoked' : 'Active'}</StatusBadge>
                          {key.revokedAt ? <span className="revoked-date">Revoked {formatDate(key.revokedAt)}</span> : <button className="button button-quiet button-small text-danger" type="button" disabled={busy} onClick={() => setConfirm(key)}><X size={14} />Revoke</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
      {creating && <CreateUserModal busy={busy} onClose={() => setCreating(false)} onCreate={createUser} />}
      {confirm && <ConfirmDialog title="Revoke API key?" description={`The key “${confirm.name}” will immediately stop working. This action cannot be undone.`} confirmLabel="Revoke key" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void revoke()} />}
      {secret && <SecretDialog name={secret.name} value={secret.key} onClose={() => setSecret(null)} />}
    </>
  )
}

function CreateUserModal({ busy, onClose, onCreate }: {
  busy: boolean
  onClose: () => void
  onCreate: (email: string, role: 'admin' | 'member', keyName: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [keyName, setKeyName] = useState('Initial key')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    try {
      await onCreate(email, role, keyName.trim() || 'Initial key')
    } catch (cause) {
      setError(userFacingError(cause))
    }
  }
  return (
    <Modal title="Create a gateway user" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" /></label>
        <label>Role<select value={role} onChange={(event) => {
          const selectedRole = event.target.value
          if (selectedRole === 'admin' || selectedRole === 'member') setRole(selectedRole)
        }}><option value="member">Member</option><option value="admin">Administrator</option></select><span className="field-help">Administrators can manage servers, users, and audit logs.</span></label>
        <label>Initial API key name<input value={keyName} maxLength={60} onChange={(event) => setKeyName(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button></div>
      </form>
    </Modal>
  )
}

function SecretDialog({ name, value, onClose }: { name: string; value: string; onClose: () => void }) {
  return (
    <Modal title="Copy your new API key" onClose={onClose}>
      <p className="secret-warning">This secret is shown once. Copy it now and store it securely; the gateway does not provide a way to retrieve it later.</p>
      <p className="field-label">{name}</p>
      <div className="secret-value"><code>{value}</code><CopyButton value={value} label="Copy key" /></div>
      <div className="modal-actions"><button className="button button-primary" type="button" onClick={onClose}>Done</button></div>
    </Modal>
  )
}
