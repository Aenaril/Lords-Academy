# CORRECTIONS À V2.2 — Note Synthétique

**Date** : Octobre 2026  
**Scope** : 8 points de clarification avant Phase 2A

---

## 1. Historique GitHub Public (Révision Sauvegardes)

**Problème V2.2** : Commits Phase 1 considérés comme backup privé (faux).

**Correction** :
- Commits publics GitHub = accessibles publiquement (immédiat)
- Aucune garantie confidentialité rétroactive
- **Sauvegarde privée** = Responsibility utilisateur (git export local)
  - `git log --all --oneline > TUTORIAL_HISTORY_BACKUP.txt`
  - `git bundle create tutorial_backup.git` → stocker sécurisé local
  - Jamais re-push GitHub public

- **Traitement historique public** :
  - Phase 1 commits restent publics GitHub (pas de réécriture Git autorisée)
  - À partir Phase 2 : tutoriels JAMAIS dans GitHub public
  - Migration = transférer vers D1 + R2 (pas GitHub)

- **Vérification confidentialité** :
  - Audit humain : `git log --all --name-status -- app/public/content/`
  - Identifier quelle data sensible potentiellement exposée historiquement
  - Documenter pour audit trail

---

## 2. Permissions Discord (Pas de Pré-attribution)

**Problème V2.2** : Matrice montre R4/R5 avec permissions automatiques.

