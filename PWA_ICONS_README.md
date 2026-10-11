# PWA Icônes — Instructions de génération

## État actuel

- ✅ `icon.svg` — Icône vectorielle source présente
- ✅ Références dans `manifest.webmanifest` — Configurées
- ⏳ `icon-192.png` — À générer (192×192)
- ⏳ `icon-512.png` — À générer (512×512)
- ⏳ `apple-touch-icon-180.png` — À générer (180×180 pour iOS)

## Options de génération

### Option 1 : Online Tool (Recommandé pour dev)
Utiliser https://www.favicon-generator.org/ ou https://www.pwabuilder.com :
1. Uploader `app/public/icons/icon.svg`
2. Générer les PNG 192×192, 512×512, 180×180
3. Télécharger et placer dans `app/public/icons/`

### Option 2 : ImageMagick (Local)
```bash
cd app/public/icons
convert -background "#C41E3A" -gravity center -extent 192x192 icon.svg icon-192.png
convert -background "#C41E3A" -gravity center -extent 512x512 icon.svg icon-512.png
convert -background "#FFFFFF" -gravity center -extent 180x180 icon.svg apple-touch-icon-180.png
```

### Option 3 : Squoosh CLI (Google)
```bash
npx @squoosh/cli --webp {quality:75} app/public/icons/icon.svg
# Puis convertir le résultat en PNG
```

### Option 4 : Script Node.js
```bash
node scripts/generate-icons.js
```
(Nécessite : `npm install --save-dev sharp`)

## Format des icônes

### Spécifications
- **icon-192.png** : 192×192 pixels, PNG, RGB/RGBA
  - Utilisé pour : Ecran d'accueil Android, manifest
  - Couleur : #C41E3A (burgundy) avec symbole blanc ⚔
  
- **icon-512.png** : 512×512 pixels, PNG, RGB/RGBA
  - Utilisé pour : Splash screen Android, stores
  - Couleur : #C41E3A (burgundy) avec symbole blanc ⚔

- **apple-touch-icon-180.png** : 180×180 pixels, PNG, RGB
  - Utilisé pour : Écran d'accueil iOS uniquement
  - Couleur : #FFFFFF (blanc) avec symbole burgundy ⚔
  - Conseil : Ajouter une bordure arrondie (le navigateur iOS l'arrondit automatiquement)

### Recommandations
- Sans canal alpha (format PNG simple RGB, pas RGBA)
- Qualité : 192×192 et 512×512 doivent être nets
- Couleurs : Matching du branding (#C41E3A pour le fond)
- Safe zone : 30 pixels de marge pour Android adaptive icons

## Référence dans le code

### manifest.webmanifest
```json
{
  "icons": [
    {
      "src": "/icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ]
}
```

### index.html
```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" sizes="180x180" />
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
<link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
```

## Validation

Utiliser Lighthouse dans Chrome DevTools pour valider les icônes :
1. Ouvrir DevTools (F12)
2. Lighthouse → PWA
3. Vérifier que les icônes sont présentes et correctes

Ou utiliser : https://www.pwabuilder.com/

## Déploiement

Une fois les PNG générés et placés :
1. Les fichiers sont auto-déployés avec Cloudflare Pages
2. Service Worker cachera les icônes (Cache First, 30 jours)
3. Aucune configuration supplémentaire nécessaire

## Notes

- Le SVG (icon.svg) reste comme fallback en cas d'indisponibilité des PNG
- iOS préfère PNG au SVG pour apple-touch-icon
- Android 8+ préfère les icônes adaptatives (maskable)
- Les navigateurs modernes supportent SVG comme icônes PWA
