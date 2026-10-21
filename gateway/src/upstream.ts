
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config, type SeedServer } from "./config.js";
import { decryptCredential } from "./crypto.js";

export interface UpstreamServer {
  id: string;
  slug: string;
  name: string;
  url: string;
  credentialEncrypted?: string | null;
  credentialHeader?: string | null;
  enabled: boolean;
  status?: string;
}

export interface UpstreamTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  serverSlug: string;
  serverName: string;
}

const toolCache = new Map<
  string,
  { expiresAt: number; tools: UpstreamTool[] }
>();

// Return cached tools for dashboard display without making upstream calls.
export function getCachedTools(serverId: string): UpstreamTool[] {
  const cached = toolCache.get(serverId);

  if (!cached || cached.expiresAt <= Date.now()) {
    return [];
  }

  return cached.tools;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;

      try {
        onTimeout?.();
      } catch {
        // Cancellation must not hide the timeout error.
      }

      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function makeHeaders(
  server: UpstreamServer,
): Record<string, string> | undefined {
  if (!server.credentialEncrypted) {
    return undefined;
  }

  const credential = decryptCredential(server.credentialEncrypted);
  const header = server.credentialHeader ?? "Authorization";

  return { [header]: credential };
}

async function withClient<T>(
  server: UpstreamServer,
  operation: (client: Client) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const client = new Client({
    name: "urumi-mcp-gateway",
    version: "1.0.0",
  });

  const controller = new AbortController();

  const transport = new StreamableHTTPClientTransport(
    new URL(server.url),
    {
      requestInit: {
        headers: makeHeaders(server),
        signal: controller.signal,
      },
    },
  );

  try {
    await withTimeout(
      client.connect(transport),
      config.connectTimeoutMs,
      `Connection timed out: ${server.slug}`,
      () => controller.abort(),
    );

    return await withTimeout(
      operation(client),
      timeoutMs,
      `Upstream operation timed out: ${server.slug}`,
      () => controller.abort(),
    );
  } finally {
    controller.abort();

    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        client.close(),
        new Promise<void>((resolve) => {
          cleanupTimer = setTimeout(resolve, 1000);
        }),
      ]);
    } catch {
      // Ignore cleanup failures.
    } finally {
      if (cleanupTimer) clearTimeout(cleanupTimer);
    }
  }
}

export async function listUpstreamTools(
  server: UpstreamServer,
  forceRefresh = false,
): Promise<UpstreamTool[]> {
  const cached = toolCache.get(server.id);

  if (
    !forceRefresh &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.tools;
  }

  const result = await withClient(
    server,
    (client) => client.listTools(),
    config.listTimeoutMs,
  );

  const tools: UpstreamTool[] = result.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown>,
    outputSchema: tool.outputSchema as
      | Record<string, unknown>
      | undefined,
    serverSlug: server.slug,
    serverName: server.name,
  }));

  toolCache.set(server.id, {
    expiresAt: Date.now() + config.toolCacheTtlMs,
    tools,
  });

  return tools;
}

export async function callUpstreamTool(
  server: UpstreamServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withClient(
    server,
    (client) =>
      client.callTool({
        name: toolName,
        arguments: args,
      }),
    config.callTimeoutMs,
  );
}

export async function checkUpstreamHealth(
  server: UpstreamServer,
): Promise<boolean> {
  try {
    await listUpstreamTools(server, true);
    return true;
  } catch (error) {
    console.warn(
      `Upstream health check failed for ${server.slug}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export function clearToolCache(serverId: string): void {
  toolCache.delete(serverId);
}

// Used later when registering initial upstream servers.
export function validateServerUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server URL must use HTTP or HTTPS");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Server URL must not contain embedded credentials");
  }

  return parsed;
}

export function validateSeedServer(server: SeedServer): void {
  if (!/^[a-z0-9-]+$/.test(server.slug)) {
    throw new Error(
      `Invalid server slug "${server.slug}". Use lowercase letters, numbers, and hyphens.`,
    );
  }

  validateServerUrl(server.url);
}
