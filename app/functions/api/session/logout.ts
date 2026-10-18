// LORDS MOBILE ACADEMY — Phase 2A Session Logout Endpoint
// POST /api/session/logout
// Revokes session and clears cookie
// Date: October 2026

import { CloudflareEnv } from "../auth/types";
import { parseCookie, errorResponse, createLogoutCookie } from "../auth/security";
import { validateSession, revokeSession, logAuditEvent } from "../auth/db";
import { getClientIp } from "../auth/security";

/**
 * Handler for POST /api/session/logout
 * Revokes session and clears authentication
 */
export async function handleSessionLogout(
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
    // Extract session ID from cookie
    const cookieHeader = req.headers.get("Cookie");
    const sessionId = parseCookie(cookieHeader, "session_id");

    if (!sessionId) {
      // No session to logout from - just return success
      // This handles cases where logout is called without a session
      return new Response(
        JSON.stringify({ ok: true, message: "Already logged out" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": createLogoutCookie(),
          },
        }
      );
    }

    // Validate session exists
    const validation = await validateSession(env.DB, sessionId);
    const userId = validation.session?.user_id || null;

    // Revoke session in D1
    await revokeSession(env.DB, sessionId);

    // Log logout event
    if (userId) {
      await logAuditEvent(env.DB, "LOGOUT", userId, {
        ip: getClientIp(req),
      });
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Logged out successfully" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": createLogoutCookie(),
        },
      }
    );
  } catch (err) {
    console.error("Session logout error:", err);
    return new Response(
      JSON.stringify(errorResponse("Internal server error", 500)),
      {
        status: 500,
        headers: {
          "Set-Cookie": createLogoutCookie(),
        },
      }
    );
  }
}

export default handleSessionLogout;
