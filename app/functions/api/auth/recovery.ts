// LORDS MOBILE ACADEMY — Phase 2A Emergency Recovery Code Endpoint
// POST /api/auth/recovery
// Validates recovery code for emergency access (infrastructure only, not active UI)
// Date: October 2026

import { CloudflareEnv, RecoveryValidationResponse } from "./types";
import { generateSessionId, createSessionCookie, errorResponse, checkRateLimit, hashRecoveryCode, getClientIp } from "./security";
import { consumeRecoveryCodeAtomically, createSession, logAuditEvent } from "./db";

type PagesFunction = (context: { request: Request; env: any; params: any; data: any }) => Response | Promise<Response>;

/**
 * Handler for POST /api/auth/recovery
 * Validates emergency recovery code and creates temporary session
 * 
 * SECURITY NOTES:
 * - Rate limited: 3 attempts per hour per IP
 * - One-time use only
 * - Creates temporary session (30 min, must reset password)
 * - HIDDEN in Phase 2A UI (infrastructure only)
 */
export async function handleRecoveryCode(
  req: Request,
  env: CloudflareEnv
): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify(errorResponse("Method not allowed")),
      { status: 405 }
    );
  }

  try {
    // Rate limit by IP
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(env.KV, `recovery:${clientIp}`, 3, 3600);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify(errorResponse("Too many recovery attempts. Try again later.", 429)),
        { status: 429 }
      );
    }

    // Parse request body
    let body: { code?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify(errorResponse("Invalid JSON", 400)),
        { status: 400 }
      );
    }

    const code = body.code;
    if (!code || typeof code !== "string") {
      return new Response(
        JSON.stringify(errorResponse("Missing recovery code", 400)),
        { status: 400 }
      );
    }

    // Validate code format (EMERGENCY-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX)
    if (!/^EMERGENCY-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/i.test(code)) {
      return new Response(
        JSON.stringify(errorResponse("Invalid recovery code format", 400)),
        { status: 400 }
      );
    }

    // Hash code for lookup
    const codeHash = await hashRecoveryCode(code);

    // Consume recovery code atomically (one-time use)
    const consumption = await consumeRecoveryCodeAtomically(env.DB, codeHash, `recovery:${Date.now()}`);
    if (!consumption.success) {
      // Log failed attempt
      await logAuditEvent(env.DB, "RECOVERY_ATTEMPTED", null, {
        status: "failed",
        reason: consumption.error,
        ip: clientIp,
      });

      return new Response(
        JSON.stringify(errorResponse(consumption.error || "Invalid recovery code", 401)),
        { status: 401 }
      );
    }

    // Create temporary session
    // NOTE: In Phase 2B, this should NOT create full admin privileges
    // Instead, it should allow password reset only, then require normal login
    const tempSessionId = generateSessionId();
    const tempUserId = `recovery:${Date.now()}`;

    // Store temporary session with special marker
    await env.DB
      .prepare(
        `INSERT INTO sessions (id, user_id, roles, created_at, expires_at, is_revoked)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .bind(
        tempSessionId,
        tempUserId,
        JSON.stringify(["recovery"]), // Special role indicating recovery mode
        new Date().toISOString(),
        new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min only
      )
      .run();

    // Mark recovery code as consumed (already done by consumeRecoveryCodeAtomically)
    // No need to mark again

    // Log successful recovery attempt
    await logAuditEvent(env.DB, "RECOVERY_USED", tempUserId, {
      status: "success",
      ip: clientIp,
      note: "Temporary recovery session created, password reset required",
    });

    const response: RecoveryValidationResponse = {
      ok: true,
      sessionId: tempSessionId,
      temporary: true,
      mustResetPassword: true,
    };

    const cookie = createSessionCookie(tempSessionId, 30 * 60); // 30 min TTL

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
      },
    });
  } catch (err) {
    console.error("Recovery code error:", err);
    return new Response(
      JSON.stringify(errorResponse("Internal server error", 500)),
      { status: 500 }
    );
  }
}

export const onRequest: PagesFunction = async (context) => {
  return handleRecoveryCode(context.request, context.env);
};
