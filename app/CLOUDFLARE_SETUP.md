# Lords Mobile Academy — Phase B Cloudflare Setup

**Commit:** `9b80511`

Phase B Web Push est maintenant prête pour Cloudflare. Cette guide explique comment configurer l'infrastructure pour permettre l'abonnement et le désabonnement des joueurs.

---

## 1. Générer les Clés VAPID

Les clés VAPID (Voluntary Application Server Identification) permettent au serveur de s'identifier auprès des services push (FCM, APNs, etc.).

### Option A : Générer localement (Linux/Mac/Windows avec Node)

```bash
cd app
npm install --save-dev web-push
npx web-push generate-vapid-keys
```

Vous verrez :
```
Public Key: BK1XM0nK...
Private Key: ab7xK2mL...
```

### Option B : Générer en ligne

Lien : https://tools.reactiveops.com/webpush

Copier les deux clés (Public et Private).

---

## 2. Créer le Namespace KV dans Cloudflare

Cloudflare KV est le stockage clé-valeur gratuit qui conservera les abonnements push.

### Accès

1. Connectez-vous à https://dash.cloudflare.com
2. Sélectionnez votre domaine (ou créez un compte Pages)
3. Allez à **Workers & Pages** → **KV**

### Créer le Namespace

1. Cliquez sur **Create Namespace**
2. Nom exact : **`NOTIFICATIONS_SUBSCRIPTIONS`**
   - (Cet identifiant doit correspondre exactement au code)
3. Cliquez **Create**

### Vérifier

Vous verrez le namespace dans la liste. Vous pouvez le laisser vide pour le moment.

---

## 3. Créer et Configurer le Worker Cloudflare

Un Worker Cloudflare exécute votre code serverless sur le réseau de Cloudflare.

### Créer le Worker

1. **Workers & Pages** → **Create** → **Create Worker**
2. Nom : `lords-mobile-academy-api`
3. Cliquez **Deploy**

### Lier le KV Namespace

1. **Settings** (onglet du Worker)
2. Scrollez à **KV Namespace Bindings**
3. Cliquez **Add binding**
4. **Variable name** : `NOTIFICATIONS_SUBSCRIPTIONS`
5. **KV Namespace** : Sélectionnez `NOTIFICATIONS_SUBSCRIPTIONS`
6. Cliquez **Save**

### Ajouter les Secrets

Les secrets Cloudflare stockent les clés sensibles sans les exposer en Git.

1. **Settings** → **Environment Variables**
2. Ajouter deux variables :

   | Variable | Valeur |
   |----------|--------|
   | `VAPID_PUBLIC_KEY` | Votre clé publique VAPID |
   | `VAPID_PRIVATE_KEY` | Votre clé privée VAPID |

3. Cliquez **Save**

**Important :** Ne jamais commit ces clés dans Git.

---

## 4. Déployer le Code API

Le code de `app/functions/api/web-push/` doit être accessible depuis Cloudflare.

### Option A : Wrangler (Recommandé)

Si vous avez Wrangler installé localement :

```bash
cd app
wrangler publish  # Déploie le Worker avec la nouvelle config
```

### Option B : Upload manuel

1. Allez à votre Worker
2. **Editor** (onglet)
3. Copiez le contenu de `app/functions/api/web-push/subscribe.ts`
4. Collez dans l'éditeur
5. Cliquez **Save and Deploy**

**Note :** La réalisation complète nécessite les dépendances (Workbox, crypto). Le déploiement recommandé passe par Wrangler.

---

## 5. Configurer le Routing

L'API doit être accessible à `https://<votre-domaine>/api/web-push/subscribe` et `/api/web-push/unsubscribe`.

### Wrangler.toml (après déploiement)

Vérifiez votre `app/wrangler.toml` contient :

```toml
[env.production]
kv_namespaces = [
  { binding = "NOTIFICATIONS_SUBSCRIPTIONS", id = "..." }
]

[[routes]]
pattern = "api/web-push/*"
zone_name = "<votre-domaine.com>"
```

### Routes Page Rules (manuel)

Si vous utilisez Pages (pas Workers) :

1. **Pages** → Sélectionnez votre projet
2. **Settings** → **Functions**
3. Les routes `app/functions/api/web-push/` seront automatiquement créées

---

## 6. Ajouter la Clé Publique VAPID au Frontend

Le frontend a besoin de la clé publique pour initialiser les abonnements.

