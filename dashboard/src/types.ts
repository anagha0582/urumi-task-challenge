export type UserRole = 'admin' | 'member'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

export interface AuthResponse {
  user: AuthUser
  apiKey: {
    id: string
    name: string
  }
}

export interface ApiKeyMetadata {
  id: string
  name: string
  createdAt: string
  revokedAt: string | null
}

export interface ServerTool {
  name: string
  description: string
}

export interface GatewayServer {
  id: string
  slug: string
  name: string
  url: string
  enabled: boolean
  status: string
  credentialHeader: string | null
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
  hasCredential: boolean
  tools: ServerTool[]
}

export interface GatewayUser {
  id: string
  email: string
  role: UserRole
  createdAt: string
  keys: ApiKeyMetadata[]
}

export interface CreatedKey {
  id: string
  name: string
  createdAt: string
  key: string
}

export interface AuditEvent {
  id: number
  action: string
  serverSlug: string | null
  toolName: string | null
  success: boolean
  details: Record<string, unknown>
  durationMs: number | null
  createdAt: string
  userEmail: string | null
  apiKeyName: string | null
}
