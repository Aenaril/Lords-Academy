# Phase B : Recommandations Web Push — Après Phase A

**Date** : 2026-10-10  
**Statut** : Phase A terminée (correction API, migration, modèles)  
**Audience** : Développeurs Phase B

---

## 1. Choix de Persistance : KV vs Durable Objects

### Comparaison pour 100 utilisateurs

| Critère                   | KV Namespace                  | Durable Objects + SQLite           |
| ------------------------- | ----------------------------- | ---------------------------------- |
| **Quotas gratuits**       | 100k reads, 1k writes/jour    | 1M writes/jour, stockage SQL       |
| **Latence**               | ~5ms                          | ~2ms (co-local avec logic)         |
| **Cohérence**             | Éventuellement cohérent       | Strongly consistent (transactions) |
| **Coût au-delà**          | $0.50 / million reads         | $12 / 1M write-ops                 |
| **Complexité**            | JSON simple                   | SQLite migrations                  |
| **100 users cas nominal** | 100 reads × 1 send/jour = sûr | Overkill, mais flexible            |

### Recommandation : **KV + Audit Trail**

**Raison** :

- ✅ Suffisant pour 100 utilisateurs
- ✅ Coûts zerp (vs $12/M writes en DO payant)
- ✅ Pas de migrations SQLite à gérer
- ✅ LocalStorage + API + KV = architecture simple

**Limitations acceptées** :

- ⚠️ Cohérence éventuellement (rarement un problème pour notifications)
- ⚠️ Quotas serrés si >1000 utilisateurs
- ⚠️ TTL auto-expiration (pas de soft delete)

**Plan B si dépassement** :

- Si >500 utilisateurs : passer à Durable Objects avec transactions
- Prévoir le code base pour cette migration ultérieurement

---

## 2. Bibliothèque Web Push : `pushforge`

### Choix validé : **pushforge**

```bash
npm install pushforge@latest
```

**Propriétés** :

- ✅ Zéro dépendances npm
- ✅ Web Crypto API natif (disponible dans Workers)
- ✅ ECDP256 signing (VAPID)
- ✅ AES-128-GCM encryption (standard Web Push)
- ✅ ~5 KB (ultra-léger)
- ✅ Bien maintenu (repo : marpple/pushforge)

**Alternative OK** : `cf-webpush` (aussi léger, Cloudflare-testé)

**À ÉVITER** : `web-push` npm (dépendances Node.js, polyfills lourds, issues Worker)

### Intégration Phase B

```typescript
// worker/src/notifications-sender.ts
import { sendPushMessage } from 'pushforge';

export async function sendPush(
  subscription: PushDeviceSubscription,
  payload: NotificationPayload,
  vapidKeys: VapidKeyPair,
): Promise<PushSendEvent> {
  try {
    const response = await sendPushMessage(subscription, payload, {
      vapidDetails: {
        privateKey: vapidKeys.private,
        publicKey: vapidKeys.public,
        subject: 'mailto:admin@example.com',
      },
    });

    return {
      id: generateId(),
      subscriptionId: subscription.id,
      status: response.ok ? 'success' : 'failed',
      httpStatus: response.status,
      sentAt: Date.now(),
    };
  } catch (err) {
    // Gestion d'erreur + nettoyage si 410 Gone
    return handlePushError(err, subscription);
  }
}
```

---

## 3. Secrets VAPID : Génération et Configuration

### Génération (à faire une seule fois, hors du repo)

**Localement** (jamais en CI) :

```bash
# Option 1 : web-push CLI (Node.js local)
npx web-push generate-vapid-keys

# Output :
# Public Key: BMjPjWZR...
# Private Key: vHr8iL3d...
```

**Résultat** :

```
VAPID_PUBLIC_KEY=BMjPjWZR1j2K3lM4nOpQrStUvWxYzAbCdEfGhIjKlMnOp...
VAPID_PRIVATE_KEY=vHr8iL3dK9mNoPqRsTuVwXyZaBcDeFgHiJkLmNoPq...
VAPID_SUBJECT=mailto:dev@lordsmobileacademy.local
```

