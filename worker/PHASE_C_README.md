# Phase C — Notifications Web Push Cron Worker

**Status:** Implemented, ready for validation  
**Commit:** `16ba9df`  
**Tests:** ✅ 10/10 PASS  
**Build:** ✅ No errors  

---

## Quick Start

### Développement Local

```bash
cd worker

# Compiler
npm run build

# Lancer Worker en dev
wrangler dev --config wrangler-phase-c.toml

# Tests
npx vitest --run src/__tests__/notifications-phase-c.test.ts
```

### Test Envoi Simple (1 Subscriber)

```bash
# Obtenir un subscriptionId (voir plus bas)
subscriptionId="<votre-UUID>"

# Test POST
curl -X POST http://localhost:8787/test-send \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "'$subscriptionId'",
    "title": "Test Notification",
    "message": "Première notification Phase C!"
  }'

# Réponse attendue:
# { "ok": true, "result": "success", "subscriptionId": "..." }
```

---

## Architecture

### Fichiers

| Fichier | Rôle |
|---------|------|
| `src/notifications-phase-c.ts` | Worker Cron principal (600+ lignes) |
| `src/__tests__/notifications-phase-c.test.ts` | Tests (270 lignes) |
| `wrangler-phase-c.toml` | Configuration template |
| `src/notifications-cron.ts.bak` | Prototype (archived, non utilisé) |

### Handler Principal

**Scheduled (Cron):**
```typescript
async scheduled(event: ScheduledEvent, env: Env): Promise<void>
```
- Déclenché chaque heure (0 * * * * UTC)
- Lit CMS GitHub
- Identifie rappels dus
- Envoie Web Push à tous les subscribers
- Logs stats

**Fetch (Test):**
```typescript
async fetch(request: Request, env: Env): Promise<Response>
```
- POST `/test-send` → Teste 1 subscriber
- Requiert subscriptionId valide

---

## Configuration

### Avant Déploiement

**Remplir `wrangler-phase-c.toml`:**

```toml
[env.production.kv_namespaces]
binding = "NOTIFICATIONS_SUBSCRIPTIONS"
id = "abc123..."  # ← À récupérer depuis Phase B

[env.production.vars]
VAPID_PUBLIC_KEY = "BC..."  # ← Phase B
VAPID_PRIVATE_KEY = "..."   # ← Phase B
```

**Activer Cron (après validation):**

```toml
[[triggers.crons]]
crons = ["0 * * * *"]  # Décommentée quand prêt
```

---

## Données Requises

### Subscriptions (Phase B, KV)

```
KV Namespace: NOTIFICATIONS_SUBSCRIPTIONS

Clés existantes (réutilisées):
  subscription:<uuid> = {
    id: string
    endpoint: string (Push Service URL)
    keys: { p256dh, auth }
    status: 'active' | 'invalid' | 'failed_temp'
    createdAt: number
    lastSeenAt: number
  }
```

**Récupérer subscriptionId:**
```bash
# Dashboard Cloudflare → Workers → KV → NOTIFICATIONS_SUBSCRIPTIONS
# Chercher clé `subscription:*`

# OU via Wrangler:
wrangler kv:key list --binding NOTIFICATIONS_SUBSCRIPTIONS --prefix subscription:
```

### Notifications CMS (GitHub)

```
Fichier: app/public/cms/notifications.json

Format:
{
  "notifications": [
    {
      "id": "notif-1",
      "enabled": true,
      "title": "Event Title",
      "message": "Event Description",
      "imageUrl": "/images/icon.png",
      "tutorialId": "dragon-arena",
      "absoluteTime": 1697145600000,  // UTC timestamp
      "relativeReminders": [
        { "id": "r1", "enabled": true, "relativeDelay": "-24h", "status": "pending" },
        { "id": "r2", "enabled": true, "relativeDelay": "-3h", "status": "pending" },
        { "id": "r3", "enabled": true, "relativeDelay": "-30m", "status": "pending" }
      ]
    }
  ]
}
```

---

## Fonctionnalités

### ✅ Implémentées

- [x] **Lecture CMS:** Récupère notifications.json depuis GitHub
- [x] **Filtrage:** Identifie rappels dus (now >= dueTime)
- [x] **Tri:** Trie rappels chronologiquement (pas de perte)
- [x] **Batch:** Envoie chaque rappel à ~100 subscribers
- [x] **Déduplication:** Composite ID unique + KV TTL 7j
- [x] **Cleanup:** Supprime subscriptions mortes (410/404)
- [x] **Test Mode:** POST /test-send (1 subscriber)
- [x] **Logs:** Détaillés par section [Load], [Filter], [Send]

### ⏳ TODO (Phase 3.2)

- [ ] **Chiffrement:** Implémenter ECDH + AES-128-GCM dans `encryptPayload()`
  - Actuellement: Payload UTF-8 brut (sécurisé par HTTPS)
  - Nécessaire: Respecter spec Web Push standard

---

## Test Mode

### Endpoint: POST /test-send

