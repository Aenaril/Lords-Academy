# LORDS MOBILE ACADEMY — Système d'Administration R4

## Principes Fondamentaux

### Utilisateurs autorisés (R4)

- Membres autorisés de la guilde
- Partagent **un mot de passe unique**
- Pas de compte individuel
- Pas de synchronisation avec grades Lord Mobile
- Simple, centralisé, facilement révocable

### Philosophie

**❌ Pas de code** :
- Aucune manipulation de fichiers
- Aucune connaissance technique requise
- Aucun risque de casser quelque chose

**✓ Visuel et intuitif** :
- Interface graphique standard
- Boutons crayon sur chaque élément
- Formulaires simples et guidés
- Prévisualisations immédiates

---

## Accès à l'Administration

### Butted Admin (Discret)

- Petit bouton/lien en bas de page ou coin
- Texte : "Admin" ou "⚙️" 
- Pas en évidence pour les visiteurs normaux
- Au clic :

```
┌──────────────────────┐
│  CONNEXION ADMIN     │
│                      │
│  Mot de passe:       │
│  [••••••••••]        │
│                      │
│  [Accéder] [Fermer]  │
└──────────────────────┘
```

### Authentification

1. **Saisie du mot de passe** :
   - Champ type="password"
   - Pas de hints visibles
   - Bouton "Accéder"

2. **Envoi au serveur** :
   - HTTPS obligatoire
   - POST vers `https://workers.domain.com/api/auth`
   - Payload : `{ password }`

3. **Vérification serveur** (Cloudflare Workers) :
   - Récupère mot de passe depuis env/KV
   - Valide avec hash/comparaison sécurisée
   - **Rate limiting** : Max 5 tentatives en 15 min par IP
   - Log tentative échouée (audit)

4. **Réponse réussie** :
   - JWT token (1h expiration)
   - Retourné au frontend
   - Stocké en `sessionStorage` (meurt à fermeture onglet)

5. **Erreur** :
   - Affiche "Mot de passe incorrect"
   - Ne révèle pas si compte/serveur existe
   - Compte tentative (rate limit)

### SessionStorage vs LocalStorage

- **SessionStorage** : JWT (expiration tab)
- **LocalStorage** : Jamais de token

**Raison** : Si navigateur fermé, fin de session admin.

---

## Interface Administrateur

### Vue générale

Une fois connecté, l'interface change :

```
┌────────────────────────────────────────────┐
│ [Logo] Academy    [R4: connecté] [Déconnexion]
├────────────────────────────────────────────┤
│                                            │
│ TUTORIELS GÉRABLES                         │
│                                            │
│ ┌──────────────────┐  [+Nouveau]          │
│ │ Attaque-Défense │  [Brouillons ▼]      │
│ │ [✏️ Éditer]      │  [Rechercher...]    │
│ │ 8 sections       │                       │
│ │ Publié           │                       │
│ └──────────────────┘                       │
│                                            │
│ ┌──────────────────┐                       │
│ │ Bataillons       │                       │
│ │ [✏️ Éditer]      │                       │
│ │ 10 sections      │                       │
│ │ Publié           │                       │
│ └──────────────────┘                       │
│                                            │
│ ...                                        │
│                                            │
└────────────────────────────────────────────┘
```

### Opérations principales

#### 1. Édition d'un tutoriel

Au clic sur [✏️ Éditer] :

```
┌─────────────────────────────────┐
│ ÉDITER : Attaque-Défense        │ [←Retour]
├─────────────────────────────────┤
│                                 │
│ Titre :    [Attaque-Défense]   │
│ Catégorie: [Combats ▼]          │
│ Difficulté:[Medium ▼]           │
│ Durée:     [8-10 min]           │
│ Description:[Zone de texte]     │
│                                 │
│ Image couverture:               │
│ [Aperçu] [Changer...]           │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ SECTIONS                        │
│                                 │
│ ┌─ Introduction ─────────────┐  │
│ │ [+] [✏️] [↑↓] [🗑️]         │  │
│ └─────────────────────────────┘  │
│                                 │
│ ┌─ Défense : Ratios ─────────┐  │
│ │ [+] [✏️] [↑↓] [🗑️]         │  │
│ └─────────────────────────────┘  │
│                                 │
│ [+ Ajouter section]             │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ Statut : [Brouillon ▼]          │
│                                 │
│ [Aperçu] [Sauvegarder] [Annuler]│
│                                 │
└─────────────────────────────────┘
```

#### 2. Édition d'une section