### Stockage Sécurisé (Cloudflare Worker Secrets)

**Jamais en code, jamais en .env public.**

```bash
# Phase B : Configuration manuelle
# 1. Dashboard Cloudflare → Workers → Settings → Secrets
# 2. Ajouter trois secrets :

SECRET_VAPID_PRIVATE_KEY = "vHr8iL3d..."
SECRET_VAPID_PUBLIC_KEY = "BMjPjWZR..."
SECRET_VAPID_SUBJECT = "mailto:admin@example.com"

# 3. Dans wrangler.toml (Phase B) :
[env.production]
vars = { VAPID_SUBJECT = "mailto:admin@example.com" }
```

### Distribution de la Clé Publique

**OK d'exposer** (c'est publique, mais intègre) :

```bash
# app/.env.local (et env.production)
VITE_VAPID_PUBLIC_KEY=BMjPjWZR... # ✅ Public, sûr
```

**Frontend va l'utiliser** :

```typescript
// app/src/utils/notifications.ts
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const subscription = await pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY,
});
```

---

## 4. Configuration Cloudflare Phase B

### Fichier `worker/wrangler.toml` à ajouter

```toml
# VAPID et secrets
[env.production]
vars = { VAPID_SUBJECT = "mailto:admin@lordsmobileacademy.local" }

# KV Namespaces pour notifications
[[kv_namespaces]]
binding = "NOTIFICATIONS_SUBSCRIPTIONS"
id = "<create-this-in-dashboard>"
preview_id = "<create-this-in-dashboard>"

[[kv_namespaces]]
binding = "NOTIFICATIONS_SCHEDULES"
id = "<create-this-in-dashboard>"
preview_id = "<create-this-in-dashboard>"

# ⚠️ Cron trigger — À configurer en Phase B SEULEMENT
# Phase A : cette section est un placeholder
# Phase B : Implémenter vérification périodique (toutes les 30 min en UTC)
# avec déduplication et tolérance d'horaires (±5 min)
#
# [[triggers.crons]]
# crons = ["*/30 * * * *"]  # Toutes les 30 minutes
```

### KV Namespaces à créer

1. **Cloudflare Dashboard** → Workers & Pages → KV
2. **Créer deux namespaces** :
   - `notifications-subscriptions-prod`
   - `notifications-schedules-prod`
   - (+ versions preview si besoin)

3. **Copier les IDs** dans `wrangler.toml`

### Pages Function Bindings

1. **Cloudflare Dashboard** → Pages → Settings → Functions
2. **KV Namespace Bindings** : Ajouter les deux namespaces
   - Binding : `NOTIFICATIONS_SUBSCRIPTIONS`
   - KV namespace : `notifications-subscriptions-prod`
   - (Répéter pour schedules)

---

## 5. Vérification Périodique des Rappels (Phase B)

### Architecture recommandée (NOT quotidien)

**Problème** : Un seul Cron quotidien (9 AM UTC) ne peut pas couvrir des rappels programmés à différentes heures.

**Solution** : Vérification périodique avec déduplication

