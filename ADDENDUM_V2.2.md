# LORDS MOBILE ACADEMY — ADDENDUM V2.2
## Architecture Corrigée + Stratégie Migration Tutoriels + Roadmap Phase 2

**Date** : Octobre 2026  
**Status** : Conception finale (prête Phase 2)  
**Arbitrages** : D9-D13 définitifs confirmés

---

## 1. ARCHITECTURE TECHNIQUE RECOMMANDÉE

### 1.1 Répartition Stockage (D1 Primaire)

```
┌─────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE STORAGE — ARCHITECTURE COHÉRENTE & SÉCURISÉE         │
├──────────────────────┬──────────┬──────┬─────────────────────────┤
│ Type données         │ Service  │ TTL  │ Justification           │
├──────────────────────┼──────────┼──────┼─────────────────────────┤
│ Utilisateurs         │ D1       │ ∞    │ ACID, queries, revoc    │
│ Sessions (revocables)│ D1       │ 8h   │ Track actives, revoke   │
│ Permissions accès    │ D1       │ ∞    │ Matrix rôles Discord    │
│ Rôles Discord        │ D1       │ ∞    │ Import + historique     │
│ Audit sensible       │ D1       │ ∞    │ Queries, export, trace  │
│ Métadata cache       │ KV       │ 1h   │ Revalidation async      │
│ CSRF nonces          │ KV       │ 5m   │ Ephemeral court-terme   │
│ Brouillons tutoriels │ DO       │ ∞    │ Atomicité, conflicts    │
│ Tutoriels privés     │ R2       │ ∞    │ CDN statique, sécurisé  │
│ Médias privés        │ R2       │ ∞    │ Lifecycle controlée     │
│ Push subscriptions   │ KV       │ ∞/del│ User control revoke     │
│ Code source          │ GitHub   │ —    │ Public non-confidentiel │
└──────────────────────┴──────────┴──────┴─────────────────────────┘
```

### 1.2 Quotas Cloudflare 2024 (Vérifiés Officiels)

**D1 Database (CRITIQUE — Maintenant Primaire)**
```
├─ Opérations : 100,000 / jour ✅
├─ Stockage : 3 GB ✅
├─ ACID transactions : Oui ✅
├─ SQL queries : Oui ✅
└─ Phase 2 usage :
   ├─ User table : 50-100 rows
   ├─ Sessions : <500 actives (8h TTL)
   ├─ Permissions : <300 rows (rôles Discord)
   ├─ Audit : ~500 logs/jour (90j rolling)
   └─ TOTAL OPS : ~2-3k/jour = 3% quota ✅ SAFE
```

**KV Namespace (CACHE + EPHEMERAL UNIQUEMENT)**
```
├─ Reads : 100,000 / mois ✅
├─ Writes : 1,000 / mois ✅
└─ Phase 2 usage : ~100 writes/mois (métadata) = 10% quota ✅
```

**Durable Objects**
```
├─ Writes : 1M / mois ✅
└─ Phase 2 usage : <1k brouillons = <0.1% quota ✅
```

**R2 Bucket**
```
├─ Reads : 10,000 / mois ✅
├─ Writes : 1,000 / mois ✅
├─ Storage : 10 GB ✅
└─ Phase 2 images privés : ~100 ops/mois = 10% quota ✅
```

### 1.3 Garanties Sécurité

**Sessions Révocables (D1)**
- Chaque session = row D1 unique
- UUID session stocké HttpOnly cookie
- Lookup direct : `SELECT * FROM sessions WHERE id = ?' LIMIT 1`
- Revocation immédiate = `DELETE FROM sessions WHERE user_id = ?`
- Vérification rôles = `SELECT roles FROM sessions WHERE id = ? + check expiry`
- Grace period Discord down = max 5 min (no extension beyond last valid check)

**Tutoriels Privés (R2 + D1 ACL)**
- Tutoriels stockés R2 (jamais GitHub public)
- Accès contrôlé via DB lookup (D1) : `SELECT * FROM resources WHERE id = ? AND user_roles ∩ required_roles`
- URLs R2 jamais exposées directement (proxy via /api/content/tutorialId)
- Audit chaque accès privé (log D1)

