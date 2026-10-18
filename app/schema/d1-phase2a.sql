-- LORDS MOBILE ACADEMY — Phase 2A Schema
-- D1 Database initialization for Discord OAuth2 + Individual Sessions
-- Date: October 2026
-- Status: Development schema (test + staging only)

-- Table 1: Users (individual Discord accounts)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_blocked BOOLEAN DEFAULT 0
);

-- Table 2: CSRF States (temporary OAuth2 state for anti-CSRF, 5min TTL)
CREATE TABLE csrf_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nonce TEXT NOT NULL UNIQUE,
  is_consumed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);
CREATE INDEX idx_csrf_nonce ON csrf_states(nonce);
CREATE INDEX idx_csrf_expires_at ON csrf_states(expires_at);

-- Table 3: Sessions (revocable, 8h TTL)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- Discord tokens: NOT stored long-term in Phase 2A
  -- Instead, use bot token server-side for role verification
  roles JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_role_check DATETIME,
  is_revoked BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_id ON sessions(id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Table 4: Permissions Matrix (skeleton Phase 2A, populated Phase 2B)
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  required_roles JSON,
  grant_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table 5: Audit Logs (sensible events only)
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id TEXT,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_expires_at ON audit_logs(expires_at);

-- Table 6: Recovery Codes (emergency access, independent of Discord)
CREATE TABLE recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  is_used BOOLEAN DEFAULT 0,
  used_by_user_id TEXT,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at NULL
);
CREATE INDEX idx_recovery_code_hash ON recovery_codes(code_hash);
CREATE INDEX idx_recovery_is_used ON recovery_codes(is_used);

-- Design Notes:

-- Users Table:
-- - Stores Discord user IDs + basic info
-- - is_blocked: admin can block user (emergency)
-- - No password stored (Discord OAuth only in Phase 2A/2B)

-- CSRF States Table:
-- - nonce: unique CSRF state token (32 bytes hex)
-- - is_consumed: atomicity flag for replay attack prevention
-- - expires_at: 5 minutes from creation (auto-cleanup cron Phase 2B)

-- Sessions Table:
-- - id: UUID session identifier (HttpOnly cookie)
-- - user_id: Discord user ID (foreign key)
-- - roles: JSON array of Discord role IDs (cached from sync)
-- - expires_at: UNIX timestamp = now + 8 hours
-- - last_role_check: for 5min refresh background logic (Phase 2B)
-- - is_revoked: soft revocation flag

-- Design Decision: NO Discord tokens stored in D1
-- Rationale: Phase 2A uses bot token (server-side) for role verification
-- If tokens needed later, add encrypted columns + rotation policy

-- Permissions Table:
-- - Skeleton in Phase 2A (empty)
-- - Filled Phase 2B: resource=tutorial, action=edit, required_roles=[Discord IDs]
-- - grant_type: 'explicit' (CMS assigned) vs 'implicit' (auto-grant, unused Phase 2A)

-- Audit Logs Table:
-- - EVENT_TYPE: LOGIN, LOGOUT, PUBLISH, DELETE, ROLE_CHANGE, PERMISSION_REVOKE, RECOVERY_USED, CONFIG_CHANGE
-- - details: JSON with context (IP, action details, etc.)
-- - expires_at: 90 days from creation (auto-cleanup Cron)

-- Recovery Codes Table:
-- - code_hash: SHA256(code) for secure storage
-- - is_used: one-time-use enforcement
-- - expires_at: NULL (permanent, no TTL)
-- - Design: NOT a full admin account, triggers manual recovery process Phase 2B
