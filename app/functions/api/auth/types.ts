// LORDS MOBILE ACADEMY — Phase 2A OAuth2 & Session Types
// Date: October 2026

/**
 * Discord OAuth2 Response from token exchange
 * https://discord.com/developers/docs/topics/oauth2
 */
export interface DiscordTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number; // typically 604800 (7 days)
  refresh_token?: string;
  scope: string;
}

/**
 * Discord User object from /users/@me endpoint
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  banner?: string | null;
  accent_color?: number | null;
  locale?: string;
  verified?: boolean;
  email?: string | null;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
}

/**
 * Discord Guild Member object (user in guild + roles)
 */
export interface DiscordGuildMember {
  user?: DiscordUser;
  nick: string | null;
  avatar: string | null;
  roles: string[]; // Array of Discord role IDs (strings)
  joined_at: string; // ISO timestamp
  premium_since: string | null;
  deaf: boolean;
  mute: boolean;
  flags: number;
  pending?: boolean;
  communication_disabled_until?: string | null;
}

/**
 * OAuth2 CSRF State validation
 * Stored in KV temporarily to prevent CSRF attacks
 */
export interface CsrfState {
  nonce: string;
  created_at: number; // UNIX timestamp
  expires_at: number; // UNIX timestamp (5 min)
}

/**
 * Session object (in D1)
 */
export interface Session {
  id: string; // UUID
  user_id: string; // Discord user ID
  roles: string[]; // Array of Discord role IDs
  created_at: string; // ISO datetime
  expires_at: string; // ISO datetime (now + 8h)
  last_role_check: string | null; // ISO datetime or null
  is_revoked: boolean;
}

/**
 * User object (in D1)
 */
export interface User {
  id: string; // Discord user ID
  username: string;
  avatar: string | null;
  email: string | null;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  is_blocked: boolean;
}

/**
 * Audit Log entry (in D1)
 */
export interface AuditLogEntry {
  id: number;
  event_type: "LOGIN" | "LOGOUT" | "PUBLISH" | "DELETE" | "ROLE_CHANGE" | "PERMISSION_REVOKE" | "RECOVERY_USED" | "CONFIG_CHANGE";
  user_id: string | null;
  details: Record<string, any> | null; // JSON
  created_at: string; // ISO datetime
  expires_at: string | null; // ISO datetime (90d)
}

/**
 * Recovery Code (in D1, hashed)
 */
export interface RecoveryCode {
  id: number;
  code_hash: string; // SHA256 of code
  is_used: boolean;
  used_by_user_id: string | null;
  used_at: string | null; // ISO datetime
  created_at: string; // ISO datetime
  expires_at: null; // NO TTL
}

/**
 * API Response for session validation
 */
export interface SessionValidationResponse {
  ok: true;
  userId: string;
  username: string;
  roles: string[];
  expiresAt: string;
}

/**
 * API Response for login initiation
 */
export interface LoginInitResponse {
  ok: true;
  authUrl: string;
}

/**
 * API Response for OAuth callback success
 * NOTE: sessionId is NEVER exposed in response — only set in HttpOnly cookie
 * This prevents JavaScript access to session identifiers
 */
export interface CallbackSuccessResponse {
  ok: true;
  userId: string;
  username: string;
}

/**
 * API Response for recovery code validation
 * NOTE: sessionId is NEVER exposed in response — only set in HttpOnly cookie
 * This prevents JavaScript access to recovery session identifiers
 */
export interface RecoveryValidationResponse {
  ok: true;
  temporary: true;
  mustResetPassword: true;
}

/**
 * Environment bindings
 */
export interface CloudflareEnv {
  DB: D1Database;
  KV: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_GUILD_ID: string;
  DISCORD_OAUTH_REDIRECT_URI: string; // Explicitly configured per environment (staging/production)
}

/**
 * D1Database interface (from Cloudflare)
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<any[]>;
  exec(query: string): Promise<any>;
}

/**
 * D1PreparedStatement interface
 */
export interface D1PreparedStatement {
  bind(...params: any[]): D1PreparedStatement;
  first(column?: string): Promise<any>;
  all(): Promise<{ results: any[] }>;
  run(): Promise<{ success: boolean; meta: any }>;
}

/**
 * KVNamespace interface (from Cloudflare)
 */
export interface KVNamespace {
  get(key: string, options?: { type: "text" | "json" | "arrayBuffer" }): Promise<any>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: any[]; list_complete: boolean; cursor: string }>;
}

export type SessionData = Session;
export type UserData = User;
