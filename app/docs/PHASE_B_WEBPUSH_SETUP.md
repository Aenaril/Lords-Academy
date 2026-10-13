# Phase B : Configuration Web Push — Étapes Préalables

## 📋 Checklist de Configuration Cloudflare

Cette phase implémente l'**abonnement et le désabonnement** des notifications push. La configuration Cloudflare est **nécessaire** pour que le système fonctionne en production.

### Aucune clé VAPID n'a été créée ni commité

Le système est prêt pour l'intégration KV, mais sans clés VAPID générées.

---

## 1. Générer les clés VAPID

### Générer localement (une seule fois)

**Sur votre machine, jamais en CI** :

```bash
# Utiliser web-push CLI
npx web-push generate-vapid-keys

# Résultat :
# Public Key: BMjPjWZR1j2K3lM4nOpQrStUvWxYzAbCdEfGhIjKlMnOp...
# Private Key: vHr8iL3dK9mNoPqRsTuVwXyZaBcDeFgHiJkLmNoPq...
```

### Stocker les clés VAPID

**Jamais dans le code ou Git.**

Les clés générées doivent être conservées dans un endroit sûr (ex: fichier chiffré local).

---

## 2. Créer les KV Namespaces dans Cloudflare

### Étape 1 : Accéder au Dashboard Cloudflare

1. Connectez-vous à https://dash.cloudflare.com
2. Sélectionnez votre compte
3. Accédez à **Workers & Pages**

### Étape 2 : Créer les deux namespaces

1. Cliquez sur **KV** (dans le menu de gauche)
2. Créer un namespace : `notifications-subscriptions-prod`
   - Cliquez sur **Create Namespace**
   - Nom : `notifications-subscriptions-prod`
   - Créez
3. Créer un second namespace : `notifications-schedules-prod`
   - Répétez l'étape précédente
   - Nom : `notifications-schedules-prod`

### Étape 3 : Récupérer les IDs des namespaces

Pour chaque namespace créé, vous verrez un **Namespace ID**. Notez-les :

```
notifications-subscriptions-prod : {ID_SUBS}
notifications-schedules-prod : {ID_SCHED}
```

---

## 3. Configurer les Bindings KV dans Cloudflare Pages

### Étape 1 : Accédez aux Pages Settings

1. Allez à **Pages** → Sélectionnez votre projet `Lords-Academy`
2. Allez à **Settings** → **Functions**

### Étape 2 : Ajouter les Bindings KV

**Pour subscription** :

- **Binding Name** : `NOTIFICATIONS_SUBSCRIPTIONS`
- **KV Namespace** : `notifications-subscriptions-prod` (sélectionner de la liste)
- Cliquez **Save**

**Pour schedules** (Phase C) :

- **Binding Name** : `NOTIFICATIONS_SCHEDULES`
- **KV Namespace** : `notifications-schedules-prod` (sélectionner de la liste)
- Cliquez **Save**

### Étape 3 : Vérifier les bindings

Les bindings doivent maintenant être visibles dans Settings → Functions → KV Namespace Bindings.

---

## 4. Configurer les Secrets Cloudflare

### Étape 1 : Accédez aux Secrets

1. Dans **Pages** → Projet `Lords-Academy`
2. **Settings** → **Functions** → **Environment Variables**
3. Cliquez **Add Variables**

### Étape 2 : Ajouter les secrets (Phase C)

Ces secrets ne sont nécessaires que pour l'envoi push (Phase C). Vous pouvez les ajouter maintenant pour préparer.

**Pour production** :

```
VAPID_PRIVATE_KEY = "{votre_clé_privée_VAPID}"
VAPID_PUBLIC_KEY = "{votre_clé_publique_VAPID}"
VAPID_SUBJECT = "mailto:admin@lordsmobileacademy.local"
```

**Important** :
- La clé **privée** ne doit JAMAIS être exposée
- La clé **publique** peut être exposée (utilisée par navigateurs)
- Déployez les secrets en tant que **production** et **preview** si besoin

---

## 5. Configurer les Variables d'Environnement Frontend

### Fichier `.env.production`

```bash
# Clé VAPID publique (OK d'afficher)
VITE_VAPID_PUBLIC_KEY="BMjPjWZR1j2K3lM4nOpQrStUvWxYzAbCdEfGhIjKlMnOp..."

# API endpoint (à adapter selon votre domaine)
VITE_API_BASE_URL="https://lordsmobileacademy.example.com"
```

### Fichier `app/src/config/vapid.ts` (à créer)