**Permissions (D1 + Discord Sync)**
- Rôles Discord = sources truth
- Sync manual depuis CMS (jamais auto-grant)
- Matrice permissions = D1 table
- Nouvelle API Discord = refetch max 5 min
- Rôle perdu = accès révoqué dans 5 min max

---

## 2. STRATÉGIE MIGRATION TUTORIELS (Entièrement Privés)

### 2.1 Principes

1. **Aucun tutoriel public** : Tous privés (D9 arbitrage)
2. **Aucun stockage public GitHub pour tutoriels** : Code + infra uniquement
3. **Historique existant protégé** : Commits Git restent accessibles via git history, pas via URLs web
4. **Médias non-accessibles anonymement** : Même couvertures tutoriels

### 2.2 État Actuel (Phase 1)

```
GitHub public/content/
├─ tutorialId.json (tutoriels publiés)
├─ index.json (index global)
└─ images/ (couvertures, illustrations)
```

**Phase 1 : Ces fichiers PUBLICS car D9 n'était pas appliqué**

### 2.3 Migration V2 (Entrée Phase 2)

**Étape 1 : Audit préalable (MANUEL, semaine -1)**
```
Actions utilisateur :
1. Exporter tous les commits Phase 1 depuis Git
   → git log --oneline app/public/content/ > MIGRATION_AUDIT.txt
2. Exporter tous les tutoriels JSON
   → git show HEAD:app/public/content/index.json > current_tutorials.json
3. Exporter historique images
   → git ls-tree -r HEAD -- app/public/content/images/ > image_history.txt
4. Archiver ces fichiers sécurisé (backup local = responsabilité user)
```

**Étape 2 : Migration Infrastructure (AUTOMATISÉE, week 1-2 Phase 2)**
```
Développement :
1. Créer table D1 `tutorials_private`
   ├─ id, title, category, difficulty, content_json
   ├─ visibility (PUBLIC | PRIVATE)
   ├─ required_roles (JSON array Discord role IDs)
   ├─ created_at, updated_at, published_at
   ├─ status (DRAFT | PUBLISHED | ARCHIVED)
   └─ created_by (user_id)

2. Créer table D1 `tutorial_media`
   ├─ id, tutorial_id, media_type (COVER | ILLUSTRATION | SCREENSHOT)
   ├─ r2_key (path R2 object)
   ├─ uploaded_at, uploaded_by
   └─ lifecycle_expiry (si contenu parent supprimé)

3. Créer endpoint API /api/migrate/tutorial-v1-to-v2
   ├─ Lit tous tutoriels GitHub public
   ├─ Pour chaque tutoriel :
   │  ├─ Parse JSON
   │  ├─ Insère D1 `tutorials_private` (visibility = PRIVATE)
   │  ├─ Insère média references D1
   │  ├─ Upload images R2 (de GitHub)
   │  └─ Log success/failure
   ├─ Retour migration report JSON
   └─ Endpoint /api/migrate/rollback-to-v1 (restore from backup)

4. Créer endpoint /api/content/tutorialId
   ├─ Authentification Discord required
   ├─ Permission check : user roles vs required_roles
   ├─ Audit log : accès à tutoriel ID
   ├─ Retour tutoriel JSON (jamais URLs statiques)
   └─ Images R2 : servies via proxy endpoint

5. Créer endpoint /api/media/mediaId
   ├─ Permission check D1 (qui peut accéder)
   ├─ Redirect R2 URL (signed URL, 1h TTL)
   └─ Audit log accès media

6. Modifier /api/list/tutorials
   ├─ Avant : GET public JSON GitHub
   ├─ Après : GET D1, filter required_roles vs user roles
   ├─ Retour liste tutoriels autorisés uniquement
```

