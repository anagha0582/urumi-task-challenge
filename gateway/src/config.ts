
function req(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export interface SeedServer {
  slug: string;
  name: string;
  url: string;
  credential?: string;
  credentialHeader?: string;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),

  encryptionKey: Buffer.from(req("ENCRYPTION_KEY"), "hex"),

  bootstrapAdminEmail:
    process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com",

  bootstrapAdminKey: req("BOOTSTRAP_ADMIN_API_KEY"),

  seedServers: JSON.parse(
    process.env.SEED_SERVERS ?? "[]"
  ) as SeedServer[],

  connectTimeoutMs: Number(
    process.env.UPSTREAM_CONNECT_TIMEOUT_MS ?? 5000
  ),

  listTimeoutMs: Number(
    process.env.UPSTREAM_LIST_TIMEOUT_MS ?? 5000
  ),

  callTimeoutMs: Number(
    process.env.UPSTREAM_CALL_TIMEOUT_MS ?? 30000
  ),

  toolCacheTtlMs: Number(
    process.env.TOOL_CACHE_TTL_MS ?? 20000
  ),

  healthIntervalMs: Number(
    process.env.HEALTH_INTERVAL_MS ?? 15000
  ),
};

if (config.encryptionKey.length !== 32) {
  throw new Error(
    "ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)"
  );
}
