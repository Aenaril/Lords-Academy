# LORDS MOBILE ACADEMY — Direction UX/UI

## Identité Visuelle

### Univers & Ambiance

**Thème** : Fantasy stratégique, univers Lords Mobile  
**Tonalité** : Immersive, ludique, énergique, accessible

### Couleurs Principales

| Utilité | Couleur | Hex | Usage |
|---------|---------|-----|-------|
| **Primaire** (attaque) | Rouge-orange | #D84D00 | Boutons CTA, highlights attaque |
| **Secondaire** (défense) | Bleu-argent | #3B6FA8 | Éléments défense, info |
| **Accent** (or/prestige) | Or | #D4AF37 | Points clés, récompenses |
| **Neutre** (fond) | Charbon clair | #2B2B2B | Fond site |
| **Texte** (clair) | Blanc cassé | #F5F5F0 | Textes principaux |
| **Texte** (secondaire) | Gris clair | #CCCCCC | Descriptions, metadata |
| **Succès** | Vert | #4CAF50 | Quiz correct, statuts |
| **Erreur** | Rouge | #F44336 | Quiz faux, alertes |

### Typographie

- **Titres** : Sans-serif moderne, bold (ex: Inter, Roboto)
- **Corps** : Sans-serif lisible, régulier (ex: Inter, Roboto)
- **Monospace** : Pour code/ratios (ex: Courier New, JetBrains Mono)

**Tailles** :
- Titre page : 2.5rem
- Section : 1.8rem
- Sous-titre : 1.4rem
- Texte corpo : 1rem
- Petit texte : 0.9rem
- Tiny (metadata) : 0.8rem

---

## Page d'Accueil

### Sections

1. **En-tête héroïque** (500px height)
   - Logo + "Lords Mobile Academy"
   - Tagline courte
   - Arrière-plan : texture castle/fantasy subtile
   - Élément visuel animé (châteu ou épée légère)

2. **Section présentation** (200px)
   - Texte court sur la mission
   - 3 points clés en icônes
   - Bouton "Commencer"

3. **Grille tutoriels** (variable)
   - Cartes 3-4 colonnes (desktop), 1-2 colonnes (tablet), 1 (mobile)
   - Filtrage optionnel : par catégorie, difficulté
   - Barre de recherche (si simple à implémenter)

4. **Section "Mémos"** (consultables indépendamment)
   - Mini-cartes fiches memo
   - Accès rapide

5. **Pied de page**
   - Liens utiles
   - Crédits (sources, images)
   - Liens externes (Wiki, IGG official)

### Carte Tutoriel

```
┌─────────────────────────┐
│   [Image couverture]    │ ← 200px height
├─────────────────────────┤
│ Titre                   │
│ Catégorie • Difficulté  │ ← Petit texte gris
│                         │
│ "Maîtrisez les..." (2 ln)
│                         │
│ ⏱️ 8-10 min             │
│ ⭐⭐⭐⭐ (difficulté)    │
│                         │
│ [Voir →]                │ ← Bouton hover
└─────────────────────────┘
```

**Interactions** :
- Hover : lift légère (box-shadow augmente), image brightens
- Clic : navigate to tutorial
- Sur mobile : active state à la place de hover

---

## Page Tutoriel

### Layout Principal

```
┌──────────────────────────────────┐
│ [← Retour] Titre • Catégorie     │ ← Header sticky (50px)
├──────────────────────────────────┤
│                                  │
│ ┌────────────────────────────┐   │
│ │  INTRODUCTION              │   │
│ │  [Image couverture]        │   │
│ │  Contexte & objectifs      │   │
│ │  Durée: 8-10 min          │   │
│ └────────────────────────────┘   │
│                                  │
│ ┌────────────────────────────┐   │
│ │  SECTION 1 : Titre        │   │ ← Anchor pour lien direct
│ │  [Bloc contenu]            │   │
│ │  [Bloc interactif]         │   │
│ │  [Bloc image]              │   │
│ └────────────────────────────┘   │
│                                  │
│ ┌────────────────────────────┐   │
│ │  SECTION 2 : Titre        │   │
│ │  ...                       │   │
│ └────────────────────────────┘   │
│                                  │
│ ┌────────────────────────────┐   │
│ │  RÉCAPITULATIF             │   │
│ │  Points clés               │   │
│ │  [Fiche mémo]              │   │
│ └────────────────────────────┘   │
│                                  │
│ ┌────────────────────────────┐   │
│ │  TUTORIELS CONNEXES        │   │
│ │  [Mini cartes]             │   │
│ └────────────────────────────┘   │
│                                  │
│ [← Précédent] [Suivant →]        │
│                                  │
└──────────────────────────────────┘
```

### Barre latérale (Desktop)

```
┌─────────────────────┐
│ TABLE DES MATIÈRES  │
│                     │
│ • Introduction      │
│ • Section 1         │
│ • Section 2         │
│ • Récapitulatif     │
│                     │
│ PROGRESSION         │
│ ████░░░░░░ 40%      │
│                     │
│ 📌 FICHES LIÉES     │
│ • Fiche X           │
│ • Fiche Y           │
└─────────────────────┘
```

