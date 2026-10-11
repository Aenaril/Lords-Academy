# LORDS MOBILE ACADEMY — Architecture Technique

## Stack Retenu

### Frontend
- **React 18** + TypeScript (composants type-safe)
- **Vite** (build rapide, HMR efficace)
- **CSS vanilla ou Emotion** (simplicité, pas de dépendances lourdes)
- **Lucide Icons ou SVG** (icônes légères)
- **LocalStorage** (progression locale)

### Données & Contenu
- **JSON structuré** (contenus des tutoriels)
- **Dépôt GitHub** (versionning, historique, collaboration)
- **Images statiques** (PNG, SVG, JPEG extraites des PPTX)
- **Aucune base de données** (pas de coûts, pas de synchronisation)

### Hébergement
- **Frontend** : GitHub Pages (gratuit, intégré)
- **Administration** : Cloudflare Workers (sécurité, serveur léger gratuit)
- **API Modifications** : GitHub API (via Workers sécurisés)

## Dépôt GitHub — Structure

```
Lords-Mobile-Academy/
├─ public/
│  ├─ images/
│  │  ├─ tutorials/          # Couvertures des tutoriels
│  │  ├─ illustrations/      # Schémas, diagrammes
│  │  ├─ icons/              # Icônes de rôles, badges
│  │  └─ backgrounds/        # Textures légères
│  └─ favicon
│
├─ src/
│  ├─ components/
│  │  ├─ layout/
│  │  │  ├─ Header.tsx
│  │  │  ├─ Navigation.tsx
│  │  │  └─ Footer.tsx
│  │  ├─ tutorialsection/
│  │  │  ├─ TutorialCard.tsx
│  │  │  ├─ TutorialGrid.tsx
│  │  │  └─ TutorialHeader.tsx
│  │  ├─ content-blocks/
│  │  │  ├─ TextBlock.tsx
│  │  │  ├─ ImageBlock.tsx
│  │  │  ├─ TextImageBlock.tsx
│  │  │  ├─ QuizBlock.tsx
│  │  │  ├─ ComparationBlock.tsx
│  │  │  ├─ InteractiveMapBlock.tsx
│  │  │  ├─ ChecklistBlock.tsx
│  │  │  └─ MemoCardBlock.tsx
│  │  ├─ admin/
│  │  │  ├─ AdminButton.tsx
│  │  │  ├─ AdminPanel.tsx
│  │  │  ├─ LoginForm.tsx
│  │  │  ├─ ContentEditor.tsx
│  │  │  ├─ BlockEditor.tsx
│  │  │  └─ PublishDialog.tsx
│  │  └─ shared/
│  │     ├─ ProgressBar.tsx
│  │     ├─ Button.tsx
│  │     ├─ Modal.tsx
│  │     └─ Loader.tsx
│  │
│  ├─ pages/
│  │  ├─ HomePage.tsx
│  │  ├─ TutorialPage.tsx
│  │  └─ NotFoundPage.tsx
│  │
│  ├─ data/
│  │  ├─ tutorials/
│  │  │  ├─ attaque-defense.json
│  │  │  ├─ bataillons.json
│  │  │  ├─ dragon-arena.json
│  │  │  ├─ epreuve-guilde.json
│  │  │  ├─ familiers-mono.json
│  │  │  ├─ phalanges-rangees.json
│  │  │  ├─ regles-generales.json
│  │  │  └─ techniques-avancees.json
│  │  ├─ i18n/
│  │  │  ├─ fr.json         # Textes français (interface)
│  │  │  ├─ en.json         # Textes anglais (futur)
│  │  │  └─ index.ts        # Utilitaires i18n
│  │  ├─ types.ts           # Types TypeScript partagés
│  │  └─ constants.ts       # Constantes (catégories, etc.)
│  │
│  ├─ services/
│  │  ├─ api.ts             # Appels Cloudflare Workers
│  │  ├─ storage.ts         # LocalStorage (progression)
│  │  ├─ auth.ts            # Gestion tokens admin
│  │  └─ github.ts          # Interactions GitHub (via API)
│  │
│  ├─ utils/
│  │  ├─ formatting.ts      # Formatage texte, dates
│  │  ├─ validation.ts      # Validation données
│  │  ├─ animations.ts      # Utilitaires animations
│  │  └─ accessibility.ts   # A11y helpers
│  │
│  ├─ styles/
│  │  ├─ global.css
│  │  ├─ variables.css      # Couleurs, espacements
│  │  ├─ animations.css     # Animations @keyframes
│  │  ├─ responsive.css     # Media queries
│  │  └─ accessibility.css  # Préférences utilisateur
│  │
│  ├─ hooks/
│  │  ├─ useLocalStorage.ts
│  │  ├─ useAdminAuth.ts
│  │  ├─ useContentEditor.ts
│  │  └─ useMobileMenu.ts
│  │
│  ├─ App.tsx
│  └─ main.tsx
│
├─ workers/
│  ├─ index.ts              # Point d'entrée Cloudflare Workers
│  ├─ auth.ts               # Vérification mot de passe
│  ├─ github.ts             # API GitHub sécurisée
│  ├─ validation.ts         # Validation serveur
│  └─ types.ts              # Types Workers
│
├─ .kiro/
│  └─ steering/             # Documentation Kiro
│
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ wrangler.toml            # Configuration Cloudflare Workers
├─ .github/
│  └─ workflows/
│     └─ deploy.yml         # CI/CD GitHub Actions
└─ README.md
```

