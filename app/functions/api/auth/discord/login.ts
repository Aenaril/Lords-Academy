// LORDS MOBILE ACADEMY — Phase 2A Discord OAuth2 Login Endpoint
// GET /api/auth/discord/login
// Initiates Discord OAuth2 flow
// Date: October 2026

import { CloudflareEnv, LoginInitResponse } from "../types";
import { createCsrfState, errorResponse } from "../security";

/**
 * Handler for GET /api/auth/discord/login
 * Initiates OAuth2 flow by generating authorization URL
 */
export async function handleDiscordLoginInit(
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
    // Generate CSRF state
    const state = await createCsrfState(env.KV);

    // Build Discord OAuth URL
    const clientId = env.DISCORD_CLIENT_ID;
    const redirectUri = new URL(req.url).origin + "/api/auth/discord/callback";
    const scopes = ["identify", "guilds.members.read"].join("%20");

    const authUrl = new URL("https://discord.com/api/oauth2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);

    const response: LoginInitResponse = {
      ok: true,
      authUrl: authUrl.toString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Discord login init error:", err);
    return new Response(
      JSON.stringify(errorResponse("Internal server error", 500)),
      { status: 500 }
    );
  }
}

export default handleDiscordLoginInit;
