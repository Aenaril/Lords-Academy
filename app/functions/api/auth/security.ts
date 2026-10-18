// LORDS MOBILE ACADEMY — Phase 2A Security Utilities
// CSRF, Session IDs, Recovery Code Hashing, Rate Limiting
// Date: October 2026

import { CsrfState, KVNamespace } from "./types";

/**
 * Generate cryptographically secure random string
 * Used for: session IDs, CSRF nonces, recovery codes
 */
export function generateSecureRandom(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate session ID (UUID-like)
 * 32 random hex chars = 128 bits entropy
 */
export function generateSessionId(): string {
  return generateSecureRandom(32);
}

/**
 * Generate CSRF state nonce
 */
export function generateCsrfState(): string {
  return generateSecureRandom(32);
}

/**
 * Generate recovery code
 * Format: EMERGENCY-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX (64 chars total)
 * Total entropy: 128 bits (16 bytes = 4 segments × 4 bytes each)
 * Each segment is 4 bytes = 8 hex chars
 */
export function generateRecoveryCode(): string {
  const part1 = generateSecureRandom(4).toUpperCase();
  const part2 = generateSecureRandom(4).toUpperCase();
  const part3 = generateSecureRandom(4).toUpperCase();
  const part4 = generateSecureRandom(4).toUpperCase();
  return `EMERGENCY-${part1}-${part2}-${part3}-${part4}`;
}

/**
 * Hash recovery code using SHA256
 * Phase 2A: store hashes in D1, never store plain codes
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate AND consume CSRF state atomically using D1
 * Moves consumption from KV to D1 for true atomicity
 * Returns true only if consumption succeeded
 */
export async function validateCsrfStateAtomically(
  db: any // D1Database
): Promise<(state: string) => Promise<boolean>> {
  // Return a closure that captures db
  return async (state: string): Promise<boolean> => {
    if (!state || state.length !== 64) {
      return false;
    }

    try {
      const { consumeCsrfStateAtomically } = await import("./db");
      const result = await consumeCsrfStateAtomically(db, state);
      return result.success;
    } catch (err) {
      console.error("validateCsrfStateAtomically error:", err);
      return false;
    }
  };
}



/**
 * Validate CSRF state (OLD - non-atomic, kept for compatibility)
 * Do not use directly; use validateCsrfStateAtomically instead
 */
export async function validateCsrfState(
  kv: KVNamespace,
  state: string
): Promise<boolean> {
  if (!state || state.length !== 64) {
    return false;
  }

  const stored = await kv.get(`csrf:${state}`, { type: "json" });
  if (!stored) {
    return false; // State not found or expired
  }

  const csrfData: CsrfState = stored;
  const now = Date.now();

  if (now > csrfData.expires_at) {
    await kv.delete(`csrf:${state}`); // Cleanup expired state
    return false;
  }

  // Delete state after validation (one-time use)
  await kv.delete(`csrf:${state}`);
  return true;
}

/**
 * Rate limiting for sensitive operations
 * Tracks attempts by IP in KV
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  maxAttempts: number = 5,
  windowSeconds: number = 900 // 15 min
): Promise<{ allowed: boolean; attemptsRemaining: number }> {
  const rateLimitKey = `ratelimit:${key}`;
  const current = await kv.get(rateLimitKey, { type: "text" });

  let attempts = current ? parseInt(current) : 0;

  if (attempts >= maxAttempts) {
    return { allowed: false, attemptsRemaining: 0 };
  }

  attempts++;
  await kv.put(rateLimitKey, attempts.toString(), {
    expirationTtl: windowSeconds,
  });

  return {
    allowed: true,
    attemptsRemaining: maxAttempts - attempts,
  };
}

/**
 * Parse HTTP cookie from request
 */
export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }

  return null;
}

/**
 * Create HttpOnly, Secure, SameSite cookie header
 */
export function createSessionCookie(
  sessionId: string,
  expiresInSeconds: number = 28800 // 8 hours
): string {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toUTCString();
  return `session_id=${sessionId}; Path=/; Expires=${expiresAt}; HttpOnly; Secure; SameSite=Strict`;
}

/**
 * Create logout cookie (delete)
 */
export function createLogoutCookie(): string {
  return `session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 UTC; HttpOnly; Secure; SameSite=Strict`;
}

/**
 * Validate Discord OAuth2 state parameter
 */
export function validateDiscordState(
  state: string | null
): { valid: boolean; error?: string } {
  if (!state) {
    return { valid: false, error: "Missing state parameter" };
  }

  if (state.length !== 64) {
    return { valid: false, error: "Invalid state format" };
  }

  return { valid: true };
}

/**
 * Validate Discord authorization code
 */
export function validateDiscordCode(
  code: string | null
): { valid: boolean; error?: string } {
  if (!code) {
    return { valid: false, error: "Missing code parameter" };
  }

  if (code.length < 10) {
    return { valid: false, error: "Invalid code format" };
  }

  return { valid: true };
}

/**
 * Extract client IP from request
 * Respects Cloudflare headers
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ||
    req.headers.get("X-Forwarded-For")?.split(",")[0] ||
    "unknown"
  );
}

/**
 * Create error response JSON
 */
export function errorResponse(
  message: string,
  code: number = 400
): { body: string; status: number } {
  return {
    body: JSON.stringify({ ok: false, error: message }),
    status: code,
  };
}

/**
 * Create success response JSON
 */
export function successResponse(data: any): string {
  return JSON.stringify({ ok: true, ...data });
}