## Modèle de Données

### Tutoriel (JSON)

```typescript
interface Tutorial {
  id: string;                           // Identifiant unique
  title: string;                        // Titre du tutoriel
  description: string;                  // Description courte
  category: 'Combats' | 'Formations' | 'Events' | 'Stratégie';
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  estimatedDuration: string;            // "8-10" minutes
  coverImage: string;                   // Chemin vers image de couverture
  status: 'draft' | 'published' | 'coming-soon';
  order: number;                        // Ordre d'affichage
  sections: Section[];                  // Sections du tutoriel
  relatedTutorials: string[];           // IDs des tutoriels liés
  tags: string[];                       // Tags pour recherche
  lastModified: string;                 // ISO date
  lastModifiedBy?: string;              // Nom R4
}

interface Section {
  id: string;
  title: string;
  blocks: ContentBlock[];
}

type ContentBlock = 
  | TextBlock
  | ImageBlock
  | TextImageBlock
  | QuizBlock
  | ComparisonBlock
  | InteractiveMapBlock
  | ChecklistBlock
  | MemoCardBlock;

interface TextBlock {
  type: 'text';
  content: string;
}

interface ImageBlock {
  type: 'image';
  imagePath: string;
  caption: string;
  alt: string;
}

interface TextImageBlock {
  type: 'text-image';
  text: string;
  imagePath: string;
  imagePosition: 'left' | 'right';
  caption: string;
}

interface QuizBlock {
  type: 'quiz';
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface ComparisonBlock {
  type: 'comparison';
  title: string;
  items: {
    name: string;
    description: string;
    image?: string;
    pros: string[];
    cons: string[];
  }[];
}

interface InteractiveMapBlock {
  type: 'interactive-map';
  imagePath: string;
  hotspots: {
    x: number;
    y: number;
    label: string;
    description: string;
  }[];
}

interface ChecklistBlock {
  type: 'checklist';
  title: string;
  items: {
    label: string;
    description?: string;
  }[];
}

interface MemoCardBlock {
  type: 'memo-card';
  title: string;
  content: string;
  icon?: string;
}
```

### Progression utilisateur (LocalStorage)

```typescript
interface UserProgress {
  tutorialsViewed: {
    [tutorialId: string]: {
      viewedAt: string;           // ISO date
      progress: number;            // 0-100%
      completed: boolean;
      quizResults: {
        [blockId: string]: boolean; // Réponse correcte ?
      };
    }
  };
  preferences: {
    reduceMotion: boolean;
    language: 'fr' | 'en';
  };
}
```

## Flux de Publication

```
1. ÉCRITURE (R4)
   ├─ Modification contenu via interface Admin
   ├─ Affichage en brouillon
   └─ Preview disponible

2. VALIDATION
   ├─ R4 clique "Publier"
   ├─ Confirmation dialog
   └─ Snapshot de l'état avant

3. ENREGISTREMENT
   ├─ Appel API Workers avec JWT
   ├─ Workers valide token
   ├─ Workers push modification via GitHub API
   │  ├─ Commit créé (message descriptif)
   │  └─ Branche publique mise à jour
   └─ Réponse retournée au frontend

4. DÉPLOIEMENT
   ├─ GitHub Actions triggered (push detected)
   ├─ Build Vite lancé
   ├─ Fichiers générés (HTML, JS, CSS)
   └─ Déployés sur GitHub Pages (auto)

5. PROPAGATION
   ├─ Utilisateurs rechargent page
   ├─ Nouveaux contenus visibles
   └─ Progression locale préservée
```

## Sécurité

### Secrets (jamais en code)

- Mot de passe R4 (hash stocké dans Cloudflare KV ou env)
- Token GitHub API (Cloudflare env)
- Clés de signature JWT (Cloudflare env)

### Endpoints Cloudflare Workers

```
POST /api/auth
  ├─ Entrée : { password }
  ├─ Validation serveur
  ├─ Retour : JWT (1h expiration) ou erreur
  └─ Rate limit : 5 tentatives/15min par IP

POST /api/content/update
  ├─ Entrée : { jwt, tutorialId, updates }
  ├─ Valide JWT et permissions
  ├─ Enregistre en GitHub
  ├─ Déclenche rebuild
  └─ Retour : confirmation

GET /api/content/status
  ├─ Retour : statut du dernier déploiement
  └─ Permet polling du frontend
```

## Déploiement

### GitHub Pages (Frontend)

- Branche `gh-pages` ou dossier `/docs`
- Rebuild automatique via Actions on push
- Domaine : `username.github.io/Lords-Mobile-Academy` ou custom

### Cloudflare Workers (Admin API)

- Configuration `wrangler.toml`
- Variables d'environnement pour secrets
- Déploiement : `wrangler publish`

## Performance

- ✓ Pages statiques (HTML/CSS/JS générés)
- ✓ Lazy loading images (intersection observer)
- ✓ Code splitting automatique (Vite)
- ✓ Caching GitHub Pages (headers)
- ✓ LocalStorage pour progression (0 requête réseau)
- ✓ Animations GPU-friendly (transform, opacity)

## Accessibilité

- ✓ Semantic HTML
- ✓ ARIA labels
- ✓ Préférences `prefers-reduced-motion`
- ✓ Contraste WCAG AA
- ✓ Navigation clavier
- ✓ Textes alternatifs images

