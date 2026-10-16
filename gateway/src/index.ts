
import express from "express";
import { randomBytes } from "node:crypto";

import { config } from "./config.js";
import { pool, migrate } from "./db.js";
import { hashApiKey } from "./crypto.js";
import { apiRouter } from "./api.js";
import { mcpRouter } from "./mcp.js";
import {
  validateSeedServer,
  checkUpstreamHealth,
  type UpstreamServer,
} from "./upstream.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not-ready" });
  }
});

app.use("/api", apiRouter);
app.use(mcpRouter);

async function bootstrapAdmin(): Promise<void> {
  const email = config.bootstrapAdminEmail.trim().toLowerCase();
  const keyHash = hashApiKey(config.bootstrapAdminKey);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, role)
       VALUES ($1, 'admin')
       ON CONFLICT (email)
       DO UPDATE SET role = 'admin'
       RETURNING id, email`,
      [email],
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO api_keys (user_id, key_hash, name)
       VALUES ($1, $2, 'Bootstrap admin key')
       ON CONFLICT (key_hash) DO NOTHING`,
      [user.id, keyHash],
    );

    await client.query("COMMIT");
    console.log(`Bootstrap admin ready: ${user.email}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedServers(): Promise<void> {
  for (const seed of config.seedServers) {
    validateSeedServer(seed);

    await pool.query(
      `INSERT INTO mcp_servers
         (slug, name, url, credential_encrypted,
          credential_header, enabled)
       VALUES ($1, $2, $3, NULL, $4, TRUE)
       ON CONFLICT (slug) DO NOTHING`,
      [
        seed.slug,
        seed.name,
        seed.url,
        seed.credentialHeader ?? "Authorization",
      ],
    );
  }

  console.log(`Seed server configuration checked: ${config.seedServers.length}`);
}

async function refreshServerHealth(): Promise<void> {
  const result = await pool.query(
    `SELECT id, slug, name, url,
            credential_encrypted AS "credentialEncrypted",
            credential_header AS "credentialHeader",
            enabled, status
     FROM mcp_servers`,
  );

  await Promise.all(
    result.rows.map(async (server: UpstreamServer) => {
      let status = "disabled";

      if (server.enabled) {
        status = (await checkUpstreamHealth(server))
          ? "healthy"
          : "unhealthy";
      }

      await pool.query(
        `UPDATE mcp_servers
         SET status = $2, last_checked_at = NOW()
         WHERE id = $1`,
        [server.id, status],
      );
    }),
  );
}

async function main(): Promise<void> {
  await pool.query("SELECT 1");
  await migrate();
  await bootstrapAdmin();
  await seedServers();

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Urumi MCP Gateway listening on port ${config.port}`);
  });

  const runHealthCheck = async () => {
    try {
      await refreshServerHealth();
    } catch (error) {
      console.error("Health refresh failed:", error);
    }
  };

  void runHealthCheck();

  const healthTimer = setInterval(
    () => void runHealthCheck(),
    config.healthIntervalMs,
  );

  healthTimer.unref();
}

main().catch((error) => {
  console.error("Gateway startup failed:", error);
  process.exitCode = 1;
});
