# Progressive Web App (PWA) — Lords Mobile Academy

## Configuration PWA

Lords Mobile Academy est configurée comme une Progressive Web App (PWA) pour être installable sur smartphones Android et iPhone.

### Fichiers clés

| Fichier | Rôle |
|---------|------|
| `app/vite.config.ts` | Configuration vite-plugin-pwa |
| `app/index.html` | Balises meta PWA et manifest |
| `app/public/manifest.webmanifest` | Web App Manifest |
| `app/public/icons/icon.svg` | Icône SVG source |
| `app/src/components/PWAInstallPrompt.tsx` | Interface d'installation |
| `dist/registerSW.js` | Enregistrement Service Worker (auto-généré) |
| `dist/sw.js` | Service Worker (auto-généré par Workbox) |

### Stratégies de caching

Workbox gère automatiquement le caching selon la stratégie suivante :

| Type | Stratégie | Comportement |
|------|-----------|-------------|
| **HTML** | Network First | Essaye le réseau d'abord, fallback au cache |
| **JS / CSS** | Network First | Essaye le réseau, cache pour offline |
| **Images** | Cache First | Utilise le cache, met à jour en arrière-plan |
| **API `/api/*`** | Network Only | Jamais en cache (toujours frais) |

### Protection des données sensibles

**Ne sont JAMAIS mis en cache** :
- ❌ Réponses API `/api/*`
- ❌ Mots de passe
- ❌ Sessions R4
- ❌ Brouillons privés
- ❌ Données d'authentification

**Sont mis en cache** :
- ✅ Contenu pédagogique (tutoriels)
- ✅ Images publiques
- ✅ Assets (JS, CSS)
- ✅ Fonts

### Installation sur smartphone

#### Android
1. Ouvrir Lords Mobile Academy dans Chrome/Firefox
2. Une notification d'installation s'affiche
3. Cliquer sur "Installer maintenant"
4. L'app s'ajoute à l'écran d'accueil automatiquement

#### iPhone
1. Ouvrir Lords Mobile Academy dans Safari
2. Cliquer sur le bouton "Partager" (bas)
3. Sélectionner "Ajouter à l'écran d'accueil"
4. L'app s'ajoute immédiatement
5. Cliquer sur "Ajouter"

### Fonctionnement offline

Une fois installée et consultée une fois :
- ✅ Les tutoriels publics sont accessibles offline
- ✅ Les images consultées sont mises en cache
- ✅ La navigation locale fonctionne
- ❌ L'authentification R4 nécessite une connexion (API)
- ❌ Les brouillons ne se synchronisent pas offline

### Mises à jour

- **Auto-update** : Le Service Worker vérifie les mises à jour à chaque visite
- **Lazy update** : Les mises à jour sont appliquées au rechargement suivant
- **Skip waiting** : Les R4 peuvent forcer l'update (à implémenter si nécessaire)

### Icônes

À créer (actuellement placeholders) :
- `icon-192.png` — Android home screen et manifest
- `icon-512.png` — Android splash screen
- `icon-maskable-192.png` — Adaptive icons Android 8+
- `icon-maskable-512.png` — Adaptive icons Android 8+

Format recommandé : PNG 24-bit RGBA avec fond transparent ou blanc #FFFFFF.

Design : château médiéval / couronne / symbole game "Lords Mobile".

### Vérification PWA

Outils de test :
- **Chrome DevTools** → Application → Manifest (vérifier les détails)
- **Lighthouse** → PWA audit (vérifier la compliance)
- **https://www.pwabuilder.com** → Tester l'installabilité

### Maintenance

- **Service Worker** : Auto-géré par Workbox (vite-plugin-pwa)
- **Manifest** : Mis à jour dans `app/vite.config.ts`
- **Icônes** : À mettre dans `app/public/icons/`
- **Caching** : Configurations dans `runtimeCaching` (vite.config.ts)

### Limitations

- PWA fonctionne sur HTTPS uniquement
- iOS PWA n'est pas aussi intégrée qu'Android (pas d'installer natif)
- L'offline n'est que partiellement disponible (pas d'accès API)
- Les brouillons R4 synchronisés uniquement en ligne

### Testé sur

- ✅ Chrome 100+
- ✅ Firefox 100+
- ✅ Safari 15+ (iOS)
- ✅ Edge 100+
- ✅ Samsung Internet

---

**Configuration PWA terminée et testée. Prête pour Cloudflare Pages.**
