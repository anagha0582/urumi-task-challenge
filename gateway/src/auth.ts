
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
import { hashApiKey } from "./crypto.js";

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "member";
}

export interface AuthApiKey {
  id: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: AuthUser;
        apiKey: AuthApiKey;
      };
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer API key" });
      return;
    }

    const rawKey = authorization.slice("Bearer ".length).trim();

    if (!rawKey) {
      res.status(401).json({ error: "Missing bearer API key" });
      return;
    }

    const result = await pool.query(
      `SELECT
         u.id AS user_id,
         u.email,
         u.role,
         k.id AS api_key_id,
         k.name AS api_key_name
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = $1
         AND k.revoked_at IS NULL
       LIMIT 1`,
      [hashApiKey(rawKey)],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid or revoked API key" });
      return;
    }

    const row = result.rows[0];

    req.auth = {
      user: {
        id: row.user_id,
        email: row.email,
        role: row.role,
      },
      apiKey: {
        id: row.api_key_id,
        name: row.api_key_name,
      },
    };

    next();
  } catch (error) {
    console.error("API-key authentication failed:", error);
    res.status(500).json({ error: "Authentication service error" });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.auth?.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}