```typescript
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

if (!VAPID_PUBLIC_KEY) {
  console.warn('[WebPush] VAPID public key not configured')
}
```

---

## 6. Vérifier la Configuration (Smoke Test)

### Test manuel d'abonnement

Après déploiement sur Cloudflare Pages :

```bash
# Test 1 : Abonnement valide
curl -X POST https://lordsmobileacademy.example.com/api/web-push/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://fcm.googleapis.com/fcm/send/TEST123",
    "p256dh": "BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=",
    "auth": "M3FAIjwp-XxCDCg_HvfXfg=="
  }'

# Résultat attendu :
# {"ok":true,"subscriptionId":"sub-..."}

# Test 2 : Désabonnement
curl -X POST https://lordsmobileacademy.example.com/api/web-push/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId":"sub-..."}'

# Résultat attendu :
# {"ok":true}
```

### Vérifier le KV

1. Dans Cloudflare Dashboard → KV
2. Cliquez sur `notifications-subscriptions-prod`
3. Vous devriez voir les clés créées par les tests

---

## 7. Actions à accomplir manuellement

✅ **Déjà fait (Phase B)** :
- [ ] API d'abonnement/désabonnement implémentée
- [ ] Interface UI créée
- [ ] Tests développés
- [ ] Service Worker extensible

⏳ **À faire (Cloudflare)** :
- [ ] Créer 2 KV namespaces
- [ ] Ajouter bindings KV aux Pages
- [ ] Générer et ajouter clés VAPID (secrets)
- [ ] Configurer variables d'environnement frontend
- [ ] Vérifier via smoke tests
- [ ] Déployer sur Pages

❌ **Pas encore** :
- [ ] Activation du Cron (Phase C)
- [ ] Envoi réel de notifications
- [ ] Ordonnanceur de rappels

---

## 8. Dépannage

### KV not configured

**Symptôme** : `{"ok":false,"error":"Notifications storage not configured","code":"STORAGE_NOT_CONFIGURED"}`

**Solution** :
1. Vérifier que le binding `NOTIFICATIONS_SUBSCRIPTIONS` existe
2. Vérifier que le namespace KV est créé et accessible
3. Redéployer Pages après modification

### Endpoint rejected

**Symptôme** : `{"ok":false,"error":"Endpoint from unauthorized push service"}`

**Solution** :
- Vérifier que l'endpoint est d'un service autorisé (FCM, Mozilla, Edge, Apple)
- Utiliser un navigateur moderne qui supporte Web Push

### Permission denied

**Symptôme** : Bouton affiche "Permission refusée"

**Solution** :
- C'est normal si utilisateur refuse permission
- Réessayer en se connectant à un autre appareil
- Sur iPhone : impossible avec Safari

---

## 9. Points Clés de Sécurité

✅ **Respecté** :
- Clés privées JAMAIS dans le code
- Validation stricte des endpoints
- Rate limiting sur les API (à implémenter en Phase C si besoin)
- Idempotence des abonnements
- Pas de journalisation des clés crypto

⚠️ **À surveiller** :
- Les secrets Cloudflare doivent être configurés **après** ce commit
- Les clés VAPID doivent rester privées
- Le KV doit être accessible **uniquement** via les Pages Functions

---

## 10. Prochaines Phases

**Phase C** : Implémentation du Cron scheduler
- Lecture des abonnements depuis KV
- Envoi réel via pushforge
- Déduplication des envois
- Retry logic

**Phase D** : Interface admin de programmation
- CMS pour créer des programmations
- Tests d'envoi manuels
- Dashboard de suivi

---

## Fichiers modifiés (Phase B)

```
✅ app/src/services/webPushService.ts
✅ app/functions/api/web-push/subscribe.ts
✅ app/functions/api/web-push/unsubscribe.ts
✅ app/src/components/NotificationPermissionButton.tsx
✅ app/src/hooks/useNotificationPermission.ts
✅ app/public/sw-push-handler.js
✅ app/src/__tests__/webpush-subscribe.test.ts
```

---

## Configuration à Fournir à Cloudflare

Après ce commit, je fournirai :

```
SHA du commit : [à remplir]
Bindings KV requis : NOTIFICATIONS_SUBSCRIPTIONS, NOTIFICATIONS_SCHEDULES
Secrets requis : VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
Variables frontend : VITE_VAPID_PUBLIC_KEY
Route API : /api/web-push/subscribe, /api/web-push/unsubscribe
```

**Arrêt ici : en attente de configuration Cloudflare.**