Au clic sur [✏️] d'une section :

```
┌─────────────────────────────────┐
│ ÉDITER : Section "Défense"      │ [←Retour]
├─────────────────────────────────┤
│                                 │
│ Titre :    [Ratios Recommandés] │
│ Description (optionnel):        │
│ [Texte...]                      │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ BLOCS DE CONTENU                │
│                                 │
│ ┌─ Bloc 1: Text ────────────┐   │
│ │ "Les formations 208..."   │   │
│ │ [✏️] [🗑️]                  │   │
│ └────────────────────────────┘   │
│                                 │
│ ┌─ Bloc 2: Image ───────────┐   │
│ │ [Miniature image]         │   │
│ │ "Formation 208"           │   │
│ │ [✏️] [🗑️]                  │   │
│ └────────────────────────────┘   │
│                                 │
│ [+ Ajouter bloc]                │
│                                 │
│ [Aperçu] [Sauvegarder] [Annuler]│
│                                 │
└─────────────────────────────────┘
```

#### 3. Ajouter un bloc

Au clic sur [+ Ajouter bloc] :

```
┌─────────────────────────────────┐
│ NOUVEAU BLOC                    │
├─────────────────────────────────┤
│                                 │
│ Type de bloc :                  │
│                                 │
│ ○ Texte simple                  │
│ ○ Image                         │
│ ○ Texte + Image                 │
│ ○ Quiz                          │
│ ○ Comparaison                   │
│ ○ Carte interactive             │
│ ○ Checklist                     │
│ ○ Fiche mémo                    │
│                                 │
│ [Continuer]                     │
│                                 │
└─────────────────────────────────┘
```

Puis, selon le type choisi, formulaire adapté.

**Exemple : QuizBlock** :

```
┌─────────────────────────────────┐
│ NOUVEAU QUIZ                    │
├─────────────────────────────────┤
│                                 │
│ Question:                       │
│ [Zone texte multiligne]         │
│                                 │
│ Options (min 2, max 5):         │
│ □ [Texte option 1]             │
│ □ [Texte option 2]             │
│ □ [Texte option 3]             │
│ [+] Ajouter option              │
│                                 │
│ Bonne réponse: [Option 2 ▼]    │
│                                 │
│ Explication (si faux):          │
│ [Zone texte multiligne]         │
│                                 │
│ [Aperçu] [Sauvegarder] [Annuler]│
│                                 │
└─────────────────────────────────┘
```

#### 4. Publication

Sauvegarde en tant que brouillon :

```
┌──────────────────────────────┐
│ PUBLIER CE TUTORIEL ?        │
├──────────────────────────────┤
│                              │
│ Titre: Attaque-Défense       │
│ Statut: Brouillon → Publié   │
│                              │
│ ⚠️  Modification immédiatement
│    visible aux visiteurs.    │
│                              │
│ Créateur: R4-Name           │
│ Date: 2026-10-10 14:23      │
│                              │
│ [Historique des versions]    │
│ - v1 (2026-10-10 14:00)    │
│ - v0 (2026-10-09 20:15)    │
│                              │
│ [Publier] [Garder brouillon] │
│                              │
└──────────────────────────────┘
```

### Fonctionnalités R4

Opérations autorisées :

| Opération | Détail | Restriction |
|-----------|--------|-------------|
| Modifier texte | Titles, descriptions, contenu | Validation longueur |
| Modifier images | Remplacer, optimiser | Max 5MB, format whitelist |
| Ajouter/éditer quiz | Questions, réponses, corrections | Réponse unique obligatoire |
| Réorganiser sections | Drag-drop, flèches haut/bas | Simple et visuel |
| Ajouter sections | Créer nouvelle section | Titre obligatoire |
| Supprimer sections | Avec confirmation | "Êtes-vous sûr ?" |
| Créer tutoriel | Nouveau tutoriel | Template initial |
| Modifier métadonnées | Titre, catégorie, difficulté | Suggestions prédéfinies |
| Brouillon/Publication | Toggle statut | Confirmation requise |
| Historique | Voir/restaurer versions | Limité à 10 dernières |

### Opérations Interdites

- ❌ Accéder au code
- ❌ Modifier structure JSON directement
- ❌ Importer/exporter sans interface
- ❌ Modifier permissions d'autres R4
- ❌ Supprimer tutoriels (archive seulement)
- ❌ Accéder à données visiteurs

---

## Flux de Sauvegarde et Publication

### Workflow complet

