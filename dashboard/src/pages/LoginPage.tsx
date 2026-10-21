import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Network } from 'lucide-react'
import { ApiError, userFacingError } from '../api'

export function LoginPage({ onSignIn, initialMessage }: { onSignIn: (key: string) => Promise<void>; initialMessage?: string }) {
  const [key, setKey] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialMessage ?? '')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!key.trim()) {
      setError('Paste your gateway API key to continue.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSignIn(key.trim())
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : userFacingError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand"><span className="brand-mark"><Network size={21} /></span><span>urumi<span className="brand-period">.</span></span><span className="brand-product">GATEWAY</span></div>
      <section className="login-panel">
        <div className="login-symbol"><LockKeyhole size={23} /></div>
        <p className="eyebrow">SECURE WORKSPACE</p>
        <h1>Welcome back</h1>
        <p className="login-description">Sign in with your gateway API key to manage your MCP connections.</p>
        <form onSubmit={submit}>
          <label htmlFor="api-key">Gateway API key</label>
          <div className="input-wrap">
            <input
              id="api-key"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Paste your API key"
              aria-describedby={error ? 'login-error' : 'key-help'}
            />
            <button type="button" className="input-action" aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible((value) => !value)}>
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p id="key-help" className="field-help">Your key is stored only for this browser session.</p>
          {error && <p id="login-error" className="form-error" role="alert">{error}</p>}
          <button className="button button-primary login-submit" type="submit" disabled={busy || !key.trim()}>
            {busy ? 'Validating key…' : <>Sign in <ArrowRight size={17} /></>}
          </button>
        </form>
        <div className="login-footer"><span className="secure-dot" /> Connection protected with API-key authentication</div>
      </section>
      <p className="login-bottom">URUMI MCP GATEWAY <span>·</span> CONTROL PLANE</p>
    </main>
  )
}