**Payload:**
```json
{
  "subscriptionId": "<UUID de subscription>",
  "title": "Titre notification",
  "message": "Corps du message"
}
```

**Validation:**
- ✅ Vérifie subscriptionId existe en KV
- ✅ Vérifie status = 'active'
- ✅ Envoie si valide

**Réponse:**
```json
{
  "ok": true|false,
  "result": "success|failed|deleted|rate-limited",
  "subscriptionId": "..."
}
```

**Sécurité:**
- ✅ Pas de query endpoint public
- ✅ Requiert subscriptionId valide
- ✅ Parfait pour MVP 1-subscriber test

---

## KV Utilisation

### Existant (Phase B)

- `subscription:<id>` → Stocke endpoint, clés crypto
- Réutilisé tel quel

### Nouveau (Phase C)

- `notif-sent:<compositeId>` → `{ sentAt }`
- TTL: 7 jours (auto-expiration)
- Prévient: Double-send si Cron re-exécute

**Composite ID:**
```typescript
// SHA256(notificationId + "#" + reminderId + "#" + subscriptionId)
// Exemple: a1b2c3d4e5f6...g7h8i9j0 (64 hex chars)
```

### Optionnel (Logs)

- `cron-log:<date>` → [{ timestamp, stats }]
- `cron-errors:<date>` → [{ timestamp, error }]
- TTL: 30 jours

---

## Quotas

**Avec Cron 1h, ~100 subscribers, 3 notif/jour:**

| Ressource | Limit | Usage | OK? |
|-----------|-------|-------|-----|
| Cron exécutions | 24/jour | 24 | ✅ |
| KV reads | 100k | ~500 | ✅ |
| KV writes | 100k | ~1k | ✅ |
| Storage | 1GB | ~10MB | ✅ |

**Coût mensuel:** 0€ (Free Tier)

---

## Logs

### Activation

```bash
# Local dev
wrangler tail --config wrangler-phase-c.toml

# Production
wrangler tail --config wrangler-phase-c.toml --env production
```

### Format

```
[Cron] Démarrage — 2026-10-10T14:00:00Z
[Load] Récupération CMS GitHub...
[Load] 3 notification(s) chargée(s)
[Filter] Identification rappels dus...
[Filter] 2 rappel(s) due(s)
[Subs] Récupération subscriptions...
[Subs] 87 subscriber(s) actif(s)
[Send] Lancement envois...
[Reminder] notif-1#reminder-24h (date)
  [✓] sub-uuid-1
  [✓] sub-uuid-2
  [Dup] sub-uuid-3 (déjà envoyé)
  [410/404] sub-uuid-4 supprimée
[Send] Fin — 85 ✓, 0 ✗, 1 dup, 1 suppr, 0 rate-lim
```

---

## Debugging

### Test `/test-send` Verbeux

```bash
curl -v -X POST http://localhost:8787/test-send \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "test-sub-1",
    "title": "Debug Test",
    "message": "Testing"
  }' 2>&1 | tee test-send.log
```

### Inspecter KV

```bash
# Lister subscriptions
wrangler kv:key list --binding NOTIFICATIONS_SUBSCRIPTIONS --prefix subscription: --limit 10

# Lister entrées dédup
wrangler kv:key list --binding NOTIFICATIONS_SUBSCRIPTIONS --prefix notif-sent: --limit 10

# Récupérer une clé
wrangler kv:key get "notif-sent:a1b2c3..." --binding NOTIFICATIONS_SUBSCRIPTIONS
```

### Vérifier CMS GitHub

```bash
# Tester fetch depuis GitHub
curl -s https://raw.githubusercontent.com/Aenaril/Lords-Academy/main/app/public/cms/notifications.json | jq .

# Vérifier format
jq '.notifications | length' < notifications.json  # Nombre notifs
jq '.notifications[0].relativeReminders | length' < notifications.json  # Rappels
```

---

## Prochaines Étapes

### Avant Phase 3.3 (Production)

1. **Config:** Remplir KV ID + VAPID dans `wrangler-phase-c.toml`
2. **Test Local:** Lancer `wrangler dev`, POST `/test-send`
3. **Notification Test:** Créer entry dans CMS
4. **Valider:** Vérifier 1 subscriber reçoit
5. **Activation:** Décommenter Cron dans toml

### Déploiement

```bash
cd worker

# Compiler
npm run build

# Publier
wrangler publish --config wrangler-phase-c.toml --env production

# Vérifier
wrangler tail --config wrangler-phase-c.toml --env production
```

---

## Support

**Questions Fréquentes:**

- **"Notification pas reçue"** → Vérifier logs `/test-send`, subscriptionId valide
- **"Doublon envoyé"** → Vérifier clé KV `notif-sent:<id>` TTL
- **"CMS pas lu"** → Vérifier GitHub URL, format JSON
- **"410 Gone errors"** → Subscription morte, normale, supprimée auto

**Contacts:**
- Logs: `wrangler tail`
- Code: `src/notifications-phase-c.ts` (commenté)
- Tests: `src/__tests__/notifications-phase-c.test.ts`