**Étape 3 : Validation & Cutover (week 3, Phase 2)**
```
Tests (Développeur) :
1. Migration exécutée sur staging
2. Tous tutoriels importés D1 + R2 ✓
3. Authentification Discord active ✓
4. Permission checks fonctionnent ✓
5. Audit logs traceent accès ✓
6. Fallback GitHub data accessible via git history ✓

Validation (Utilisateur) :
1. Login Discord successful
2. Consulter tutoriels privés (dépend rôles)
3. Vérifier access denied si pas rôle requis
4. Vérifier audit logs créés
5. Signoff migration réussie

Production Cutover :
1. Exécuter migration D1 + R2 (prod)
2. Maintenir GitHub public historical access (git log accessible)
3. Activer permission checks /api/content/*
4. Monitorer audit logs (erreurs)
5. Archive GitHub /app/public/content/ (backup, not served)
```

### 2.4 Historique Git Protégé

```
Ancien accès public (Phase 1) :
GET https://lords-academy.pages.dev/content/dragon-arena.json
→ Maintenant : 404 (fichier supprimé Pages)

Accès historique Git (Backup) :
git show HEAD~10:app/public/content/dragon-arena.json
→ Reste possible (archive locale)

Accès via API (Phase 2) :
GET /api/content/dragon-arena (avec auth Discord)
→ Lookup D1 + permission check
→ Retour tutoriel JSON sécurisé
```

### 2.5 Absence de TTL Suppression

```
Tutoriels privés (D1) :
├─ Persistence ∞ (jamais auto-expiry)
├─ Suppression = admin soft-delete seulement (status = ARCHIVED)
├─ Restauration possible = unarchive
└─ Hard delete = audit + explicit user action

Médias privés (R2) :
├─ Persistence ∞ tant que tutoriel actif
├─ Lifecycle rule = orphans cleanup seulement
│  ├─ Si tutoriel supprimé = marquer media orphaned
│  ├─ After 30 days orphaned = delete R2 object
│  └─ Audit log : media cleanup
└─ Jamais auto-expiry basée time
```

---

## 3. PÉRIMÈTRE PHASE 2 (COMPLET — PAS DE REPORT)

### 3.1 Fonctionnalités Développement

**Discord OAuth2 Intégration**
- ✅ Login Discord flow (authorization + callback)
- ✅ Token exchange + user info fetch
- ✅ Guild membership verification
- ✅ Token refresh (7 days auto)
- ✅ Revocation on logout

**Role Management**
- ✅ Import tous rôles Discord (API fetch)
- ✅ Synchronization manual CMS (admin button)
- ✅ Track role changes historique

**Permission Matrix**
- ✅ Tous 33 endpoints sécurisés
- ✅ Permission checks D1 lookups
- ✅ Deny-by-default pattern
- ✅ No auto-grant (explicit CMS config)

**Sessions Sécurisées**
- ✅ 8 hours TTL (D1 tracked)
- ✅ Role verification max 5 min (background async)
- ✅ Revocation immediate (user deleted / role removed)
- ✅ Grace period Discord down = 5 min max (no extension)

**Admin Access Fallback**
- ✅ Emergency recovery codes (one-time use)
- ✅ Codes hachés + stockés D1 permanent
- ✅ Codes imprimés = backup physique user
- ✅ Password legacy (transitoire, désactivé Phase 3)

**Audit Logging**
- ✅ Opérations sensibles = D1 log
- ✅ Logins, publications, perms changes, config
- ✅ 90 jours retention rolling (auto-cleanup D1 cron)
- ✅ Export CSV fonctionnalité

**Web Push Targeting**
- ✅ Subscribe/unsubscribe infrastructure (existant)
- ✅ Targeted broadcast by roles (send-targeted API)
- ✅ Deduplication (same notification ≠ 2x same user)
- ✅ Audit push sends

**Migration Tutoriels**
- ✅ GitHub public → R2 private + D1 metadata
- ✅ Historique Git accessible (backup)
- ✅ All media migrated R2
- ✅ Permissions applied all content

**Testing & Validation**
- ✅ Unit tests (permission checks, role logic)
- ✅ Integration tests (OAuth flow, revocation)
- ✅ Security tests (unauthorized access attempts)
- ✅ Non-regression tests (Phase 1 preserved)
- ✅ Load tests (50 concurrent Discord logins)

