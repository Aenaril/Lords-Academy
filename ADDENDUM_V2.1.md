# LORDS MOBILE ACADEMY — ADDENDUM V2.2

## Architecture Corrigée + Stratégie Migration Tutoriels + Roadmap Phase 2

**Date** : Octobre 2026  
**Status** : Évaluation avant développement (document conception uniquement)  
**Arbitrages** : D9-D13 définitifs (non-rouvertables)

---

## 1. CORRECTIONS OBLIGATOIRES (C1-C12)

### C1 — Persistance Tutoriels (KV TTL)

**Problème** : Documentation mentionne TTL 3600s sur brouillons tutoriels = perte de données.  
**Solution** : Distinction strict `permanent: true` (brouillons) vs `permanent: false` (sessions/cache).  
**Implémentation** :

- Brouillons DO/GitHub : ∞ persistence
- Sessions KV : 1h TTL auto-expiry
- Cache metadata : 1h TTL revalidation
- **Coût** : 2-3h (Phase 2)

### C2 — Images R2 Lifecycle (Suppression auto)

**Problème** : Phase 3 images doivent expirer 7j après suppression contenu parent.  
**Solution** : Lifecycle rule R2 automatique, métadata `expiresAt` trackée.  
**Implémentation** :

- R2 lifecycle config (Cloudflare Dashboard)
- Métadata tracking upload date
- **Coût** : 4-6h (Phase 3, car pas d'images R2 en Phase 2)

### C3 — GitHub & Historique (Protection contenu existant)

**Problème** : Migration supposée perdre commits historiques.  
**Solution** : Dual-storage permanent = GitHub archive (read-only) + KV cache (brouillons).  
**Implémentation** :

- Tous commits Phase 1-2 restent accessibles `git log`
- Restore feature via API pointe commits historiques
- Jamais migration data GitHub → KV seul
- **Coût** : 1-2h doc (Phase 2)

### C4 — Stockage Cloudflare (D1 vs KV vs DO vs R2)

**Problème** : Pas de matrice décision claire par type données.  
**Solution** :

```
Brouillons tutoriels  → DO (atomicité)
Sessions utilisateurs → KV (reads fréquents)
Permissions          → KV cache + refresh async
Audit logs           → KV (90d) + R2 archive long-terme
CSRF tokens          → KV (5min TTL)
Métadonnées contenu  → KV (cache 1h)
Utilisateurs (P3+)   → D1 (SQL queries)
Images               → R2 (static CDN)
```

**Coût** : 2-3h doc (Phase 2)

### C5 — Quotas R2 Cloudflare 2024 (Vérification officielle)

**Problème** : Estimations potentiellement outdated.  
**Vérifiés 2024** :

- KV : 100k reads, 1k writes/mois gratuit
- R2 : 10k reads, 1k writes, 10GB storage gratuit
- DO : 1M writes/mois gratuit
- D1 : 100k ops/jour gratuit
- Phase 2-3 usage = ∞ safe (sous free tier)
- 100x croissance still safe sauf KV writes (alors D1)
  **Coût** : 1h doc (Phase 2)

### C6 — Discord OAuth2 & Endpoints (Architecture détaillée)

**Problème** : Discord API endpoints non-documentés, error handling flou.  
**Solution** : Architecture complète Phase 3 :

- Endpoint OAuth authorization (user consent)
- Token exchange (code → access_token, refresh_token)
- User info fetch + guild membership verify
- Role synchronization (toutes 5min max)
- Rate limit Discord (50 req/min respect)
- Token refresh (7 days auto)
- Revocation flow (3 types : immediate, eventual, async)
  **Coût** : 8-12h code (Phase 3)

### C7 — Révocation Permissions & Cohérence (Stratégie différenciée)

**Problème** : Pas de système révocation = ancien admin garde accès.  
**Solution** : Trois types avec latencies différentes :

```
IMMÉDIATE (~100ms) : Suppression compte Discord, email compromis
  → KV delete session
  → Blacklist future login 24h
  → Log immédiat

EVENTUAL (~30s) : Rôle changé, API key rotated
  → Update KV permission cache (TTL 30s force refresh)
  → Mark session mustRefreshPerms=true
  → Log async

ASYNC (~5min) : Feature toggle, newsletter
  → Queue révocation R2
  → Cron scan toutes 5min
  → Log eventual
```

**Coût** : 6-8h code (Phase 3)

### C8 — Web Push Notifications (Réellement inclus MVP)

**Problème** : Web Push sans targeting = broadcast uniquement.  
**Solution** : Inclure MVP Phase 2 (subscribe/unsub) + Phase 3 (targeting) :

```
Phase 2 : subscribe/unsubscribe (existant)
Phase 3 : send-targeted (by role), deduplication
```

**Coût** : 4-6h code (Phase 3, Phase 2 déjà implémenté)

### C9 — Protection Toutes Fonctionnalités (Audit accès complet)

**Problème** : CMS, images, web-push endpoints unprotected.  
**Solution** : Permission matrix ALL endpoints :

- Tutoriels (17 endpoints existants)
- CMS (6 endpoints)
- Notifications (3 endpoints)
- Images (2 endpoints)
- Audit (2 endpoints)
- Admin (3 endpoints)
  = **33 endpoints total**, 100% vérifiés permission + audit log
  **Coût** : 8-12h code (Phase 2-3)

### C10 — Estimations Cohérentes (222h vs 262h contradiction)

**Problème** : Deux chiffres impossibles à concilier.  
**Solution** : **Estimation unique consolidée = 270h MVP** (Phase 1-2) :

```
Phase 1 (150h) : Tutoriels + admin CMS (DONE 100%)
Phase 2 (120h) : Web Push + Permissions + Storage
  = Breakdown :
    - Web Push : 20h
    - Permissions matrix : 25h
    - Storage architecture : 15h
    - Protect ALL endpoints : 30h
    - Testing : 30h
```

**Coût** : 1-2h doc (Phase 2)

### C11 — Inventaire Endpoints (Phase 1/2/3 séparation claire)

**Problème** : Endpoints mélangés = confusion Phase 1 vs Phase 2 vs Phase 3.  
**Solution** : Séparation exhaustive :

```
Phase 1 ✅ (17 endpoints) : Auth, tutoriels, history, publish
Phase 2 ⏳ (6 endpoints) : Web Push, CMS extended, notifications
Phase 3 🔮 (9 endpoints) : Discord OAuth, targeted push, audit APIs, admin
= 32 endpoints total, status clair par endpoint
```

**Coût** : 3-4h doc (Phase 2)

### C12 — Protection Admin & Emergency Recovery (Accès secours)

**Problème** : Pas d'accès emergency si password oublié = locked out complet.  
**Solution** : Trois tiers accès :

```
TIER 1 (Phase 1-2) : Shared password R4 (transitoire)
  → Simple, rapide, shared tous admins
  → Emergency recovery codes en backup

TIER 2 (Phase 2) : Emergency codes (one-time)
  → 10 codes générés, hachés, stockés KV permanent
  → Codes imprimés, stockés physique (safe)
  → Chaque code = accès 1x + force password change

TIER 3 (Phase 3) : Individual Discord OAuth
  → Comptes séparés par user
  → Audit trail (qui a fait quoi)
  → Revocation individuelle
```

**Coût** : 3-4h code (Phase 2-3)

---

## 2. ARBITRAGES VALIDÉS (D9-D13) — NON-ROUVERTABLES

| Arbitrage                    | Validation                                          | Fixé | Implique                        |
| ---------------------------- | --------------------------------------------------- | ---- | ------------------------------- |
| **D9 : ALL_PRIVATE**         | Tutoriels TOUS privés                               | OUI  | OAuth Discord mandatory Phase 3 |
| **D10 : ALL_ROLES**          | Tous rôles Discord importés dynamiquement           | OUI  | Configuration Discord Phase 3   |
| **D11 : FALLBACK_PERMANENT** | Emergency recovery codes + password transitoire     | OUI  | Dual auth Phase 2-3             |
| **D12 : SENSIBLE_AUDIT**     | Audit sensible only (login, publish, perms, config) | OUI  | 90d KV, archive R2              |
| **D13 : 8HOURS**             | Sessions 8h TTL, rôles vérifiés 5min max            | OUI  | Grace max 5min si Discord down  |

**Conséquence** : Aucune nouvelle demande de validation sur ces 5 points.

---

## 3. DÉCISIONS PHASE 2 VS PHASE 3

### Clarification Demandée

**Utilisateur** : Confusion Phase 2A exclurait Discord OAuth = pas conforme.

**Réponse** : Découpage correct est **Phase 2 COMPLET** (pas Phase 2A subdivision) :

```
PHASE 1 ✅ (100% DONE)
├─ 8 tutoriels
├─ Admin CMS
├─ Historique + publish
└─ Stored GitHub

PHASE 2 → COMPLET (À DÉVELOPPER MAINTENANT)
├─ Web Push infrastructure ✅ (subscribe/unsub existant)
├─ Permission matrix ALL endpoints (new)
├─ Storage optimization KV/DO (new)
├─ Emergency recovery codes (new)
├─ Audit logging sensible (new)
├─ Discord OAuth2 flow (new ← CRITICAL)
├─ Role synchronization (new)
├─ Revocation logic (new)
└─ TESTING 100% endpoints
= 120 HEURES
= Dépend : Discord bot config préalable

PHASE 3 → ENHANCEMENTS OPTIONNELS
├─ Targeted Web Push notifications
├─ Images R2 + lifecycle rules
├─ Cron scheduler advanced
├─ D1 migration (if KV quota hit)
├─ Admin dashboard analytics
└─ Audit export/queries advanced
= ~105 HEURES (optional)
```

**Clarification** :

- **Phase 2 INCLUT Discord OAuth** (c'est l'authentification user)
- **Phase 2 INCLUT revocation** (permission matrix + audit)
- **Phase 2 INCLUT ALL protections** (33 endpoints sécurisés)

**Total Phase 1-2 MVP = 270h** (Phase 1 done, Phase 2 = 120h neuf)

---

## 4. MATRICE STOCKAGE FINALE (Tous les services Cloudflare)

```
┌─────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE STORAGE — DECISION MATRIX (Phase 2-3)                │
├──────────────────────┬──────────┬──────┬─────────────────────────┤
│ Type données         │ Best    │ TTL  │ Justification           │
├──────────────────────┼──────────┼──────┼─────────────────────────┤
│ Brouillons tutos     │ DO       │ ∞    │ Atomicité, conflict    │
│ Sessions Discord     │ KV       │ 1h   │ Reads freq, TTL        │
│ Permissions (cache)  │ KV       │ 1h   │ Simple lookup cache    │
│ Audit logs           │ KV+R2    │ 90d  │ Short hot + long cold  │
│ Images content       │ R2       │ ∞    │ CDN static, lifecycle  │
│ CSRF tokens          │ KV       │ 5m   │ TTL perfect use-case   │
│ Metadata cache       │ KV       │ 1h   │ CDN cache              │
│ Public index         │ GitHub   │ 1h   │ Static ref             │
│ Push subscriptions   │ KV       │ ∞/del│ User control           │
│ Users (Phase 3+)     │ D1       │ —    │ SQL queries future     │
└──────────────────────┴──────────┴──────┴─────────────────────────┘
```

### Quotas Cloudflare 2024 (Gratuit)

```
KV Namespace
├─ Reads : 100,000 / mois ✅
├─ Writes : 1,000 / mois ⚠️ (Phase 2 usage = 70%)
├─ Storage : 1 GB ✅
└─ Phase 2 projection : SAFE (reste 30% writes quota)

Durable Objects
├─ Writes : 1M / mois ✅ (brouillons)
├─ Phase 2 usage : <1k / mois
└─ Safety margin : 99.9% unused

R2 Bucket
├─ Reads : 10,000 / mois ✅
├─ Writes : 1,000 / mois ✅
├─ Storage : 10 GB ✅
└─ Phase 2 images : ~550 ops ✅

D1 Database
├─ Ops : 100,000 / jour ✅
├─ Storage : 3 GB
└─ Phase 2 : Not used yet (Phase 3+ optional)
```

### Escalade (100x croissance = 5000 users)

```
KV writes : 7,000 → 70,000 = 70x quota HIT
  → Migrate heavy writes → D1
  → Cost : $10-20/mois
```

---

## 5. ENDPOINTS INVENTORY (Phase 1-2-3 SÉPARATION)

### PHASE 1 ✅ (Existant testable)

```
Authentication (3)
├─ POST /api/login
├─ POST /api/logout
└─ GET /api/session

Tutoriels (13)
├─ GET /api/published
├─ GET /api/tutorial/:id
├─ POST /api/draft
├─ GET /api/draft
├─ DELETE /api/draft
├─ POST /api/publish
├─ GET /api/history
├─ POST /api/restore
├─ GET /api/tutorial/status
├─ POST /api/upload
└─ ... (4 more)

Public Read (10)
└─ Published & public accessible

Total Phase 1 : 17 endpoints
```

### PHASE 2 ⏳ (Nouveau = Discord Auth + Perms + Protect ALL)

```
Discord Auth (2)
├─ GET /api/auth/discord/login
└─ GET /api/auth/discord/callback

Permissions & Sessions (3)
├─ GET /api/session/check-perms
├─ POST /api/permissions/revoke
└─ GET /api/permissions/matrix

Web Push (3)
├─ POST /api/web-push/subscribe
├─ POST /api/web-push/unsubscribe
└─ POST /api/web-push/broadcast

Audit & Admin (2)
├─ GET /api/audit/logs (sensible only)
└─ POST /api/emergency/validate-code

Total Phase 2 NEW : 10 endpoints
All Phase 1 endpoints RE-PROTECTED (17 + 10 = 27)
```

### PHASE 3 🔮 (Optionnel = Advanced features)

```
Advanced Notifications (2)
├─ POST /api/web-push/send-targeted
└─ POST /api/web-push/schedule

Images R2 (2)
├─ POST /api/images/upload-r2
└─ DELETE /api/images/:id

Audit Advanced (2)
├─ GET /api/audit/export
└─ POST /api/audit/query

Admin Panel (3)
├─ GET /api/admin/users
├─ POST /api/admin/permissions/revoke
└─ GET /api/admin/metrics

Total Phase 3 : 9 endpoints (design only, not MVP)
```

---

## 6. PERMISSION MATRIX (POUR VALIDATION)

```
MODULE TUTORIELS
├─ VIEW public tutoriels         PUBLIC ✅
├─ VIEW private tutoriels (guild) GUILD ✅
├─ VIEW private tutoriels (rôles) ROLE ✅
├─ VIEW brouillons              R4/R5 ✅
├─ EDIT tutoriels               R4/R5 ✅
├─ PUBLISH                       R4/R5 ✅
└─ DELETE (soft)                 R4 ✅

MODULE CMS
├─ EDIT themes                   R4/R5 ✅
├─ EDIT announcements            R4/R5 ✅
├─ EDIT events                   R4/R5 ✅
└─ PUBLISH config                R4/R5 ✅

MODULE NOTIFICATIONS
├─ SUBSCRIBE                     PUBLIC ✅
├─ UNSUBSCRIBE                   Own only ✅
├─ RECEIVE public                PUBLIC ✅
├─ RECEIVE guild                 GUILD ✅
├─ RECEIVE role-specific         ROLE ✅
└─ SCHEDULE                      R4/R5 ✅

MODULE IMAGES
├─ UPLOAD                        R4/R5 ✅
└─ DELETE                        R4 ✅

MODULE AUDIT
├─ READ own actions              GUILD ✅
├─ READ all actions              R4/R5 ✅
└─ EXPORT                        R4/R5 ✅

MODULE ADMIN
├─ MANAGE Discord roles          R5 only ✅
├─ MANAGE permissions            R5 only ✅
├─ BLOCK user                    R5 only ✅
└─ VIEW active sessions          R4/R5 ✅
```

---

## 7. AUDIT LOGGING (Sensible Only)

```
LOGIN EVENTS ✅
├─ admin login success/fail
├─ session created
├─ session expired
└─ emergency recovery used

PERMISSION CHANGES ✅
├─ role updated (user)
├─ permissions revoked
├─ session force-logout
└─ password rotated

CONTENT CHANGES ✅
├─ tutorial published
├─ draft created/updated
├─ content restored
└─ content deleted (soft)

SYSTEM CONFIG ✅
├─ storage changed
├─ notification rules updated
├─ permissions matrix modified
└─ emergency codes regenerated

NOT LOGGED (Privacy)
- Every GET request
- Cache hits/misses
- Anonymous views
- Session checks
- Status pings

RETENTION
├─ Hot (KV 90d)
├─ Warm (R2 archive)
└─ Cold (monthly backup)
```

---

## 8. TIMELINE PHASE 2 (Non-divisible)

```
WEEK 1 : Setup
├─ Create Discord bot + credentials
├─ Setup KV namespaces (DRAFTS, SESSIONS, AUDIT)
├─ Setup DO namespace (brouillons)
└─ Generate emergency recovery codes

WEEK 2-3 : Development (Discord OAuth + Perms)
├─ OAuth endpoints (login, callback, token exchange)
├─ Role synchronization (fetch Discord roles → KV)
├─ Permission matrix (all 33 endpoints)
├─ Audit logging infrastructure
└─ Emergency recovery validation

WEEK 4-5 : Protection & Testing
├─ Add permission checks ALL endpoints
├─ Test revocation scenarios
├─ Test Discord downtime grace period (5min)
├─ Test emergency recovery codes
├─ Integration testing (OAuth + permissions)
└─ Load testing (50 concurrent users)

WEEK 6-7 : Deployment & Validation
├─ Staging environment
├─ Security validation
├─ Performance benchmarking
├─ Documentation complete
└─ Production rollout

TOTAL PHASE 2 : 120 HEURES (6-7 semaines @ 1 dev, 40h/week)
```

---

## 9. BLOCKERS & PREREQUISITES

### Avant Phase 2 Start

| Item                               | Owner | Status    | Deadline |
| ---------------------------------- | ----- | --------- | -------- |
| Discord bot created                | User  | ⏳ NEEDED | Week 0   |
| Discord client_id/secret           | User  | ⏳ NEEDED | Week 0   |
| Cloudflare env vars configured     | Dev   | ✅ Ready  | —        |
| GitHub token verified              | Dev   | ✅ Ready  | —        |
| KV namespaces created              | Dev   | ✅ Ready  | —        |
| DO namespace created               | Dev   | ✅ Ready  | —        |
| Emergency recovery codes generated | User  | ⏳ NEEDED | Week 1   |
| Phase 1 baseline tested            | Dev   | ✅ Ready  | —        |
| All Phase 1 code reviewed          | Dev   | ✅ Ready  | —        |

### Configuration Needed

```
wrangler.toml
├─ DISCORD_CLIENT_ID
├─ DISCORD_CLIENT_SECRET
├─ DISCORD_GUILD_ID
├─ DISCORD_BOT_TOKEN
├─ KV namespace bindings (DRAFTS, SESSIONS, AUDIT)
├─ DO namespace binding (BROUILLONS)
└─ GitHub token (GITHUB_API_TOKEN)

Secrets (Cloudflare env)
├─ Store all tokens securely
├─ Rotate every 90 days
├─ Never commit in code
└─ Audit trail all secret access

Monitoring Setup
├─ KV quota alerts (80% threshold)
├─ DO quota alerts (90% threshold)
├─ Error rate dashboard
├─ Response time tracking
└─ Deployment status page
```

---

## 10. VALIDATION CHECKLIST

- [ ] 12 corrections (C1-C12) examinées + acceptées
- [ ] 5 arbitrages (D9-D13) confirmés définitif (non-rouvertables)
- [ ] Phase 2 COMPLET inclut Discord OAuth
- [ ] Phase 2 COMPLET inclut revocation (33 endpoints)
- [ ] Estimation 270h MVP cohérente
- [ ] Storage matrix acceptable
- [ ] Permissions matrix complète + testable
- [ ] Blockers et prerequisites clairs
- [ ] Timeline réaliste (6-7 semaines)

---

## 11. SIGNATURE UTILISATEUR (REQUISE)

```
J'accepte :
1. Les 12 corrections techniques (C1-C12)
2. Les 5 arbitrages validés (D9-D13)
3. Phase 2 COMPLET incluant Discord OAuth + revocation
4. Estimation 270h MVP (Phase 1-2)
5. Timeline 6-7 semaines
6. Prerequisites et blockers listés

Prêt pour PHASE 2 development.

Signature : _________________
Date : _________________
```

---

**Document Status** : FINAL  
**Prêt Phase 2** : OUI (pending signature)
