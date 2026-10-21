import { chatRouter } from "./chat.js";

import express, { type Request, type Response } from "express";

import { pool } from "./db.js";

import { requireAuth, requireAdmin } from "./auth.js";

import {
  generateApiKey,
  hashApiKey,
  encryptCredential,
} from "./crypto.js";

import {
  clearToolCache,
  getCachedTools,
  validateServerUrl,
} from "./upstream.js";

export const apiRouter = express.Router();

const SLUG_PATTERN = /^[a-z0-9-]+$/;

apiRouter.use(requireAuth);

// Get the current user and API key.
apiRouter.get("/me", (req: Request, res: Response) => {
  res.json({
    user: req.auth!.user,
    apiKey: req.auth!.apiKey,
  });
});

// List the authenticated user's own API keys.
apiRouter.get("/me/keys", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name,
              created_at AS "createdAt",
              revoked_at AS "revokedAt"
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.auth!.user.id],
    );

    res.json({ keys: result.rows });
  } catch (error) {
    console.error("Failed to list own keys:", error);
    res.status(500).json({ error: "Failed to list keys" });
  }
});

// Create an API key for the authenticated user.
// The plaintext key is returned only once.
apiRouter.post("/me/keys", async (req, res) => {
  const { name } = req.body ?? {};

  if (name !== undefined && typeof name !== "string") {
    res.status(400).json({ error: "Key name must be a string" });
    return;
  }

  const apiKey = generateApiKey();

  try {
    const result = await pool.query(
      `INSERT INTO api_keys (user_id, key_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, created_at AS "createdAt"`,
      [
        req.auth!.user.id,
        hashApiKey(apiKey),
        (name?.trim() || "My key").slice(0, 60),
      ],
    );

    res.status(201).json({
      apiKey: { ...result.rows[0], key: apiKey },
    });
  } catch (error) {
    console.error("Failed to create own key:", error);
    res.status(500).json({ error: "Failed to create key" });
  }
});

// Revoke only an API key belonging to the authenticated user.
apiRouter.delete("/me/keys/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE api_keys
       SET revoked_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND revoked_at IS NULL
       RETURNING id`,
      [req.params.id, req.auth!.user.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Active API key not found" });
      return;
    }

    res.json({ revoked: true });
  } catch (error) {
    console.error("Failed to revoke own key:", error);
    res.status(500).json({ error: "Failed to revoke key" });
  }
});

// List upstream servers. Never return encrypted credentials.
apiRouter.get("/servers", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, url, enabled,
              CASE WHEN enabled THEN status ELSE 'disabled' END AS status,
              credential_header AS "credentialHeader",
              last_checked_at AS "lastCheckedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              credential_encrypted IS NOT NULL AS "hasCredential"
       FROM mcp_servers
       ORDER BY slug`,
    );

    res.json({
      servers: result.rows.map((row) => ({
        ...row,
        tools: getCachedTools(row.id).map((tool) => ({
          name: tool.name,
          description: tool.description ?? "",
        })),
      })),
    });
  } catch (error) {
    console.error("Failed to list servers:", error);
    res.status(500).json({ error: "Failed to list servers" });
  }
});

// Register a new upstream MCP server.
apiRouter.post("/servers", requireAdmin, async (req, res) => {
  const { slug, name, url, credential, credentialHeader } =
    req.body ?? {};

  if (
    typeof slug !== "string" ||
    !SLUG_PATTERN.test(slug) ||
    slug.includes("__") ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof url !== "string"
  ) {
    res.status(400).json({ error: "Invalid server details" });
    return;
  }

  try {
    const parsedUrl = validateServerUrl(url);

    if (
      credential !== undefined &&
      typeof credential !== "string"
    ) {
      res.status(400).json({ error: "Credential must be a string" });
      return;
    }

    if (
      credentialHeader !== undefined &&
      typeof credentialHeader !== "string"
    ) {
      res.status(400).json({
        error: "Credential header must be a string",
      });
      return;
    }

    const encrypted =
      typeof credential === "string" && credential.length > 0
        ? encryptCredential(credential)
        : null;

    const result = await pool.query(
      `INSERT INTO mcp_servers
         (slug, name, url, credential_encrypted, credential_header)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, slug, name, url, enabled, status`,
      [
        slug,
        name.trim(),
        parsedUrl.toString(),
        encrypted,
        credentialHeader || "Authorization",
      ],
    );

    clearToolCache(result.rows[0].id);

    res.status(201).json({
      server: {
        ...result.rows[0],
        hasCredential: Boolean(encrypted),
      },
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "Server slug already exists" });
      return;
    }

    console.error("Failed to create server:", error);
    res.status(500).json({ error: "Failed to create server" });
  }
});

