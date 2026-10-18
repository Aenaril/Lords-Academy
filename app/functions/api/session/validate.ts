// LORDS MOBILE ACADEMY — Phase 2A Session Validation Endpoint
// GET /api/session/validate
// Validates session and returns user info
// Date: October 2026

import { CloudflareEnv, SessionValidationResponse } from "../auth/types";
import { parseCookie, errorResponse } from "../auth/security";
import { validateSession, getUser } from "../auth/db";

type PagesFunction = (context: { request: Request; env: any; params: any; data: any }) => Response | Promise<Response>;

/**
 * Handler for GET /api/session/validate
 * Returns current session info if valid
 */
export async function handleSessionValidate(
  req: Request,
  env: CloudflareEnv
): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") {
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
      return new Response(
        JSON.stringify(errorResponse("No session cookie", 401)),
        { status: 401 }
      );
    }

    // Validate session in D1
    const validation = await validateSession(env.DB, sessionId);
    if (!validation.valid) {
      return new Response(
        JSON.stringify(errorResponse(validation.error || "Invalid session", 401)),
        { status: 401 }
      );
    }

    const session = validation.session!;

    // Get user info
    const user = await getUser(env.DB, session.user_id);
    if (!user) {
      return new Response(
        JSON.stringify(errorResponse("User not found", 401)),
        { status: 401 }
      );
    }

    if (user.is_blocked) {
      return new Response(
        JSON.stringify(errorResponse("User account blocked", 403)),
        { status: 403 }
      );
    }

    const response: SessionValidationResponse = {
      ok: true,
      userId: user.id,
      username: user.username,
      roles: session.roles,
      expiresAt: session.expires_at,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Session validate error:", err);
    return new Response(
      JSON.stringify(errorResponse("Internal server error", 500)),
      { status: 500 }
    );
  }
}

export const onRequest: PagesFunction = async (context) => {
  return handleSessionValidate(context.request, context.env);
};
