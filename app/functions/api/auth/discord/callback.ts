// LORDS MOBILE ACADEMY — Phase 2A Discord OAuth2 Callback Handler
// GET /api/auth/discord/callback?code=...&state=...
// Exchanges authorization code for token + creates session
// Date: October 2026

import { CloudflareEnv, DiscordTokenResponse, DiscordUser, DiscordGuildMember, CallbackSuccessResponse } from "../types";
import {
  validateCsrfState,
  validateDiscordState,
  validateDiscordCode,
  generateSessionId,
  createSessionCookie,
  errorResponse,
  getClientIp,
} from "../security";
import { upsertUser, createSession, logAuditEvent } from "../db";

/**
 * Handler for GET /api/auth/discord/callback
 * Exchanges Discord authorization code for token + creates session
 */
export async function handleDiscordCallback(
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
    // Parse query parameters
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Check Discord error parameter
    if (error) {
      console.warn("Discord OAuth error:", error);
      return new Response(
        JSON.stringify(errorResponse(`Discord denied authorization: ${error}`, 403)),
        { status: 403 }
      );
    }

    // Validate code and state format
    const codeValidation = validateDiscordCode(code);
    if (!codeValidation.valid) {
      return new Response(
        JSON.stringify(errorResponse(codeValidation.error || "Invalid code", 400)),
        { status: 400 }
      );
    }

    const stateValidation = validateDiscordState(state);
    if (!stateValidation.valid) {
      return new Response(
        JSON.stringify(errorResponse(stateValidation.error || "Invalid state", 400)),
        { status: 400 }
      );
    }

    // Validate CSRF state (must exist in KV + not expired)
    const stateValid = await validateCsrfState(env.KV, state as string);
    if (!stateValid) {
      return new Response(
        JSON.stringify(errorResponse("Invalid or expired state (CSRF protection)", 403)),
        { status: 403 }
      );
    }

    // Exchange code for token
    const tokenData = await exchangeDiscordCode(code as string, req, env);
    if (!tokenData) {
      return new Response(
        JSON.stringify(errorResponse("Failed to exchange code for token", 500)),
        { status: 500 }
      );
    }

    // Fetch user info from Discord
    const userInfo = await fetchDiscordUserInfo(tokenData.access_token);
    if (!userInfo) {
      return new Response(
        JSON.stringify(errorResponse("Failed to fetch user info", 500)),
        { status: 500 }
      );
    }

    // Check guild membership
    const guildMember = await fetchDiscordGuildMember(
      userInfo.id,
      tokenData.access_token,
      env.DISCORD_GUILD_ID
    );
    if (!guildMember) {
      // User not in guild
      await logAuditEvent(env.DB, "LOGIN", userInfo.id, {
        reason: "not_in_guild",
        ip: getClientIp(req),
      });

      return new Response(
        JSON.stringify(errorResponse("You are not a member of the required guild", 403)),
        { status: 403 }
      );
    }

    // User exists + is in guild
    // Create/update user in D1
    await upsertUser(env.DB, userInfo.id, userInfo.username, userInfo.avatar, userInfo.email || null);

    // Create session in D1
    const sessionId = generateSessionId();
    const roleIds = guildMember.roles || [];
    await createSession(env.DB, sessionId, userInfo.id, roleIds);

    // Log successful login
    await logAuditEvent(env.DB, "LOGIN", userInfo.id, {
      status: "success",
      ip: getClientIp(req),
      username: userInfo.username,
    });

    // Prepare response
    const response: CallbackSuccessResponse = {
      ok: true,
      userId: userInfo.id,
      username: userInfo.username,
      sessionId: sessionId,
    };

    // Set HttpOnly session cookie
    const cookie = createSessionCookie(sessionId);

    // Redirect to admin page (or referrer if available)
    const redirectUrl = url.searchParams.get("referrer") || "/admin";

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
        "Location": redirectUrl, // Browser will handle redirect if needed
      },
    });
  } catch (err) {
    console.error("Discord callback error:", err);
    return new Response(
      JSON.stringify(errorResponse("Internal server error", 500)),
      { status: 500 }
    );
  }
}

/**
 * Exchange Discord authorization code for token
 */
async function exchangeDiscordCode(
  code: string,
  req: Request,
  env: CloudflareEnv
): Promise<DiscordTokenResponse | null> {
  try {
    const redirectUri = new URL(req.url).origin + "/api/auth/discord/callback";

    const response = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Discord token exchange failed:", error);
      return null;
    }

    const tokenData = (await response.json()) as DiscordTokenResponse;
    return tokenData;
  } catch (err) {
    console.error("Token exchange error:", err);
    return null;
  }
}

/**
 * Fetch Discord user info from /users/@me
 */
async function fetchDiscordUserInfo(accessToken: string): Promise<DiscordUser | null> {
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch Discord user info:", response.status);
      return null;
    }

    const user = (await response.json()) as DiscordUser;
    return user;
  } catch (err) {
    console.error("Fetch user info error:", err);
    return null;
  }
}

/**
 * Fetch Discord guild member info + roles
 */
async function fetchDiscordGuildMember(
  userId: string,
  userToken: string,
  guildId: string
): Promise<DiscordGuildMember | null> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      }
    );

    if (response.status === 404) {
      console.warn("User not in guild:", userId);
      return null;
    }

    if (!response.ok) {
      console.error("Failed to fetch guild member info:", response.status);
      return null;
    }

    const member = (await response.json()) as DiscordGuildMember;
    return member;
  } catch (err) {
    console.error("Fetch guild member error:", err);
    return null;
  }
}

export default handleDiscordCallback;