Sur mobile : devenir menu hamburger déroulant

---

## Composants & Interactions

### Bloc de Contenu

**TextBlock** :
- Largeur max 800px (lisibilité)
- Interligne 1.6
- Marges généreuses (vertical)

**QuizBlock** :
- Options = boutons (pas radio buttons)
- Avant réponse : fond gris clair
- Après réponse correcte : ✓ vert + feedback + texte explication
- Après réponse fausse : ✗ rouge + feedback + bouton "Réessayer"
- Explication = fade-in progressif (animation 300ms)

**ComparisonBlock** :
- Sur desktop : tableau côte à côte (2-4 colonnes)
- Sur mobile : cartes empilées verticalement
- Au hover (desktop) : highlight la colonne

**InteractiveMapBlock** :
- Image responsive comme base
- Hotspots = cercles semi-transparents (5-10mm au toucher)
- Au clic/hover : popup informatif
- Sur mobile : dropdown alternative

### Animations (priorité: légère utilité)

| Déclencheur | Animation | Durée | Courbe |
|-------------|-----------|-------|--------|
| Page load | Fade-in contenu | 300ms | ease-out |
| Section reveal | Slide-up + fade | 400ms | ease-out |
| Quiz réponse | Pulse + couleur | 500ms | ease-in-out |
| Bouton hover | Scale + lift | 200ms | ease-out |
| Modal open | Zoom + fade | 300ms | ease-out |
| Navigation | Slide direction | 250ms | ease-in-out |

**Important** :
- Respecter `prefers-reduced-motion` (désactiver toutes les animations)
- Pas d'autoplay audio/vidéo
- Pas d'animations infinies intrusives

---

## Navigation

### Principale

- Logo = home (persiste en header)
- Menu : Home | Tutoriels | Mémos | [Admin si connecté]
- Sur mobile : hamburger

### Secondaire (dans tutoriel)

- Table des matières (sidebar desktop / collapsed mobile)
- Ancres vers sections
- Prev/Next buttons bas de page

### Breadcrumb

```
Accueil > Tutoriels > Attaque-Défense > Section 1
```

---

## Accessibilité

### Normes

- WCAG 2.1 AA minimum
- Contraste 4.5:1 pour texte normal, 3:1 pour large

### Clavier

- Tab = navigation tous boutons/liens
- Enter = activation
- Escape = fermer modals
- Flèches = navigation options quiz

### Lecteur d'écran

- Semantic HTML (`<button>`, `<nav>`, etc.)
- ARIA labels sur icônes
- Alt text sur images
- Descriptions pour graphiques complexes

### Moteur/Tremblements

- `prefers-reduced-motion: reduce` = zéro animations
- Interactions alternatives au glisser-déposer
- Pas d'effets flash

---

## Progression Utilisateur

### Indicateurs Visuels

- **Barres de progression** : %age visuel du tutoriel
- **Badges** : Tutoriels complétés (petite icône star)
- **Couleurs** : Tutoriel complété = vert, en cours = bleu, à faire = gris

### Stockage Local

- LocalStorage sauvegarde :
  - Tutoriels consultés
  - Sections lues
  - Quiz résultats
  - Progression %
- Synchronisé mais pas forcé à se connecter

### Optionnel Futur

- Tableau de bord personnel (petit panneau)
- "Continuer mon apprentissage"
- Recommandations basées sur parcours

---

## Responsive Design

### Breakpoints

```
Mobile     : < 640px
Tablet     : 640px - 1024px
Desktop    : > 1024px
Large      : > 1440px
```

### Adaptations

| Élément | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| Grille tutoriels | 1 col | 2 cols | 3-4 cols |
| Sidebar | Hidden (menu) | Collapsible | Always |
| Texte | 1rem | 1rem | 1rem |
| Images | 100% width | 80% | 70% max |
| Espacements | Réduits | Moyen | Plein |
| Boutons | Large (48px) | 44px | 40px |

### Touch-Friendly

- Boutons ≥ 44×44px (mobile)
- Espacement entre interactifs ≥ 8px
- Zones cliquables agrandies visuellement
- Pas de hover obligatoire (mobile n'a pas de hover)

---

## Thème & Atmosphère

### Éléments Visuels

- **Fond** : Texture subtile (castle stone pattern)
- **Accents** : Dessins légers (bannières, bordures épées)
- **Emojis** : Utilisés sobrement (titre, points clés)
- **Icônes** : Lucide Icons (cohérent, minimaliste)

### Tone du Texte

- **Amical** : Pas rigide, pas condescendant
- **Énergique** : Encouragement plutôt que critique
- **Clair** : Phrases courtes, jargon expliqué

### Corrections d'Erreurs

- Jamais ridiculiser une mauvaise réponse
- Toujours expliquer pourquoi la réponse est fausse
- Encourager à réessayer

Exemple :

```
❌ Mauvaise réponse

"La formation 424 n'est pas optimale pour la défense.
Pourquoi ? Parce que le ratio cavalerie/archer est trop 
faible pour tenir face aux attaques mono-cavalerie.

💡 Conseil : Essaie la 8.6.6 qui offre plus d'équilibre."

[Recommencer]
```

