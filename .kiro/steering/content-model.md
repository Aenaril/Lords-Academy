# LORDS MOBILE ACADEMY — Modèle de Contenu Pédagogique

## Principes de Structure

### Pas de limites arbitraires

- Chaque tutoriel peut avoir le nombre de sections qu'il faut
- Chaque section peut avoir plusieurs blocs
- Durée : 5-20 minutes selon complexité du sujet

### Réutilisabilité

- Les blocs pédagogiques sont **génériques et réutilisables**
- Un même type de bloc peut être utilisé dans plusieurs tutoriels
- Les fiches mémo sont consultables hors du tutoriel

### Progression libérale

- Les visiteurs accèdent aux sections dans l'ordre proposé
- Mais peuvent sauter directement à une section spécifique
- Aucune obligation de suivre séquentiellement

---

## 8 Tutoriels Analysés

### 1. Attaque-Défense
- **Durée** : 8-10 min
- **Difficulté** : Moyen
- **Sections** : 4-5
  - Intro : rôle du filler
  - Défense : formations, ratios, pièges
  - Sceaux et équipement
  - Récapitulatif + mémo

### 2. Bataillons
- **Durée** : 10-12 min
- **Difficulté** : Moyen
- **Sections** : 3-4
  - Hall de Batailles (pas à pas)
  - Les 8 formations essentielles (comparaison)
  - Fonction Ratio
  - Conseils fillers

### 3. Dragon Arena
- **Durée** : 12-15 min
- **Difficulté** : Élevé
- **Sections** : 5-6
  - Intro : contexte Dragon Arena
  - RLs volants vs fixes
  - Fillers et troupes
  - Caravanes et bâtiments
  - Coordination de guilde
  - Mémo : rôles et positions

### 4. Épreuve-de-guilde
- **Durée** : 10-12 min
- **Difficulté** : Élevé
- **Sections** : 4-5
  - Introduction
  - Choix des compositions
  - Préparation héros/équipement
  - Erreurs courantes
  - Checklist pré-combat

### 5. Familiers pour attaques mono
- **Durée** : 10 min
- **Difficulté** : Moyen
- **Sections** : 4-5
  - Intro : rôle des familiers
  - Familiers cavalerie
  - Familiers infanterie
  - Familiers distance
  - Alternatives F2P

### 6. Phalanges et Rangées
- **Durée** : 15-20 min
- **Difficulté** : Très élevé
- **Sections** : 6-8
  - Fondamentaux (25 diapo !)
  - Formations classiques
  - Counters et stratégies
  - Merveilles vs rallies classiques
  - Cas d'étude
  - Exercices tactiques
  - Mémo : diagrammes formations

### 7. Règles Générales
- **Durée** : 12-15 min
- **Difficulté** : Moyen-élevé
- **Sections** : 5-6
  - Intro : rôles (RL, fillers, scouts)
  - Scout et identification
  - Coordination RL-fillers
  - Speed, kick, split
  - Communication
  - Checklist rally

### 8. Techniques Avancées
- **Durée** : 12-15 min
- **Difficulté** : Expert
- **Sections** : 5-6
  - Boozle : technique et contre
  - Compositions 208 et 055
  - Vitesse des marches
  - Gestion forts post-capture
  - Cas avancés
  - Mémo : techniques d'élite

---

## Types de Blocs Pédagogiques

### 1. TextBlock
**Utilité** : Texte simple, paragraphes, listes

```json
{
  "type": "text",
  "content": "Les formations 208 et 055 sont très puissantes..."
}
```

Affichage :
- Texte noir lisible, police adaptée
- Listes à puces
- Emphase possible (gras, italique)
- Pas de HTML directement (markdown simple)

---

### 2. ImageBlock
**Utilité** : Image seule, illustration, capture

```json
{
  "type": "image",
  "imagePath": "/images/illustrations/formation-208.svg",
  "caption": "Formation 208 : dispositions selon force",
  "alt": "Diagramme de la formation 208"
}
```

Affichage :
- Image responsive (100% width sur mobile, max-width sur desktop)
- Caption sous image
- Alt text pour accessibilité
- Lazy loading

---

### 3. TextImageBlock
**Utilité** : Explication + illustration côte à côte

```json
{
  "type": "text-image",
  "text": "La formation 208 combine...",
  "imagePath": "/images/illustrations/208-ratios.png",
  "imagePosition": "right",
  "caption": "Ratios de la 208"
}
```

Affichage :
- Sur desktop : texte à gauche, image à droite (ou inversé)
- Sur mobile : image puis texte (stack vertical)
- Espacements équilibrés

---

### 4. QuizBlock
**Utilité** : Vérifier compréhension, interaction

```json
{
  "type": "quiz",
  "question": "Quelle formation utiliser pour défendre un fort ?",
  "options": [
    "424 — Infanterie/Archers/Cavalerie",
    "208 — Infanterie/Cavalerie",
    "8.6.6 — Défense mixte",
    "12.2.6 — Attaque aggressive"
  ],
  "correctAnswerIndex": 2,
  "explanation": "La formation 8.6.6 est recommandée pour la défense car elle offre un meilleur ratio de résilience..."
}
```

