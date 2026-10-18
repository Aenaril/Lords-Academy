// LORDS MOBILE ACADEMY — Phase 2A Database Utilities
// D1 operations for users, sessions, audit logs, recovery codes
// Date: October 2026

import { D1Database, User, Session, AuditLogEntry, RecoveryCode } from "./types";

/**
 * Create or update user in D1
 */
export async function upsertUser(
  db: D1Database,
  userId: string,
  username: string,
  avatar: string | null,
  email: string | null
): Promise<User> {
  const now = new Date().toISOString();

  // First, check if user exists
  const existing = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .bind(userId)
    .first();

  if (existing) {
    // Update existing user
    await db
      .prepare(
        `UPDATE users SET username = ?, avatar = ?, email = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(username, avatar, email, now, userId)
      .run();
  } else {
    // Insert new user
    await db
      .prepare(
        `INSERT INTO users (id, username, avatar, email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, username, avatar, email, now, now)
      .run();
  }

  return {
    id: userId,
    username,
    avatar,
    email,
    created_at: now,
    updated_at: now,
    is_blocked: false,
  };
}

/**
 * Create session in D1
 * TTL: 8 hours
 */
export async function createSession(
  db: D1Database,
  sessionId: string,
  userId: string,
  roles: string[]
): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, roles, created_at, expires_at, is_revoked)
       VALUES (?, ?, ?, ?, ?, 0)`
    )
    .bind(
      sessionId,
      userId,
      JSON.stringify(roles),
      now.toISOString(),
      expiresAt.toISOString()
    )
    .run();

  return {
    id: sessionId,
    user_id: userId,
    roles,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    last_role_check: null,
    is_revoked: false,
  };
}

/**
 * Get session from D1
 */
export async function getSession(
  db: D1Database,
  sessionId: string
): Promise<Session | null> {
  const result = await db
    .prepare(
      `SELECT id, user_id, roles, created_at, expires_at, last_role_check, is_revoked
       FROM sessions WHERE id = ?`
    )
    .bind(sessionId)
    .first();

  if (!result) return null;

  return {
    id: result.id,
    user_id: result.user_id,
    roles: JSON.parse(result.roles || "[]"),
    created_at: result.created_at,
    expires_at: result.expires_at,
    last_role_check: result.last_role_check,
    is_revoked: result.is_revoked,
  };
}

/**
 * Check if session is valid
 * - Exists
 * - Not expired
 * - Not revoked
 */
export async function validateSession(
  db: D1Database,
  sessionId: string
): Promise<{ valid: boolean; session?: Session; error?: string }> {
  const session = await getSession(db, sessionId);

  if (!session) {
    return { valid: false, error: "Session not found" };
  }

  if (session.is_revoked) {
    return { valid: false, error: "Session revoked" };
  }

  const now = new Date();
  const expiresAt = new Date(session.expires_at);

  if (now > expiresAt) {
    return { valid: false, error: "Session expired" };
  }

  return { valid: true, session };
}

/**
 * Revoke session (logout)
 */
export async function revokeSession(
  db: D1Database,
  sessionId: string
): Promise<void> {
  await db
    .prepare("UPDATE sessions SET is_revoked = 1 WHERE id = ?")
    .bind(sessionId)
    .run();
}

/**
 * Delete session (cleanup)
 */
export async function deleteSession(
  db: D1Database,
  sessionId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id = ?")
    .bind(sessionId)
    .run();
}

/**
 * Log audit event
 */
export async function logAuditEvent(
  db: D1Database,
  eventType: string,
  userId: string | null,
  details: Record<string, any> | null
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

  await db
    .prepare(
      `INSERT INTO audit_logs (event_type, user_id, details, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      eventType,
      userId,
      details ? JSON.stringify(details) : null,
      now.toISOString(),
      expiresAt.toISOString()
    )
    .run();
}

/**
 * Store recovery code (hashed)
 */
export async function storeRecoveryCode(
  db: D1Database,
  codeHash: string
): Promise<void> {
  const now = new Date();

  await db
    .prepare(
      `INSERT INTO recovery_codes (code_hash, is_used, created_at, expires_at)
       VALUES (?, 0, ?, NULL)`
    )
    .bind(codeHash, now.toISOString())
    .run();
}

/**
 * Validate recovery code (one-time use)
 */
export async function validateRecoveryCode(
  db: D1Database,
  codeHash: string
): Promise<{ valid: boolean; error?: string }> {
  const code = await db
    .prepare("SELECT id, is_used FROM recovery_codes WHERE code_hash = ?")
    .bind(codeHash)
    .first();

  if (!code) {
    return { valid: false, error: "Invalid recovery code" };
  }

  if (code.is_used) {
    return { valid: false, error: "Recovery code already used" };
  }

  return { valid: true };
}

/**
 * Mark recovery code as used
 */
export async function markRecoveryCodeUsed(
  db: D1Database,
  codeHash: string,
  usedByUserId: string
): Promise<void> {
  const now = new Date();

  await db
    .prepare(
      `UPDATE recovery_codes SET is_used = 1, used_by_user_id = ?, used_at = ?
       WHERE code_hash = ?`
    )
    .bind(usedByUserId, now.toISOString(), codeHash)
    .run();
}

/**
 * Get user by ID
 */
export async function getUser(
  db: D1Database,
  userId: string
): Promise<User | null> {
  const result = await db
    .prepare(
      `SELECT id, username, avatar, email, created_at, updated_at, is_blocked
       FROM users WHERE id = ?`
    )
    .bind(userId)
    .first();

  if (!result) return null;

  return {
    id: result.id,
    username: result.username,
    avatar: result.avatar,
    email: result.email,
    created_at: result.created_at,
    updated_at: result.updated_at,
    is_blocked: result.is_blocked,
  };
}

/**
 * Block/unblock user (emergency admin action)
 */
export async function blockUser(
  db: D1Database,
  userId: string,
  isBlocked: boolean
): Promise<void> {
  await db
    .prepare("UPDATE users SET is_blocked = ? WHERE id = ?")
    .bind(isBlocked ? 1 : 0, userId)
    .run();
}

/**
 * Cleanup expired sessions (Cron job)
 */
export async function cleanupExpiredSessions(db: D1Database): Promise<number> {
  const now = new Date().toISOString();

  const result = await db
    .prepare("DELETE FROM sessions WHERE expires_at < ?")
    .bind(now)
    .run();

  return result.meta?.duration || 0;
}

/**
 * Cleanup expired audit logs (Cron job, 90 days)
 */
export async function cleanupExpiredAuditLogs(db: D1Database): Promise<number> {
  const now = new Date().toISOString();

  const result = await db
    .prepare("DELETE FROM audit_logs WHERE expires_at IS NOT NULL AND expires_at < ?")
    .bind(now)
    .run();

  return result.meta?.duration || 0;
}
