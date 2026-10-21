
import express, {
  type Request,
  type Response,
} from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { pool } from "./db.js";
import { requireAuth } from "./auth.js";
import { writeAuditLog } from "./audit.js";
import {
  listUpstreamTools,
  callUpstreamTool,
  type UpstreamServer,
} from "./upstream.js";

const router = express.Router();

const SLUG_PATTERN = /^[a-z0-9-]+$/;

async function getEnabledServers(): Promise<UpstreamServer[]> {
  const result = await pool.query(
    `SELECT
       id,
       slug,
       name,
       url,
       credential_encrypted AS "credentialEncrypted",
       credential_header AS "credentialHeader",
       enabled,
       status
     FROM mcp_servers
     WHERE enabled = TRUE
     ORDER BY slug`,
  );

  return result.rows;
}

export async function buildToolList() {
  const servers = await getEnabledServers();

  const results = await Promise.allSettled(
    servers.map(async (server) => ({
      server,
      tools: await listUpstreamTools(server),
    })),
  );

  const tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> = [];

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        "Could not list tools from an upstream server:",
        result.reason,
      );
      continue;
    }

    const { server, tools: upstreamTools } = result.value;

    for (const tool of upstreamTools) {
      tools.push({
        name: `${server.slug}__${tool.name}`,
        description: `[${server.name}] ${tool.description ?? tool.name}`,
        inputSchema: tool.inputSchema,
      });
    }
  }

  return tools;
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  apiKeyId: string,
) {
  const started = Date.now();
  let slug: string | null = null;
  let toolName = name;
  let success = false;
  let errorText: string | null = null;

  try {
    const separator = name.indexOf("__");

    if (separator <= 0) {
      throw new Error(
        "Tool names must use the format server-slug__tool-name",
      );
    }

    slug = name.slice(0, separator);
    toolName = name.slice(separator + 2);

    if (!SLUG_PATTERN.test(slug) || !toolName) {
      throw new Error("Invalid gateway tool name");
    }

    const result = await pool.query(
      `SELECT
         id,
         slug,
         name,
         url,
         credential_encrypted AS "credentialEncrypted",
         credential_header AS "credentialHeader",
         enabled,
         status
       FROM mcp_servers
       WHERE slug = $1 AND enabled = TRUE
       LIMIT 1`,
      [slug],
    );

    const server = result.rows[0] as UpstreamServer | undefined;

    if (!server) {
      throw new Error(`Upstream server "${slug}" is unavailable`);
    }

    const response = await callUpstreamTool(
      server,
      toolName,
      args,
    );

    const toolResponse = response as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };

    if (toolResponse?.isError) {
      errorText =
        toolResponse.content?.find(
          (item) => item.type === "text",
        )?.text ?? "Upstream tool reported an error";
    } else {
      success = true;
    }

    return response;
  } catch (error) {
    errorText =
      error instanceof Error ? error.message : "Unknown error";
    throw error;
  } finally {
    await writeAuditLog({
      userId,
      apiKeyId,
      action: "tool_call",
      serverSlug: slug?.slice(0, 100) ?? null,
      toolName: toolName.slice(0, 200),
      success,
      durationMs: Date.now() - started,
      details: errorText
        ? { error: errorText.slice(0, 500) }
        : {},
    });
  }
}

function createMcpServer(
  userId: string,
  apiKeyId: string,
): Server {
  const server = new Server(
    {
      name: "urumi-mcp-gateway",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await buildToolList(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(
        name,
        (args ?? {}) as Record<string, unknown>,
        userId,
        apiKeyId,
      );

      return result as {
        content: Array<{
          type: "text";
          text: string;
        }>;
        isError?: boolean;
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: error instanceof Error
              ? error.message
              : "Tool call failed",
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

router.post(
  "/mcp",
  requireAuth,
  async (req: Request, res: Response) => {
    const auth = req.auth!;

    const server = createMcpServer(
      auth.user.id,
      auth.apiKey.id,
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(
        req as unknown as import("node:http").IncomingMessage,
        res,
        req.body,
      );
    } catch (error) {
      console.error("MCP gateway request failed:", error);

      if (!res.headersSent) {
        res.status(500).json({
          error: "MCP gateway request failed",
        });
      }
    }
  },
);

export const mcpRouter = router;
