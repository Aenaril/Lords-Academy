# PHASE 2A — PLAN D'EXÉCUTION DÉTAILLÉ

## Authentification Discord + Sessions Individuelles (Environnement Dev/Preview)

**Date** : Octobre 2026  
**Durée** : 2 semaines (40 heures)  
**Scope** : Foundation only (OAuth + sessions, no content migration)  
**Environment** : Développement + Staging Preview (pas production)

---

## 1. OBJECTIF PHASE 2A

**Résultat Final** :

- ✅ Discord OAuth2 login operational
- ✅ Individual sessions stored D1 (8h TTL)
- ✅ Emergency recovery codes hashing + storage
- ✅ Session revocation on logout
- ✅ Unit + integration tests passing
- ✅ Zero production changes (data safe)

**NOT Included Phase 2A** :

- ❌ Permission matrix enforcement (tested, not active)
- ❌ Tutorial migration (not started)
- ❌ Web Push targeting (not touched)
- ❌ Audit logging active (infrastructure ready)

---

## 2. CONDITIONS IMPÉRATIVES (9 Clauses Intégrées)

### Condition 1 : Branche Distincte de Main

- Feature branch : `feature/phase2a-oauth` UNIQUEMENT
- JAMAIS commit sur `main`
- GitHub branch protection enabled

### Condition 2 : Aucun Commit Main Pendant Phase 2A

- Tous les commits = feature branch uniquement
- Main reste stable (Phase 1 untouched)
- Aucune modification production jusqu'approval

### Condition 3 : Zéro Déploiement Production

- Phase 2A = staging environment UNIQUEMENT
- NO `wrangler publish --env production`
- NO production CI/CD trigger

### Condition 4 : Base D1 Isolée pour Tests

- D1 test = database distinct (`test-dev-local`)
- D1 staging = database distinct (`staging-uuid-xyz`)
- D1 production = LOCKED, pas accessible Phase 2A

### Condition 5 : Secrets Jamais en Git

- DISCORD_CLIENT_ID, SECRET = `wrangler secret put` ONLY
- NO .env files committed
- NO hardcoded tokens

### Condition 6 : Ancien Système Auth (No Regression)

- Existing password login MUST continue working
- Phase 1 admin pages : accessible with password
- NO breaking changes to Phase 1 code

### Condition 7 : Accès Secours Inactif Production

- Recovery endpoint exists but NOT advertised
- UI form NOT displayed to users
- Feature flag disabled by default

### Condition 8 : Fusion Branch + Déploiement = Explicit Validation

- Code merge = user approval required
- Production deploy = manual command (no auto)
- Each gate = separate checkpoint

### Condition 9 : Aucune Date = Autorisation Auto

- Timeline = indicative ONLY
- Every date/step = explicit user approval required
- NO automatic deployment based on calendar

---

## 3. D1 DATABASE SCHEMA

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_blocked BOOLEAN DEFAULT 0
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  discord_token TEXT,
  discord_refresh_token TEXT,
  roles JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_role_check DATETIME,
  is_revoked BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  required_roles JSON,
  grant_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id TEXT,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);

CREATE TABLE recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL,
  is_used BOOLEAN DEFAULT 0,
  used_by_user_id TEXT,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. DISCORD OAUTH ENDPOINTS (Phase 2A)

### Endpoint 1 : POST /api/auth/discord/login

```
Returns OAuth authorization URL
Generates CSRF state (KV, 5min TTL)
```

### Endpoint 2 : GET /api/auth/discord/callback

```
Exchanges code for token
Fetches user + guild membership
Creates session D1 (8h TTL)
Sets HttpOnly cookie
```

### Endpoint 3 : GET /api/session/validate

```
Reads session_id cookie
Lookups D1 sessions table
Returns user info or 401
```

### Endpoint 4 : POST /api/session/logout

```
Deletes session D1
Clears cookie
Logs LOGOUT event
```

### Endpoint 5 : POST /api/auth/recovery (Hidden)

```
Validates emergency recovery code
One-time use enforcement
Creates temporary session
```

---

## 5. TESTS AUTOMATISÉS (Phase 2A)

### Unit Tests (vitest)

- Discord OAuth flow validation
- Token exchange + error handling
- Session creation/deletion
- Recovery code hashing
- CSRF state validation

### Integration Tests (staging preview)

- Full OAuth flow (login → session → logout)
- Unauthorized access rejection
- Discord API error scenarios
- Session expiration (8h mock)
- Concurrent logins