```
Architecture :
- Cron Worker déclenché toutes les 30 minutes (UTC)
- À chaque trigger :
  1. Lire KV NOTIFICATIONS_SCHEDULES (toutes les programmations)
  2. Pour chaque schedule + rappel relatif :
     * Calculer deadline = absoluteTime + relativeDelay
     * Vérifier si now >= deadline
     * Vérifier clé de déduplication (jamais envoyer deux fois)
     * Si deadline atteinte ET pas déjà envoyé :
       - Envoyer le push
       - Marquer le rappel comme 'sent'
       - Logger l'événement
  3. Si timeout (30 secondes) :
     * Terminer gracieusement
     * Retry au prochain cycle (30 min plus tard)

Déduplication :
- Clé : `${scheduleId}#${reminderId}#${subscriptionId}`
- Stockage : KV sous `SENT_NOTIFICATIONS:${key}`
- TTL : 7 jours (après = peut renvoyer en cas d'oubli)

Tolérance :
- Envoyer si : deadline - now est entre -5 min et +5 min
- Évite les faux positifs (now juste avant deadline)
```

### Configuration Phase B

```toml
# Cron trigger — tous les 10 minutes pour précision
[[triggers.crons]]
crons = ["*/10 * * * *"]  # Toutes les 10 minutes en UTC
```

**Avantages** :

- ✅ Couvre rappels à N'IMPORTE quelle heure
- ✅ Exécutions fréquentes = précision ±10 min max (tolérable pour notifications)
- ✅ Déduplication = pas de doubles envois
- ✅ Retry automatique si Worker timeout
- ✅ 144 exécutions/jour << 100k request cap gratuit

### Quotas avec cette approche

| Limite           | Par jour               | Pour 100 users                          |
| ---------------- | ---------------------- | --------------------------------------- |
| **Cron trigger** | 5 max (1 seul utilisé) | 1 trigger/10 min = 144/jour >> 5 max ✅ |

**Clarification Cloudflare** :

- Les 5 Cron triggers max = 5 **différents** schedules de Cron
- UN seul Cron qui s'exécute 144 fois/jour = 1 "trigger" (le schedule)
- ✅ Safe : UNE seule ligne `[[triggers.crons]]`

### Temps de livraison des rappels

| Rappel               | Intervalle | Pire cas en retard |
| -------------------- | ---------- | ------------------ |
| H-24h (1440 minutes) | ±10 min    | -10 min (2e exéc)  |
| H-3h (180 minutes)   | ±10 min    | -10 min (2e exéc)  |
| H-30m (30 minutes)   | ±10 min    | -10 min (2e exéc)  |

Interprétation : Avec `*/10 min`, chaque rappel peut arriver **jusqu'à 10 minutes après** son heure programmée. C'est acceptable car :

- Les utilisateurs reçoivent la notification avec une latence prévisible
- Les alertes ne sont jamais perdues (redélivered à la prochaine run)
- Pas d'alertes "trop tôt" (le système fonctionne par seuil ≥, jamais <)

### Risques et Mitigations

1. **Worker timeout (30s)**
   - Risque : Notifications perdues si >100 subscriptions
   - Mitigation : Limiter batch à 50 subscriptions/run, queue reste en attente pour prochaine exécution

2. **KV quota**
   - Risque : 144 reads/jour × 100 subscriptions = 14.4k reads — Safe ✅
   - 144 writes/jour (marquer sent) × 100 = 14.4k writes — Safe ✅

3. **Notifications tardives**
   - Risque : Rappel 24h avant = intervalle ±10 min
   - Mitigation : **Acceptable** pour notifications utilisateur
   - Alternative : Cron toutes les 5 min si plus haute précision requise (vérifier quotas)

---

## 6. Limites du Plan Gratuit (avec mitigation)

| Limite            | Quotidien | Mitigation                                         |
| ----------------- | --------- | -------------------------------------------------- |
| **KV reads**      | 100k      | 144 Cron runs × 100 reads = 14.4k reads → ✅ Safe  |
| **KV writes**     | 1k        | 144 Cron runs × mark sent = 14.4k writes → ✅ Safe |
| **Cron triggers** | 5 max     | 1 trigger (`*/10 min`) = 1 utilisé → ✅ Safe       |
| **Request cap**   | 100k/jour | 48 runs × 100 push = 4800 requests → ✅ Safe       |

**Clarification** : Les 4800 writes/jour dépassent le quota gratuit (1k). **Solution Phase B** :

- Batch les writes (1 appel KV/reminder, pas par subscription)
- Ou utiliser Durable Objects (transactions SQLite) pour >100 users

### Risques et Mitigations

1. **Spike d'inscriptions** (ex: 1000 users en 1h)
   - Risque : Quota KV write dépassé
   - Mitigation : Rate-limit front-end, queue local sur 1h

2. **Worker timeout (30s) avec >100 users**
   - Risque : Notifications perdues
   - Mitigation : Limiter batch, retry prochain Cron (30 min après)

3. **Push Service retry chain**
   - Risque : Requêtes perdues = KV ops qui comptent mais aucun envoi
   - Mitigation : Déduplication `scheduleId#reminderId#subscriptionId` + retry

---

## 7. API Stateless (Phase A → B)

### Avant (Phase A) :

```typescript
// app/functions/api/cms/notifications
POST /api/cms/notifications
{
  action: 'subscribe',
  subscription: { ... }
}
→ 503 Service Unavailable (pending KV setup)
```

### Après (Phase B) :

```typescript
// Action 1 : Subscribe
POST /api/cms/notifications
{
  action: 'subscribe',
  subscription: { endpoint, keys: { p256dh, auth } }
}
→ 201 Created { subscriptionId, status: 'active' }

// Action 2 : Unsubscribe
POST /api/cms/notifications
{
  action: 'unsubscribe',
  subscriptionId: "sub-123"
}
→ 204 No Content

// Action 3 : Schedules (admin only, auth + CSRF)
POST /api/cms/notifications
{
  action: 'schedules',
  schedules: [ { id, title, absoluteTime, reminders: [...] } ]
}
→ 200 { ok: true, count: 2 }

// Action 4 : Broadcast manually (admin, auth + CSRF)
POST /api/cms/notifications
{
  action: 'broadcast_now',
  scheduleId: "sched-123"
}
→ 202 Accepted { broadcastId, estimatedRecipients: 45 }
```

### Validation stricte Phase B

- ✅ Reject malformed subscriptions (no p256dh, auth)
- ✅ Reject expired endpoints (after unsubscribe)
- ✅ Reject duplicate IDs (de-duplicate via KV key)
- ✅ Reject if schedule references non-existent tutorial

---

## 8. Service Worker Push Event Handler

### Fichier `app/public/sw.js` (ou `app/src/sw.ts`)

Phase B doit implémenter :

```typescript
// Handle incoming push notification
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {
    title: 'Lords Mobile Academy',
    body: 'Nouvelle notification',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/images/logo-192.png',
      badge: '/images/badge-96.png',
      tag: data.scheduleId || 'lma-notification',
      requireInteraction: data.requireInteraction ?? false,
      data: {
        url: data.tutorialId ? `/tutorials/${data.tutorialId}` : '/',
      },
    }),
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data?.url ?? '/';

      // Focus existing window si déjà ouvert
      const existing = clientList.find((c) => c.url.endsWith(url));
      if (existing) return existing.focus();

      // Sinon ouvrir nouveau
      return clients.openWindow(url);
    }),
  );
});
```

---

## 9. Flux Complet (Phase B) : Subscribe → Schedule → Send

```
1. FRONTEND USER
   ├─ Clic "S'abonner aux notifications"
   ├─ Demande permission navigateur
   ├─ PushManager.subscribe({ userVisibleKey })
   ├─ POST /api/cms/notifications { action: 'subscribe', subscription }
   └─ KV : NOTIFICATIONS_SUBSCRIPTIONS[endpoint] = subscription

2. ADMIN CMS
   ├─ Crée programmation dans NotificationsModule
   ├─ Définit title, message, absoluteTime, reminders
   ├─ Clique "Sauvegarder en brouillon"
   ├─ POST /api/cms/notifications { action: 'schedules', schedules: [...] }
   └─ KV : NOTIFICATIONS_SCHEDULES[scheduleId] = schedule

3. CRON TRIGGER (9 AM UTC)
   ├─ Worker lit KV NOTIFICATIONS_SCHEDULES
   ├─ Pour chaque schedule.relativeReminders :
   │  ├─ Lit KV NOTIFICATIONS_SUBSCRIPTIONS (all)
   │  ├─ Pour chaque subscription (100 users) :
   │  │  ├─ Calcule deadline = absoluteTime + relativeDelay
   │  │  ├─ Si (now >= deadline) :
   │  │  │  ├─ appelle sendPushMessage(subscription, payload, vapidKeys)
   │  │  │  ├─ Si succes (201) : log success
   │  │  │  ├─ Si 410 Gone : supprime subscription + log
   │  │  │  └─ Si erreur : log retry, keep subscription active
   │  │  └─ Fin
   │  └─ Fin
   └─ Marque schedule.status = 'sent'

4. USER DEVICE
   ├─ Push Service (ex: FCM) notifie navigateur
   ├─ Service Worker 'push' event
   ├─ showNotification() + user voit notification
   └─ Clic → navigationclick → ouvre app
```

---

## 10. Tests Phase B

### Tests unitaires (déjà faits Phase A)

- ✅ `app/src/cms/__tests__/notificationsMigration.test.ts`

### À ajouter Phase B

```typescript
// app/src/__tests__/webpush.integration.test.ts
describe('Web Push Integration', () => {
  it('should store subscription in KV', async () => {
    // Mock KV
    // POST /api/cms/notifications { action: 'subscribe', ... }
    // Assert : KV contains subscription
  });

  it('should send push to all subscriptions', async () => {
    // Mock Cron trigger
    // Assert : sendPushMessage called for each subscription
    // Assert : 410 Gone removes subscription
  });

  it('should deduplicate sends', async () => {
    // Send same schedule twice
    // Assert : only one notification per user
  });
});
```

### À ajouter Worker tests

```typescript
// worker/src/__tests__/notifications-sender.test.ts
describe('Notification Sender', () => {
  it('should send with VAPID signature', async () => {
    // Mock pushforge.sendPushMessage
    // Assert : VAPID headers present
  });
});
```

### Smoke test (production)

```bash
# Après déploiement Phase B
npm run test:smoke -- --notifications
# Verify :
# - Subscribe OK
# - KV persists
# - Cron fires (manual trigger)
# - Push event received
```

---

## 11. Dépannage Common

### Subscribe retourne 503

→ KV namespace pas configuré  
→ Vérifier Cloudflare Dashboard → Pages → Functions → KV Bindings

### Cron job ne s'exécute pas

→ Vérifier `worker/wrangler.toml` [[triggers.crons]]  
→ Logs : `wrangler tail --env production`

### Push notification ne s'affiche pas

→ Service Worker pas installé : vérifier `navigator.serviceWorker.ready`  
→ VAPID key invalide : vérifier env vars  
→ Notification permission non accordée : user a refusé

### Erreur 410 Gone (endpoint dead)

→ Normal : user a désinstallé app ou révoqué permission  
→ Supprimer subscription de KV (automatique Phase B)  
→ Retry : pas besoin

---

## 12. Checklist Pré-Production Phase B

- [ ] KV namespaces créées dans Cloudflare
- [ ] VAPID keys générées (localement, pas dans repo)
- [ ] Secrets Cloudflare configurés (VAPID_PRIVATE_KEY, etc)
- [ ] `worker/wrangler.toml` : KV bindings + Cron trigger
- [ ] `pushforge` ajouté à `worker/package.json`
- [ ] API `/api/cms/notifications` implémente subscribe → KV
- [ ] Service Worker `push` event handler implémenté
- [ ] Tests passent : `npm run test -- --run`
- [ ] `npm run build` : aucune erreur
- [ ] Déploiement test : `wrangler deploy --env preview`
- [ ] Smoke test : subscribe → KV → Cron → Push OK

---

## Fin Phase A

**Livrables** :

- ✅ API stateless avec contrats explicites (503 pending Phase B)
- ✅ Migration des notifications : idempotente, pas de Date.now() fallback
- ✅ Types TypeScript Web Push complets (PushDeviceSubscription, etc)
- ✅ Tests de migration (non-régression)
- ✅ Recommandations Phase B (ce document)

**Prochaines étapes** : Attendre validation utilisateur avant Phase B.
