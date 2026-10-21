import type {
  ApiKeyMetadata,
  AuditEvent,
  AuthResponse,
  CreatedKey,
  GatewayServer,
  GatewayUser,
} from './types'

const API_KEY_STORAGE = 'urumi-api-key'
const REQUEST_TIMEOUT_MS = 15000

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function readApiKey(): string | null {
  return sessionStorage.getItem(API_KEY_STORAGE)
}

export function saveApiKey(key: string): void {
  sessionStorage.setItem(API_KEY_STORAGE, key)
}

export function clearApiKey(): void {
  sessionStorage.removeItem(API_KEY_STORAGE)
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  suppliedKey?: string,
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  )

  try {
    const headers = new Headers(options.headers)
    const key = suppliedKey ?? readApiKey()
    if (key) headers.set('Authorization', `Bearer ${key}`)
    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    })
    const text = await response.text()
    let payload: unknown

    if (text) {
      try {
        payload = JSON.parse(text) as unknown
      } catch {
        payload = undefined
      }
    }

    if (!response.ok) {
      if (response.status === 401 && suppliedKey === undefined) {
        clearApiKey()
        window.dispatchEvent(new Event('urumi:unauthorized'))
      }
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof payload.error === 'string'
          ? payload.error
          : response.status === 401
            ? 'Your API key is invalid or has been revoked.'
            : response.status === 403
              ? 'You do not have permission to perform this action.'
              : `Request failed (${response.status}).`
      throw new ApiError(redactSecrets(message), response.status)
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.', { cause: error })
    }
    throw new Error('Could not reach the gateway. Check the connection and try again.', { cause: error })
  } finally {
    window.clearTimeout(timeout)
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export const api = {
  authenticate: (key: string) => request<AuthResponse>('/me', {}, key),
  me: () => request<AuthResponse>('/me'),
  servers: () => request<{ servers: GatewayServer[] }>('/servers'),
  createServer: (body: {
    slug: string
    name: string
    url: string
    credential?: string
    credentialHeader?: string
  }) => request<{ server: GatewayServer }>('/servers', json('POST', body)),
  updateServer: (id: string, body: Record<string, unknown>) =>
    request<{ server: GatewayServer }>(`/servers/${encodeURIComponent(id)}`, json('PATCH', body)),
  deleteServer: (id: string) =>
    request<{ deleted: boolean }>(`/servers/${encodeURIComponent(id)}`, json('DELETE')),
  users: () => request<{ users: GatewayUser[] }>('/users'),
  createUser: (body: { email: string; role: 'admin' | 'member'; keyName?: string }) =>
    request<{ user: Omit<GatewayUser, 'createdAt' | 'keys'>; apiKey: string }>(
      '/users',
      json('POST', body),
    ),
  createUserKey: (userId: string, name: string) =>
    request<{ apiKey: CreatedKey }>(
      `/users/${encodeURIComponent(userId)}/keys`,
      json('POST', { name }),
    ),
  revokeKey: (keyId: string) =>
    request<{ revoked: boolean }>(`/keys/${encodeURIComponent(keyId)}`, json('DELETE')),
  myKeys: () => request<{ keys: ApiKeyMetadata[] }>('/me/keys'),
  createMyKey: (name: string) =>
    request<{ apiKey: CreatedKey }>('/me/keys', json('POST', { name })),
  revokeMyKey: (keyId: string) =>
    request<{ revoked: boolean }>(`/me/keys/${encodeURIComponent(keyId)}`, json('DELETE')),
  audit: (limit = 200) =>
    request<{ events: AuditEvent[] }>(`/audit-log?limit=${limit}`),
}

export function userFacingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.status === 403) return 'Administrator access is required for this page.'
    if (error.status === 409) return error.message
    return error.message
  }

  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function redactSecrets(message: string): string {
  return message
    .replace(/urumi_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}