### Security Tests

- CSRF attack prevention (invalid state)
- Token exposure (verify not in response)
- Session replay protection
- Recovery code replay protection

---

## 6. TIMELINE PHASE 2A (Indicative — Explicit Approvals Required)

### Week 1 (20 hours)

- Day 1-2 : Setup D1 schema
- Day 3-4 : Discord OAuth endpoints
- Day 5 : Recovery codes + session cleanup Cron
- Day 6 : Unit tests

### Week 2 (20 hours)

- Day 7-8 : Integration tests + staging deploy
- Day 9-10 : Security tests + error handling
- Day 11 : Documentation + code review
- Day 12 : Staging validation (awaiting user approval)

---

## 7. DEPLOYMENT GATES (Explicit User Approval Each)

### Gate 1 : Staging Approval (Week 2, Day 8)

**User Tests Staging** :

- Login Discord workflow
- Verify username/avatar displayed
- Test logout
- Verify audit logs created

**User Signs Off** :
"Staging tests passed. Approved for code review."

### Gate 2 : Code Review + Merge (Week 2, Day 11)

**User Reviews PR** :

- Feature/phase2a-oauth → main
- CI/CD checks passing

**User Approves** :
"Code review approved. Merge authorized."

### Gate 3 : Production Migration (Week 2, Day 12)

**User Validates** :

- D1 schema created production
- wrangler publish --env production executed
- 24h monitoring starts

**User Approves** :
"Production deployment successful. Phase 2B ready."

---

## 8. GIT STRUCTURE & CODE ORGANIZATION

### Branch Strategy

```
main (production-ready, stable)
├─ feature/phase2a-oauth (Phase 2A work)
│  ├─ app/functions/api/auth/
│  │  ├─ login.ts
│  │  ├─ callback.ts
│  │  ├─ recovery.ts
│  │  └─ types.ts
│  ├─ app/functions/api/session/
│  │  ├─ validate.ts
│  │  ├─ logout.ts
│  │  └─ store.ts
│  ├─ app/schema/
│  │  └─ d1.sql
│  ├─ tests/unit/
│  ├─ tests/integration/
│  ├─ tests/security/
│  └─ wrangler.toml (updated)
└─ (no merges to main until user approval)
```

### Environment Config

```toml
[env.development]
d1_databases = [{ binding = "DB", database_id = "test-dev-local" }]

[env.staging]
d1_databases = [{ binding = "DB", database_id = "staging-uuid-xyz" }]

[[env.staging.secrets]]
name = "DISCORD_CLIENT_ID"

[env.production]
# NOT included in Phase 2A branch
# Added ONLY after user approval Phase 2B
```

---

## 9. NEXT STEPS (Awaiting Explicit User Authorization)

### Current Status

- ✅ CORRECTIONS_V2.2.md (8 corrections integrated)
- ✅ PHASE_2A_EXECUTION_PLAN.md (9 conditions integrated)
- ❌ NO code modifications started
- ❌ NO branches created
- ❌ NO commits pushed
- ❌ NO D1 migrations executed

### User Authorization Required

**User Must Provide Explicit Message** :

```
Authorization to begin Phase 2A development:

I have reviewed CORRECTIONS_V2.2.md and PHASE_2A_EXECUTION_PLAN.md.

All 9 conditions are acceptable and integrated:
✓ Condition 1: Branche distincte main
✓ Condition 2: Aucun commit main
✓ Condition 3: Zéro production deploy
✓ Condition 4: D1 isolée
✓ Condition 5: Secrets jamais Git
✓ Condition 6: Pas régression Phase 1
✓ Condition 7: Secours inactif
✓ Condition 8: Fusion = explicit
✓ Condition 9: Dates ≠ auto

Discord credentials ready (client_id, secret, guild_id).

APPROVAL: Create feature/phase2a-oauth branch and begin development.

I understand:
- No production deploy without explicit approval
- Every gate requires my explicit sign-off
- Timeline is indicative, not automatic
- All dates/checkpoints require separate approval
```

### Dev Begins Upon Authorization

```bash
git clone https://github.com/...
git checkout -b feature/phase2a-oauth
# Development begins per PHASE_2A_EXECUTION_PLAN.md
```

---

**Document Status** : READY FOR REVIEW (9 conditions integrated, awaiting explicit user authorization)

**STOP : Awaiting user authorization message per template above**