**Correction** :
- Matrice ILLUSTRATIVE uniquement (exemples, pas d'implémentation)
- R4, R5, Responsables, Recrues = **noms exemple**
- Vrais identifiants Discord rôles = **inconnus avant sync Phase 2**

- **Pattern** :
  ```
  1. Sync Discord API → importe rôles réels (IDs numériques)
  2. CMS affiche "Rôle: 987654321 (name unknown yet)"
  3. Admin crée mapping : "987654321 → Allow EDIT tutorials"
  4. Jamais d'auto-grant basé code
  ```

- **Permissions accordées après** :
  - Phase 2 Week 2 : rôles Discord sync
  - Phase 2 Week 3 : admin configure matrice CMS
  - Aucune permission appliquée jusqu'au CMS config

---

## 3. Vérification Accès (Synchrone + Async)

**Problème V2.2** : Async checks peuvent laisser passer accès expiré.

**Correction** :
- **Vérification synchrone critique** (bloquante) :
  ```
  GET /api/content/tutorial123
    1. Check session D1 : SELECT * FROM sessions WHERE id = ?
    2. IF NOT EXISTS → 401 Unauthorized
    3. IF expired (> 8h) → 401 Unauthorized  
    4. IF user_id empty → 401 Unauthorized
    5. ELSE → Continue to step 2
    
  2. Check permissions D1 (SAME REQUEST, même transaction) :
    1. SELECT roles FROM sessions WHERE id = ? (already verified in step 1)
    2. SELECT required_roles FROM tutorials_private WHERE id = ?
    3. IF roles ∩ required_roles = ∅ → 403 Forbidden
    4. ELSE → Retour tutoriel
  ```

- **Vérification asynchrone (background, NON-BLOQUANTE)** :
  ```
  Toutes les 5 min (Cron Worker) :
  - Refetch Discord roles pour sessions actives
  - Si roles changés : mark session "mustRefreshPerms"
  - Prochaine requête = re-verify
  - Jamais laisser passer vieille permission
  ```

- **Pas de grace period extension** :
  - Session 8h = expiry strict (pas de refresh auto)
  - Discord downtime = ne pas étendre validité
  - User doit se reconnecter si session expirée

---

## 4. Migration & Restauration (Stockage Unique)

**Problème V2.2** : Rollback pourrait réexposer GitHub public.

**Correction** :
- **Source de vérité unique** :
  ```
  Phase 1 (Current) : GitHub public (tutoriels)
  Phase 2 (Target) : D1 + R2 (tutoriels privés)
  Jamais bidirectionnel
  ```

- **Migration (one-way)** :
  ```
  1. Export D1 backup (avant migration)
     → Export JSON tutoriels depuis D1 (admin commande)
     → Stocker sécurisé local (user responsibility)
  
  2. Execute migration Phase 1 → Phase 2
     → GitHub public → D1 + R2
     → Impossibile rollback vers GitHub public
  
  3. IF erreur phase 2 :
     → Restore D1 from private backup (pas GitHub)
     → Requête user pour re-export
  ```

- **Pas de rewind GitHub public** :
  - Jamais réécrire commits historiques
  - Jamais push tutoriels D1 vers GitHub
  - GitHub reste = code + infra uniquement

---

## 5. Audit (Sensible Only — Strict)

**Problème V2.2** : Risk de logger toutes lectures (excessive).

**Correction** :
- **Events TOUJOURS loggés** :
  ```
  LOGIN  : Discord login attempt (success + fail)
  LOGOUT : Session revocation
  PUBLISH : Tutoriel publication
  DELETE : Tutoriel soft-delete
  ROLE_CHANGE : Rôle Discord sync, permissions modified
  PERMISSION_REVOKE : User blocked, session invalidated
  EMERGENCY_CODE_USED : Recovery code validation
  CONFIG_CHANGE : CMS settings modified
  ```

- **Events JAMAIS loggés** :
  ```
  GET /api/content/* : Lecture tutoriels (too verbose)
  POST /api/web-push/subscribe : User subscriptions
  GET /api/session/check : Permission checks (internal)
  Cache hits/misses
  Status pings
  ```

- **Retention** :
  - D1 `audit_logs` : 90 jours (auto-cron cleanup, older than 90d = delete)
  - No export to R2 (permanent) — just D1 rotation

---

## 6. Accès de Secours (Permanent, Indépendant)

**Problème V2.2** : Emergency codes comme fallback au password = confusion.

**Correction** :
- **Two independent recovery methods** :
  ```
  METHOD 1 : Emergency codes (PERMANENT)
  ├─ 10 one-time codes, hachés + stockés D1
  ├─ Codes imprimés = backup physique
  ├─ Valid jamais expirés (no TTL)
  ├─ Usage → force password reset
  └─ Indépendant Discord, jamais désactivé
  
  METHOD 2 : Password legacy (TRANSITOIRE Phase 2-3)
  ├─ Shared password R4 (existant)
  ├─ Fonctionne parallèle OAuth Discord
  ├─ Fallback si Discord downtime >5min
  ├─ Désactivé Phase 3 (Discord mandatory)
  └─ Avant désactivation : migrate comptes Discord
  ```

- **No lockout ever** :
  - Discord down → password reste usable (not time-limited)
  - Password compromised → emergency codes still work
  - Both methods broken → contact support (manual recovery)

---

## 7. Étapes Séquentielles (Pas "All-at-once")

**Problème V2.2** : Phase 2 monolithique (tous endpoints en même temps).

**Correction** :
- **Phase 2A (STEP 1 — Foundation)** :
  ```
  Week 1-2 :
  ✓ D1 schema (users, sessions, permissions, audit_logs)
  ✓ Discord OAuth endpoints (login, callback, token exchange)
  ✓ Session management (create, check, revoke)
  ✓ Emergency codes (hashing, validation, one-time use)
  ✓ Unit tests + integration tests
  ✗ Permission matrix (skeleton only, not enforced)
  ✗ Migration tutoriels (not yet)
  ✗ Web Push targeting (not yet)
  ✗ Audit logging (infrastructure ready, not in use)
  ```

- **Phase 2B (STEP 2 — Permissions Engine)** :
  ```
  Week 3-4 :
  ✓ Permission matrix D1 engine (lookup + enforce)
  ✓ Protect all 33 endpoints (permission checks active)
  ✓ Role synchronization Discord (CMS manual sync)
  ✓ Audit logging active (log sensible events)
  ✓ Integration tests (all endpoints)
  ✗ Migration tutoriels (not yet)
  ✗ Web Push targeting (not yet)
  ```

- **Phase 2C (STEP 3 — Content & Notifications)** :
  ```
  Week 5-6 :
  ✓ Migration tutoriels (Phase 1 → D1 + R2)
  ✓ Private content access control (D1 + R2 proxies)
  ✓ Web Push targeting (by roles)
  ✓ Full regression testing
  ✓ Security audit (penetration, access control)
  ```

---

## 8. Déploiement (Explicit Approval, No Auto)

**Problème V2.2** : Implicit continuous deployment assumption.

**Correction** :
- **NO automatic migrations** :
  - Phase 2A → staging environment only (GitHub Pages preview)
  - User tests explicitly
  - User says "go production"
  - Dev executes migration (manual command, logged)

- **Phase 2A Deployment** :
  ```
  1. Code ready (branch: feature/phase2a-oauth)
  2. Dev pushes to GitHub (PR, code review)
  3. GitHub Actions : run tests (staging preview automatic)
  4. User tests staging (login Discord, check sessions)
  5. User approves : "Ready production"
  6. Manual command : migrate D1 schema production
  7. Manual command : deploy Phase 2A production
  8. Monitor 24h (audit logs, errors)
  ```

- **NO data migration production** :
  - Phase 2A : zero production data changes
  - Phase 2C (tutoriels) : explicit user approval per tutoriel batch
  - Backup required before any migration

---

## Résumé Exécution

| Point | Avant | Après |
|-------|-------|-------|
| **GitHub historique** | Assumption sauvegarde privée | Utilisateur gère export backup |
| **Permissions** | Auto-grant R4/R5 | CMS manual mapping après sync |
| **Vérification accès** | Async backgroundable | Synchrone bloquant (+ async async-only) |
| **Restauration** | Possible rollback GitHub | Rollback D1 backup local uniquement |
| **Audit** | Verbose (all reads) | Sensible only (8 events définis) |
| **Secours** | Emergency codes = fallback | Dual-method independant (codes + password) |
| **Étapes** | Phase 2 monolithique | Phase 2A/2B/2C séquentielles |
| **Déploiement** | Implicit continuous | Explicit manual approval gates |

---

**Status** : Corrections incorporées dans Phase 2A (next document)