```
1. R4 SAISIT
   └─ Modifications locales (sessionStorage en backup)

2. R4 CLIQUE "SAUVEGARDER"
   ├─ Validation côté client (format, longueurs)
   ├─ Envoi POST /api/content/update
   │  ├─ JWT vérifié côté serveur
   │  ├─ Données validées côté serveur (escape, types)
   │  ├─ Stockage en GitHub (branche drafts privée)
   │  └─ Commit créé
   └─ Retour : "Brouillon enregistré"

3. R4 CLIQUE "PRÉVISUALISER"
   ├─ Affiche le contenu comme visiteur le verrait
   ├─ Readonly (pas d'édition dans preview)
   └─ [Retour] revient à l'éditeur

4. R4 CLIQUE "PUBLIER"
   ├─ Confirmation: "Ceci sera visible par tous"
   ├─ Envoi POST /api/content/publish
   │  ├─ JWT vérifié
   │  ├─ Données finales validées
   │  ├─ Push vers branche gh-pages (publique)
   │  ├─ GitHub Actions triggérée
   │  ├─ Rebuild Vite lancé
   │  └─ Déploiement sur GitHub Pages
   └─ Retour : "En ligne !" + lien

5. UTILISATEUR VISITEUR
   ├─ Recharge page
   ├─ Nouveau contenu visible
   └─ Progression locale préservée

6. RESTAURATION (optionnel)
   ├─ Liste des versions
   ├─ Au clic sur version ancienne
   ├─ Affiche contenu ancien + "Restaurer"
   ├─ Redevient brouillon
   └─ Peut être republié
```

---

## Sécurité Impérative

### Secrets (JAMAIS en code public)

- **Mot de passe R4** : Hash + comparaison sécurisée (bcrypt)
- **Token GitHub API** : Stocké Cloudflare env
- **Clé JWT** : Stocké Cloudflare env
- **Mot de passe Cloudflare** : Gestion d'accès IAM

### Vérifications Serveur

```
POST /api/content/update
├─ 1. HTTPS ? (sinon reject)
├─ 2. JWT présent et valide ? (sinon 401)
├─ 3. JWT expiré ? (sinon 401)
├─ 4. Données présentes ? (sinon 400)
├─ 5. Payload conforme schéma ? (sinon 400)
│  ├─ Types corrects
│  ├─ Longueurs limites
│  ├─ Caractères valides (escape XSS)
│  └─ Contenus logiques
├─ 6. Rate limit ? (sinon 429)
└─ 7. [EXEC] Enregistrer + commit GitHub
```

### Logging & Audit

Chaque action loggée :

```json
{
  "timestamp": "2026-10-10T14:23:00Z",
  "action": "content_update",
  "tutorialId": "attaque-defense",
  "r4": "Joueur123",
  "ipAddress": "192.168.1.x (hashed)",
  "status": "success",
  "changesSummary": "Updated 2 blocks in section 1"
}
```

---

## Gestion des Brouillons

### Statuts possibles

- **Brouillon** : En édition, pas visible visiteurs
- **Publié** : Visible sur site
- **Archivé** : Masqué mais conservé

### Confidentialité

Si brouillons confidentiels :
- Stored on `drafts` branch (private ou restricted)
- Jamais exposés via Pages publique
- Historique Git sécurisé
- Accès via `wrangler` seulement (admin)

---

## Contraintes Techniques

### Limites

- Upload image : max 5MB
- Contenu texte : max 50k caractères par section
- Blocs par section : max 100
- Sections par tutoriel : max 50
- Quiz options : min 2, max 5

### Performance

- Sauvegardes instantanées (optimistic update)
- Rebuild < 2 min (GitHub Actions)
- Déploiement < 30 sec (propagation CDN)

---

## FAQ R4

**Q: Où stocke-t-on le mot de passe ?**  
R: En variables d'environnement Cloudflare Workers (sécurisé, non exposé).

**Q: Puis-je changer le mot de passe ?**  
R: Oui, via éditeur Cloudflare (tu dois demander à dev).

**Q: Que se passe-t-il si je ferme l'onglet admin ?**  
R: Session expirée, relancer depuis le début (normal).

**Q: Puis-je modifier un tutoriel publié ?**  
R: Oui, enregistrer en brouillon d'abord, puis republier.

**Q: Historique des versions ?**  
R: Git conserve tout. Restaurer via interface admin.

**Q: Puis-je créer un nouveau tutoriel ?**  
R: Oui, bouton [+ Nouveau tutoriel], remplir le template.

