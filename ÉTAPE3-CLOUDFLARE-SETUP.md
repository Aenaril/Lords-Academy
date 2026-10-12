# Étape 3 — Configuration Cloudflare pour Web Push

## Résumé

Cette étape implémente les notifications push web pour Étape 3. Les notifications sont envoyées via **Web Push API** avec des clés **VAPID** hébergées sur **Cloudflare**.

## Architecture

```
Client (PWA)
  ↓ [subscribe + VAPID public key]
Service Worker ← Enregistrement push
  ↓
Notification API (local) → Teste
  ↓
Server (Cloudflare Worker) ← Programmations 3 rappels
  ↓
Push Service (système) → Envoie notification
  ↓
Client Browser → Reçoit & affiche notification
```

## Prérequis

1. **Clés VAPID** — À générer
2. **Service Worker** — Déjà en place (Workbox)
3. **KV Namespace** — Pour stocker subscriptions
4. **Cloudflare Workers** — Pour cron jobs (3 rappels)

## 1. Générer les clés VAPID

### Sur votre machine locale

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Résultat :
```
Public Key: BCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Sauvegarder les clés

**⚠️ SECRETS — Ne jamais commiter!**

- `VITE_VAPID_PUBLIC_KEY` → `app/.env.local` (client)
- `VAPID_PRIVATE_KEY` → Cloudflare Secrets (serveur)

### Mettre à jour les fichiers

#### `app/.env.local`
```env
VITE_VAPID_PUBLIC_KEY=BCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### `app/wrangler.toml`
```toml
[env.production]
vars = { VAPID_PUBLIC_KEY = "BCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }

[env.production.secrets]
# Ajouter VAPID_PRIVATE_KEY dans Cloudflare Dashboard
```

## 2. Configuration Cloudflare Workers (cron jobs)

### Créer un Worker pour les rappels (3x par événement)

Fichier : `worker/src/notifications-cron.ts` (futur)

```typescript
// Pseudo-code
export default {
  async fetch(request: Request, env: Env) {
    // Routing des notifications
  },

  async scheduled(event: ScheduledEvent, env: Env) {
    // Tous les 5 minutes, vérifier les rappels à envoyer
    const now = Date.now()
    const pending = await env.NOTIFICATIONS_KV.get('pending')
    
    // Filtrer les rappels dont l'heure est dépassée
    // Envoyer les notifications push
  }
}
```

### Déployer le Worker

```bash
cd worker
npm install
npx wrangler deploy
```

### Configuration wrangler.toml

```toml
name = "lords-mobile-notifications"

[env.production.triggers.crons]
crons = ["*/5 * * * *"]  # Tous les 5 minutes
```

## 3. Configuration KV Namespaces

### Créer les namespaces

Depuis Cloudflare Dashboard :
1. KV → Créer namespace
2. Noms :
   - `NOTIFICATIONS_SUBSCRIPTIONS` — Stocke les souscriptions push
   - `NOTIFICATIONS_PENDING` — Programmations en attente

### Lier au Worker