// Update server metadata, URL, credentials, or enabled state.
apiRouter.patch("/servers/:id", requireAdmin, async (req, res) => {
  const { name, url, credential, credentialHeader, enabled } =
    req.body ?? {};

  if (
    name === undefined &&
    url === undefined &&
    credential === undefined &&
    credentialHeader === undefined &&
    enabled === undefined
  ) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  if (
    name !== undefined &&
    (typeof name !== "string" || !name.trim())
  ) {
    res.status(400).json({ error: "Invalid server name" });
    return;
  }

  let normalizedUrl: string | undefined;

  if (url !== undefined) {
    try {
      if (typeof url !== "string") {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }

      normalizedUrl = validateServerUrl(url).toString();
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }
  }

  if (enabled !== undefined && typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  if (
    credential !== undefined &&
    typeof credential !== "string"
  ) {
    res.status(400).json({ error: "Credential must be a string" });
    return;
  }

  if (
    credentialHeader !== undefined &&
    typeof credentialHeader !== "string"
  ) {
    res.status(400).json({
      error: "Credential header must be a string",
    });
    return;
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM mcp_servers WHERE id = $1",
      [req.params.id],
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const encrypted =
      typeof credential === "string" && credential.length > 0
        ? encryptCredential(credential)
        : undefined;

    const result = await pool.query(
      `UPDATE mcp_servers SET
         name = COALESCE($2, name),
         url = COALESCE($3, url),
         credential_encrypted = CASE
           WHEN $4::boolean THEN $5
           ELSE credential_encrypted
         END,
         credential_header = COALESCE($6, credential_header),
         enabled = COALESCE($7, enabled),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, slug, name, url, enabled,
                 CASE WHEN enabled THEN status ELSE 'disabled' END AS status,
                 credential_header AS "credentialHeader",
                 credential_encrypted IS NOT NULL AS "hasCredential"`,
      [
        req.params.id,
        name === undefined ? null : name.trim(),
        normalizedUrl ?? null,
        credential !== undefined && credential.length > 0,
        encrypted ?? null,
        credentialHeader ?? null,
        enabled ?? null,
      ],
    );

    clearToolCache(result.rows[0].id);
    res.json({ server: result.rows[0] });
  } catch (error) {
    console.error("Failed to update server:", error);
    res.status(500).json({ error: "Failed to update server" });
  }
});

// Delete a server.
apiRouter.delete("/servers/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM mcp_servers WHERE id = $1 RETURNING id, slug",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    clearToolCache(result.rows[0].id);
    res.json({ deleted: true, server: result.rows[0] });
  } catch (error) {
    console.error("Failed to delete server:", error);
    res.status(500).json({ error: "Failed to delete server" });
  }
});

// List users and their API-key metadata. Never return key hashes.
apiRouter.get("/users", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at AS "createdAt",
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', k.id,
                    'name', k.name,
                    'createdAt', k.created_at,
                    'revokedAt', k.revoked_at
                  ) ORDER BY k.created_at
                ) FILTER (WHERE k.id IS NOT NULL),
                '[]'::json
              ) AS keys
       FROM users u
       LEFT JOIN api_keys k ON k.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error("Failed to list users:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// Create a user and its first API key.
apiRouter.post("/users", requireAdmin, async (req, res) => {
  const { email, role, keyName } = req.body ?? {};

  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    !["admin", "member"].includes(role)
  ) {
    res.status(400).json({
      error: "Valid email and role are required",
    });
    return;
  }

  const client = await pool.connect();
  const apiKey = generateApiKey();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, role)
       VALUES ($1, $2)
       RETURNING id, email, role`,
      [email.trim().toLowerCase(), role],
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO api_keys (user_id, key_hash, name)
       VALUES ($1, $2, $3)`,
      [user.id, hashApiKey(apiKey), keyName || "Initial key"],
    );

    await client.query("COMMIT");

    // The plaintext key is returned only once.
    res.status(201).json({ user, apiKey });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error?.code === "23505") {
      res.status(409).json({ error: "User email already exists" });
      return;
    }

    console.error("Failed to create user:", error);
    res.status(500).json({ error: "Failed to create user" });
  } finally {
    client.release();
  }
});

// Create another API key for an existing user.
apiRouter.post("/users/:id/keys", requireAdmin, async (req, res) => {
  const { name } = req.body ?? {};

  if (name !== undefined && typeof name !== "string") {
    res.status(400).json({ error: "Key name must be a string" });
    return;
  }

  const apiKey = generateApiKey();

  try {
    const result = await pool.query(
      `INSERT INTO api_keys (user_id, key_hash, name)
       SELECT id, $2, $3 FROM users WHERE id = $1
       RETURNING id, user_id AS "userId", name,
                 created_at AS "createdAt"`,
      [
        req.params.id,
        hashApiKey(apiKey),
        (name?.trim() || "API key").slice(0, 60),
      ],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(201).json({
      apiKey: { ...result.rows[0], key: apiKey },
    });
  } catch (error) {
    console.error("Failed to create API key:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

// Revoke an API key immediately. Admin-only route.
apiRouter.delete("/keys/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE api_keys
       SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Active API key not found" });
      return;
    }

    res.json({ revoked: true });
  } catch (error) {
    console.error("Failed to revoke API key:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

// Read recent audit events.
apiRouter.get("/audit-log", requireAdmin, async (req, res) => {
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 50, 1),
    200,
  );

  try {
    const result = await pool.query(
      `SELECT a.id, a.action, a.server_slug AS "serverSlug",
              a.tool_name AS "toolName", a.success, a.details,
              a.duration_ms AS "durationMs",
              a.created_at AS "createdAt",
              u.email AS "userEmail",
              k.name AS "apiKeyName"
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN api_keys k ON k.id = a.api_key_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit],
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error("Failed to read audit log:", error);
    res.status(500).json({ error: "Failed to read audit log" });
  }
});


// Authenticated chat endpoint; apiRouter already applies requireAuth.
apiRouter.use("/chat", chatRouter);