### Option A : Variable d'environnement

Créez `app/.env.production` :

```bash
VITE_VAPID_PUBLIC_KEY=<votre-clé-publique-VAPID>
```

Rebuild :
```bash
npm run build
```

### Option B : Injection via Cloudflare Pages

1. **Pages** → Votre projet → **Settings** → **Environment variables**
2. Ajouter : `VITE_VAPID_PUBLIC_KEY` = `<clé-publique>`
3. Rebuild / Redeploy

---

## 7. Tester Localement

Avant de déployer sur Cloudflare, testez localement que tout compile.

```bash
cd app
npm run build   # Devrait réussir
npm test        # Tous les tests doivent passer
```

**Résultat attendu :**
```
✓ Build: SUCCESS
✓ Tests: 325/325 PASS
```

---

## 8. Déployer le Frontend

Mettez à jour GitHub et redéployez la PWA.

### Pages GitHub

1. Poussez vos changements vers GitHub :
   ```bash
   git push origin main
   ```

2. **Cloudflare Pages** → Votre projet
   - Attendez le rebuild automatique
   - Vérifiez les logs de déploiement

3. Accédez à votre site en ligne

---

## 9. Tester l'Abonnement

Une fois déployé, testez l'abonnement depuis votre navigateur.

### Desktop Chrome/Edge/Firefox

1. Ouvrez le site
2. Recherchez le bouton **Notifications** (bas-droit)
3. Cliquez pour demander la permission
4. Vérifiez que vous êtes abonné

### iPhone (iOS 16.1+)

1. Ajoutez le site en tant qu'app (à l'écran d'accueil)
2. Ouvrez l'app
3. Le bouton Notifications devrait être actif

### Vérifier KV

1. Cloudflare **KV** → **NOTIFICATIONS_SUBSCRIPTIONS**
2. Vous devriez voir des clés comme :
   - `sub-<uuid>` (abonnement principal)
   - `endpoint:<hash>` (lookup par endpoint)

---

## 10. Dépannage

### "KV not configured"

- Vérifiez que le binding `NOTIFICATIONS_SUBSCRIPTIONS` est créé
- Vérifiez le nom exact (casse sensible)
- Redéployez le Worker

### "Origin not allowed"

- Le frontend appelle depuis un domaine non autorisé
- Mettez à jour la whitelist dans `subscribe.ts` (ajouter votre domaine Pages)
- Redéployez

### "VAPID key invalid"

- Vérifiez que `VITE_VAPID_PUBLIC_KEY` est définie
- Vérifiez le format (base64)
- Regénérez les clés si doute

### Pas d'erreur mais pas d'abonnement

- Vérifiez les logs Cloudflare (Workers Tail)
- Vérifiez la console du navigateur (F12)
- Vérifiez que le navigateur supporte Web Push
- Sur iPhone : doit être PWA installée + iOS 16.1+

---

## 11. Phase B Validation Checklist

Avant de continuer vers Phase C, vérifiez :

- ✅ KV créé et bindé
- ✅ Worker déployé
- ✅ VAPID keys sauvegardées (pas en Git)
- ✅ Frontend peut atteindre `/api/web-push/subscribe`
- ✅ Abonnement fonctionne sur Chrome desktop
- ✅ Clés stockées dans KV (vérifiez avec le dashboard)
- ✅ F5 reload : abonnement persistant
- ✅ Désabonnement fonctionne
- ✅ Aucun secret privé exposé

---

## 12. Coûts

**Phase B (abonnement/désabonnement) :**
- Workers (requêtes) : **Gratuit** (plan gratuit inclus 100k req/jour)
- KV (stockage) : **Gratuit** (1 GB inclus)
- Pages (hosting) : **Gratuit**

**Coût total : 0 €/mois** ✓

---

## 13. Phase C (Futur — Pas Phase B)

Les éléments suivants sont **Phase C** et ne sont pas configurés ici :

- Cron Trigger (envoi planifié de notifications)
- Service d'envoi (pushforge, AWS SNS, etc.)
- Logs d'audit
- Métriques

Phase B se termine une fois l'abonnement/désabonnement validé.

---

## Support

Si vous rencontrez un problème :

1. Vérifiez que `npm run build` passe
2. Vérifiez les logs Cloudflare Workers Tail
3. Ouvrez la console navigateur (F12)
4. Vérifiez que le domaine en `Origin` correspond à la whitelist API