### 3.2 Phase 3 EXCLUE (Nicht Phase 2)

- ❌ CMS avancé (formulaires dynamiques)
- ❌ Analytics dashboard
- ❌ Advanced audit queries
- ❌ D1 automated backup (manual export ok)
- ❌ Discord slash commands / bot integrations

---

## 4. MATRICE PERMISSIONS (CORRIGÉE — Tutoriels Tous Privés)

```
MODULE TUTORIELS
├─ VIEW public tutoriels         ❌ NONE (all private now)
├─ VIEW tutoriels (guild)        GUILD_MEMBER ✅
├─ VIEW tutoriels (rôles)        DISCORD_ROLE[X] ✅ (configurable)
├─ VIEW brouillons              R4/R5 Discord roles (explicit)
├─ EDIT tutoriels               R4/R5 Discord roles (explicit)
├─ PUBLISH                       R4/R5 Discord roles (explicit)
└─ DELETE (soft)                 R4 Discord role (explicit)

MODULE CMS
├─ EDIT themes                   R4/R5 Discord roles (explicit)
├─ EDIT announcements            R4/R5 Discord roles (explicit)
├─ EDIT events                   R4/R5 Discord roles (explicit)
└─ PUBLISH config                R4/R5 Discord roles (explicit)

MODULE NOTIFICATIONS
├─ SUBSCRIBE                     PUBLIC ✅ (consent)
├─ UNSUBSCRIBE                   Own subscription only ✅
├─ RECEIVE public                PUBLIC ✅
├─ RECEIVE guild                 GUILD_MEMBER ✅
├─ RECEIVE role-specific         DISCORD_ROLE[X] ✅
└─ SCHEDULE broadcasts           R4/R5 Discord roles (explicit)

MODULE IMAGES
├─ UPLOAD                        R4/R5 Discord roles (explicit)
└─ DELETE                        R4 Discord role (explicit)

MODULE AUDIT
├─ READ own actions              GUILD_MEMBER ✅
├─ READ all actions              R4/R5 Discord roles (explicit)
└─ EXPORT logs                   R4/R5 Discord roles (explicit)

MODULE ADMIN
├─ MANAGE Discord roles          R5 Discord role (explicit)
├─ MANAGE permissions            R5 Discord role (explicit)
├─ BLOCK user session            R5 Discord role (explicit)
└─ VIEW active sessions          R4/R5 Discord roles (explicit)

NOTES:
✅ = AutomaticGranted (public or guild member)
(explicit) = No auto-grant, configure via CMS
DISCORD_ROLE[X] = Reference Discord role ID (none hardcoded)
```

---

## 5. OPÉRATIONS MANUELLES (UTILISATEUR)

### Pre-Phase 2 (Week -1)

1. **Créer Discord application**
   - Discord Developer Portal
   - OAuth2 redirect URI : `https://lords-academy.pages.dev/auth/callback`
   - Scopes : `identify`, `guilds.members.read`
   - Get : `client_id`, `client_secret`

2. **Créer Discord bot (optionnel, pour API fetch rôles)**
   - Bot token
   - Permissions : `Read Members`
   - Invite bot to guild

3. **Audit Phase 1 tutoriels**
   - `git log --oneline app/public/content/` > MIGRATION_AUDIT.txt
   - `git show HEAD:app/public/content/index.json` > current_tutorials.json
   - Archive local sécurisé

4. **Générer codes recovery emergency**
   - 10 codes (format : EMERGENCY-XXXXXXXX-XXXXXXX)
   - Imprimer + stocker physique (safe/vault)
   - Never share digitally

### Week 1-2 Phase 2

5. **Configure Cloudflare wrangler.toml**
   - Add D1 binding : `databases = [{binding = "DB", database_id = "..."}]`
   - Add Discord secrets via `wrangler secret put`
   - Test KV namespaces active

6. **Valider D1 schema créé**
   - Tables : `users`, `sessions`, `permissions`, `audit_logs`, `tutorials_private`, `tutorial_media`
   - Indexes : `sessions.id`, `sessions.user_id`, `tutorials_private.id`
   - No data yet (clean slate)

