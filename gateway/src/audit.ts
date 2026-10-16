
import { pool } from "./db.js";

export interface AuditEvent {
  userId?: string | null;
  apiKeyId?: string | null;
  action: string;
  serverSlug?: string | null;
  toolName?: string | null;
  success: boolean;
  durationMs?: number | null;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(
  event: AuditEvent,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (
         user_id,
         api_key_id,
         action,
         server_slug,
         tool_name,
         success,
         details,
         duration_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        event.userId ?? null,
        event.apiKeyId ?? null,
        event.action,
        event.serverSlug ?? null,
        event.toolName ?? null,
        event.success,
        JSON.stringify(event.details ?? {}),
        event.durationMs ?? null,
      ],
    );
  } catch (error) {
    // Audit failures should not crash normal gateway operations.
    console.error("Failed to write audit log:", error);
  }
}
