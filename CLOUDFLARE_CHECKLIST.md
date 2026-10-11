# Cloudflare Pages — Checklist de configuration

## ✅ Configuration locale vérifiée

### Fichiers
- ✅ `wrangler.toml` — Présent à la racine, pas de secrets
- ✅ `app/functions/api/[[path]].ts` — Pages Function prête
- ✅ `app/.env.example` — Template environnement
- ✅ `.gitignore` — `wrangler.toml` racine NOT excluded, `worker/wrangler.toml` excluded ✓

### Dépendances
- ✅ vite-plugin-pwa — Installée
- ✅ workbox-window — Installée
- ✅ Node v24.21.0 — Compatible (v20+ requis)
- ✅ npm 11.19.0 — Compatible

### Build
- ✅ npm run build — Succès
- ✅ app/dist/ — Généré
- ✅ Manifest — Valide

### Code source
- ✅ Pas de secrets dans wrangler.toml
- ✅ Pas de .env avec valeurs réelles
- ✅ API keys masquées (à ajouter via Dashboard)

---

## 🔧 Configuration Cloudflare à faire

### Étape 1 : Créer le projet Pages
```
Dashboard → Pages → Create project
Source: GitHub → Connect
Repository: Aenaril/Lords-Academy
```

### Étape 2 : Build configuration
```
Build settings:
  Framework: None
  Build command: cd app && npm run build
  Build output directory: app/dist
  Root directory: .
  Compatibility flags: nodejs_compat (si nécessaire)
```

### Étape 3 : Créer les KV Namespaces
```
KV → Create namespace

Namespace 1:
  Name: "DRAFTS" (production)
  Name: "DRAFTS-preview" (preview)

Namespace 2:
  Name: "RATE" (production)
  Name: "RATE-preview" (preview)
```

### Étape 4 : Configurer les secrets
```
Pages project → Settings → Environment variables

Add 3 secrets:
  1. ADMIN_PASSWORD = "..." (votre mot de passe R4)
  2. SESSION_SIGNING_KEY = "..." (32+ caractères aléatoires)
  3. GITHUB_TOKEN = "..." (fine-grained token)
```

### Étape 5 : Lier les KV Namespaces
```
Pages project → Settings → Functions

Add KV namespace binding:
  Variable name: DRAFTS
  Namespace: <select DRAFTS>
  
Add KV namespace binding:
  Variable name: RATE
  Namespace: <select RATE>
```

### Étape 6 : Déploiement
```
Le projet se redéploiera automatiquement à chaque push sur main
```

---

## 📝 Valeurs requises

### ADMIN_PASSWORD
- Mot de passe partagé pour authentification R4
- Recommandation : 12+ caractères, alphanumérique + symboles
- Exemple : `MySecureR4Pass#2024!`

### SESSION_SIGNING_KEY
- Clé HMAC pour signer les sessions
- Recommandation : 32+ caractères aléatoires
- Générer : `openssl rand -base64 32` ou similaire
- Exemple : `aBcDeF1234567890xYzAbCdEf1234567890`

### GITHUB_TOKEN
- Token GitHub fine-grained
- Scope : Repository access (Lords-Academy seulement)
- Permissions : Contents (read & write)
- Générer : https://github.com/settings/tokens

---

## 🐛 Troubleshooting

### "Functions not found"
- Vérifier : `app/functions/api/[[path]].ts` existe
- Vérifier : wrangler.toml contient `functions = { directory = "app/functions" }`

### "Build failed"
- Vérifier : `npm run build` réussit en local
- Vérifier : Node version compatible (v20+)
- Vérifier : Build output directory = `app/dist`

### "KV not found"
- Vérifier : 2 KV namespaces créés
- Vérifier : Bindings ajoutés aux Functions
- Vérifier : IDs corrects dans les settings

### "API returns 401"
- Vérifier : ADMIN_PASSWORD défini
- Vérifier : SESSION_SIGNING_KEY défini
- Vérifier : GITHUB_TOKEN défini et valide

---

## ✅ Avant de déployer

- [ ] wrangler.toml commité (pas de .gitignore)
- [ ] app/functions/* commité
- [ ] Pas de secrets dans Git
- [ ] npm run build réussit
- [ ] Node v20+ installé localement

---

## 📋 Références

- Cloudflare Pages : https://developers.cloudflare.com/pages/
- Pages Functions : https://developers.cloudflare.com/pages/functions/
- KV Namespaces : https://developers.cloudflare.com/workers/runtime-apis/kv/
- CI/CD avec GitHub : https://developers.cloudflare.com/pages/get-started/

---

**Configuration Cloudflare prêt à être appliquée après le push GitHub.**