### Week 3-4 Phase 2

7. **Migration tutoriels (après validation staging)**
   - Admin exécute : `POST /api/migrate/tutorial-v1-to-v2`
   - Vérifie report : X tutoriels importés, Y media uploadés
   - If error : rollback = `POST /api/migrate/rollback-to-v1`

8. **Configure permissions CMS**
   - Admin accède CMS → "Discord & Rôles"
   - Mappe rôles Discord → permissions tutoriels
   - Exemple : "R4" → EDIT + PUBLISH, "Recrues" → VIEW only
   - Save configuration D1

9. **Test Discord login**
   - Login Discord workflow
   - Verify user roles affichés
   - Verify permission checks (authorized vs unauthorized)

10. **Signoff & Launch**
    - Utilisateur valide readiness
    - Production deployment Phase 2
    - Monitor audit logs (24h observation)

---

## 6. RISQUES RÉSIDUELS

### Résidus Acceptables

| Risque | Mitigation | Impact |
|--------|-----------|--------|
| Discord API downtime | Grace 5 min (sessions persist) | Sessions active 5min post-outage |
| D1 performance | Monitoring quota / index optimization | <3% quota Phase 2 |
| R2 file loss | Cloudflare SLA 99.9% uptime | Statistique negligible |
| Git history exposure | Not served via web, git access only | Low (requires dev knowledge) |
| Migration data loss | Manual backups + staging test first | Mitigated by audit |

### Résidus Éliminés

- ❌ Public access tutoriels = FIXED (D1 + R2)
- ❌ Sessions non-révocables = FIXED (D1 track)
- ❌ TTL auto-expiry = FIXED (no TTL except sessions)
- ❌ Permissions non-granulaires = FIXED (Discord roles)

---

## 7. VALIDATION PREMIÈRE ÉTAPE (Phase 2A = Week 1-2)

### Critères Acceptation

- ✅ D1 schema créé (6 tables)
- ✅ Discord OAuth endpoints implémentés (`/api/auth/discord/login`, `/callback`)
- ✅ Token exchange + guild membership verify
- ✅ Session storage D1 working
- ✅ Emergency codes hachés + stockés D1
- ✅ KV tests passing (metadata cache)
- ✅ All 33 endpoints permission-protected (mock checks ok)
- ✅ Audit logging infrastructure active (log-to-D1)
- ✅ No regression Phase 1 (tutoriels existants consultables R4)

### Blockers Go/NoGo

| Blocker | Go | NoGo | Resolution |
|---------|-----|-----|------------|
| D1 creation | ✅ | ❌ | Admin contact Cloudflare |
| Discord bot credentials | ✅ (weekly) | ❌ | Create Discord app first |
| KV reachable | ✅ | ❌ | Test wrangler preview |
| GitHub token working | ✅ | ❌ | Verify token scope + permissions |
| Phase 1 data backed up | ✅ | ❌ | git log export required |

---

## 8. DÉCISIONS DÉFINITIVES (D9-D13 CONFIRMÉES)

| Arbitrage | Stat | Implique | Fixe |
|-----------|------|---------|------|
| D9 : ALL_PRIVATE | ✅ | R2 + D1 ACL | Aucun tutoriel public |
| D10 : ALL_ROLES | ✅ | Discord API sync | Rôles = sources truth |
| D11 : FALLBACK_PERMANENT | ✅ | Emergency codes + password legacy | No lockout ever |
| D12 : SENSIBLE_AUDIT | ✅ | D1 logging (login, publish, perms, config) | Privacy + manageability |
| D13 : 8HOURS | ✅ | Sessions D1 8h TTL, roles ↻ 5min | Revocation max 5 min |

---

## 9. CHEMIN EXACT DOCUMENT

```
c:\xampp\htdocs\Lords-Mobile-Academy\ADDENDUM_V2.2.md
```

---

**Document Status** : FINAL & PRÊT PHASE 2  
**Attente** : Signature utilisateur sur validation