Affichage :
- Questions avec 3-5 options
- Clic = feedback immédiat
- Réponse correcte : ✓ vert
- Réponse fausse : ✗ rouge + explication
- Bouton "Recommencer"
- Progression : quiz validé stocké localement

---

### 5. ComparisonBlock
**Utilité** : Contraster 2-4 stratégies, formations, rôles

```json
{
  "type": "comparison",
  "title": "RLs Volants vs RLs Fixes",
  "items": [
    {
      "name": "RL Volant",
      "description": "Mobile, réactif, change de cible",
      "pros": [
        "Flexibilité maximale",
        "Adaptation rapide",
        "Couverture large"
      ],
      "cons": [
        "Charge émotionnelle élevée",
        "Erreurs sous pression",
        "Coordination délicate"
      ]
    },
    {
      "name": "RL Fixe",
      "description": "Posté sur une zone, reçoit les troupes",
      "pros": [
        "Tranquillité relative",
        "Collecte organisée",
        "Préparation en avance"
      ],
      "cons": [
        "Moins de flexibilité",
        "Dépendant des fillers",
        "Point faible potentiel"
      ]
    }
  ]
}
```

Affichage :
- Tableau comparatif sur desktop
- Cartes empilées sur mobile
- Icônes +/- pour pros/cons
- Alternance de couleurs

---

### 6. InteractiveMapBlock
**Utilité** : Image avec zones cliquables (Dragon Arena, positions)

```json
{
  "type": "interactive-map",
  "imagePath": "/images/dragon-arena-map.jpg",
  "hotspots": [
    {
      "x": 30,
      "y": 40,
      "label": "Caravane Sud",
      "description": "RLs volants tentent de capturer pour l'or"
    },
    {
      "x": 70,
      "y": 30,
      "label": "Château Central",
      "description": "Enjeu majeur, défense massive requise"
    }
  ]
}
```

Affichage :
- Image comme fond
- Points cliquables (cercles ou icônes)
- Au clic : info popup
- Sur mobile : liste déroulante au lieu de clics

---

### 7. ChecklistBlock
**Utilité** : Étapes à suivre, vérification avant action

```json
{
  "type": "checklist",
  "title": "Avant de Lancer une Rally",
  "items": [
    {
      "label": "Former vos bataillons",
      "description": "Utiliser le ratio demandé par le RL"
    },
    {
      "label": "Équiper vos sceaux",
      "description": "Priorité vitesse pour rejoindre le rally"
    },
    {
      "label": "Écouter le tchat",
      "description": "Dernières instructions du RL"
    }
  ]
}
```

Affichage :
- Checkboxes (interactives, sauvegardées en session)
- État coché/décoché
- Description optionnelle
- Bouton "Réinitialiser"

---

### 8. MemoCardBlock
**Utilité** : Antisèche, fiche rapide, résumé à retenir

```json
{
  "type": "memo-card",
  "title": "Les 3 Règles d'Or du Filler",
  "content": "1. Respecter le ratio du RL\n2. Ne jamais remplir les forts complètement\n3. Écouter les instructions du tchat",
  "icon": "star"
}
```

Affichage :
- Carte visuelle avec fond dégradé et icône
- Contenu court et frappant
- Accessible depuis page d'accueil (section "Mémos")
- Copie/partage possible

---

## Liens Entre Tutoriels

### Renvois Contextuels

À la fin de chaque section :
- "📌 Pour en savoir plus : [Tutoriel X] > [Section Y]"
- Lien cliquable = navigue vers tutoriel + section
- Conserve position actuelle (si revenir)

### Exemple d'Architecture Pédagogique

```
Attaque-Défense (2)
├─ S'appuie sur → Bataillons (1)
├─ S'appuie sur → Phalanges-Rangées (6)
└─ Complément → Familiers (5)

Dragon-Arena (3)
├─ Utilise → Attaque-Défense (2)
├─ Utilise → Règles-Générales (7)
└─ Approfondissements → Techniques-Avancées (8)

Phalanges-Rangées (6) [tutoriel le plus technique]
├─ S'appuie sur → Bataillons (1)
├─ Croise avec → Techniques-Avancées (8)
└─ Référencé par → Tous les autres
```

---

## Édition des Contenus (R4)

### Interface d'ajout de bloc

```
[+ Ajouter un bloc]
  ↓
Sélecteur : Text / Image / TextImage / Quiz / Comparison / ...
  ↓
Formulaire dynamique :
  - TextBlock : textarea simple
  - ImageBlock : upload image + champ caption
  - QuizBlock : question, 3-5 options, select réponse, explanation
  - Etc.
  ↓
[Aperçu] [Enregistrer] [Annuler]
```

### Édition d'un bloc existant

```
[Bloc existant] → Bouton crayon
  ↓
Ouvre formulaire pré-rempli
  ↓
Modification
  ↓
[Aperçu modifié] [Enregistrer] [Annuler]
```

---

## Importants

- ❌ Pas d'HTML brut côté interface édition
- ❌ Pas de JavaScript libre
- ✓ Validation côté serveur de tous les blocs
- ✓ Structure JSON stricte (typée)
- ✓ Images optimisées avant stockage
- ✓ Textes échappés contre injections