```toml
# worker/wrangler.toml
[[kv_namespaces]]
binding = "NOTIFICATIONS_SUBSCRIPTIONS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"

[[kv_namespaces]]
binding = "NOTIFICATIONS_PENDING"
id = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
preview_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

## 4. Endpoints API

### Client Subscribe

**POST /api/cms/notifications**

```json
{
  "action": "subscribe",
  "subscription": {
    "endpoint": "https://...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

Serveur:
- Sauvegarde dans `NOTIFICATIONS_SUBSCRIPTIONS` KV
- Retour 200 OK

### Client Unsubscribe

**POST /api/cms/notifications**

```json
{
  "action": "unsubscribe",
  "subscription": { ... }
}
```

Serveur:
- Supprime de KV
- Retour 200 OK

### Test Notification (Admin)

**POST /api/cms/notifications**

```json
{
  "action": "test",
  "schedule": {
    "title": "Titre test",
    "message": "Message test",
    "imageUrl": "..."
  }
}
```

Serveur:
- Envoie via Web Push API
- Retour 200 OK

## 5. Programmation 3 Rappels

### Modèle de stockage

```
// Dans KV NOTIFICATIONS_PENDING
event:{eventId} → {
  eventId: "dragon-arena-101",
  eventName: "Arena Dragon",
  startTime: 1729123456789,
  schedules: [
    {
      id: "sched-1",
      timing: "relative",
      relativeDelay: "-24h",
      sentAt: null,
      status: "pending"
    },
    { ... "-3h" ... },
    { ... "-30m" ... }
  ]
}
```

### Cron Job (Worker)

Toutes les 5 minutes :

1. Énumérer `NOTIFICATIONS_PENDING`
2. Pour chaque programmation :
   - Calculer heure d'envoi = `eventStartTime + relativeDelay`
   - Si `now >= sendTime` et `status === "pending"` :
     - Charger les subscriptions depuis `NOTIFICATIONS_SUBSCRIPTIONS`
     - Envoyer via Web Push API
     - Marquer `status = "sent"`
     - Sauvegarder dans `NOTIFICATIONS_LOGS`

### Web Push API

```typescript
import * as webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:contact@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const notification = {
  title: 'Rappel: Dragon Arena',
  body: 'Le tournoi commence dans 24 heures',
  icon: '/icons/icon-192x192.png',
  badge: '/icons/icon-96x96.png',
  tag: `event-${eventId}`,
  requireInteraction: false
}

await webpush.sendNotification(subscription, JSON.stringify(notification))
```

## 6. Intégration dans l'Admin CMS

### Module Notifications (déjà créé)

✅ Créer/éditer programmations (3 rappels)
✅ Test notification (client-side via Notification API)
⏳ Stocker schedules en localStorage
⏳ Envoyer au serveur pour activation (Worker cron)

### Actions Admin

1. Créer événement (Annonces module)
2. Accès Notifications → "Ajouter programmation"
3. Système génère 3 rappels auto (-24h, -3h, -30m)
4. Admin peut éditer/désactiver
5. "Sauvegarder" → Envoie vers Worker KV

## 7. Procédure Déploiement

### Phase 1 — Préparation

```bash
# Générer VAPID keys
web-push generate-vapid-keys

# Ajouter à env
echo "VITE_VAPID_PUBLIC_KEY=BC..." >> app/.env.local
```

### Phase 2 — Cloudflare Configuration

1. Cloudflare Dashboard
2. KV → Créer 2 namespaces
3. Workers → Créer notifications-cron (quand prêt)
4. Workers Settings → Ajouter VAPID_PRIVATE_KEY secret

### Phase 3 — Code

```bash
# Build local
cd app
npm run build

# Déployer Pages
npm run deploy:pages

# Déployer Worker (futur)
cd ../worker
npm run deploy:notifications
```

### Phase 4 — Tests

✅ Admin CMS → Notifications → Tester
✅ Client: Activation prompt → Notification reçue
✅ Cron: Vérifier logs Worker
✅ 3 rappels: Valider timing et envoi

## Costs & Limits

### KV Namespace

- **Lectures**: 10M/jour gratuit
- **Écritures**: 1M/jour gratuit
- **Stockage**: 1 GB gratuit
- Subscriptions ~200 bytes chacune → max ~5000 free

### Workers

- **Invocations**: 100K/jour gratuit
- **Cron triggers**: 10K/mois gratuit
- **Tous les 5 min** = 288 exécutions/jour → OK

### Web Push

- **Limite**: Cloudflare (aucun limit côté leur infra)
- **Dépend du service push** (FCM, etc.) → Généralement gratuit

## Fichiers Concernés

```
✅ app/src/utils/notifications.ts — Client API
✅ app/src/components/NotificationSubscribePrompt.tsx — UI Subscribe
✅ app/src/cms/NotificationsModule.tsx — Admin CMS
✅ app/functions/api/cms/[[route]].ts — Endpoints API
✅ app/.env.local — VITE_VAPID_PUBLIC_KEY
❌ worker/src/notifications-cron.ts — À créer
❌ app/wrangler.toml — À mettre à jour
❌ Cloudflare Dashboard — Secrets & KV
```

## Prochaines Étapes

1. ✅ Générer VAPID keys
2. ✅ Ajouter VITE_VAPID_PUBLIC_KEY à env
3. ⏳ Créer Worker cron (notifications-cron.ts)
4. ⏳ Mettre à jour wrangler.toml
5. ⏳ Tester notification subscribe flow
6. ⏳ Tester 3 rappels programmés
7. ⏳ Valider logs & statistiques

## Dépannage

### Les notifications ne s'affichent pas

- ✅ Vérifier Notification.permission === 'granted'
- ✅ Vérifier VAPID_PUBLIC_KEY dans env
- ✅ Vérifier Service Worker actif (DevTools → Application)
- ✅ Vérifier browser support (Chrome 50+, Firefox 48+, Safari 16+)

### Erreur "Invalid VAPID keys"

- ✅ Régénérer keys
- ✅ Vérifier base64 format
- ✅ Vérifier secrets stockés dans Cloudflare (pas dans code)

### Cron job ne s'exécute pas

- ✅ Vérifier Worker déployé
- ✅ Vérifier cron expression valide
- ✅ Vérifier KV namespace liée
- ✅ Vérifier logs Worker (Cloudflare Dashboard)

