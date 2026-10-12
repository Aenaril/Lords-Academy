# Tests — Correction du Flash « Tutoriel non disponible » (SHA 279f96a → commit final)

## Contexte

Deux corrections précédentes (commits 62f3919 et 279f96a) n'ont pas éliminé le flash « Tutoriel non disponible » qui apparaît brièvement lors du chargement du tutoriel dynamique Test.

### Racine identifiée

1. État `isLoadingPublished` était booléen, causant des conditions de course
2. `publishedTutorial` pouvait être `null` pendant le chargement, montrant l'erreur avant le contenu
3. Vérifications conditionnelles multiples avec `!editableTutorial` échouaient sur les objets vides `{}`
4. Pas d'association explicite entre la requête API et le résultat par `tutorialId`

### Solution implémentée

Machine d'état explicite : `'idle' | 'loading' | 'success' | 'not-found' | 'error'`

Chaque `tutorialId` a son propre cycle de chargement. Logique de rendu ordonnée et exhaustive.

---

## Scénarios couverts

### 1. Ouverture initiale du tutoriel Test

**Étapes** :
1. HomePage chargée
2. Cliquer sur carte Test
3. TutorialPage montée avec `tutorialId="test"`
4. API appelée, réponse attendue

**Attendu** :
- ✅ Affiche « Chargement du tutoriel… »
- ✅ Pas de flash « Tutoriel non disponible »
- ✅ Après ~500ms : contenu du tutoriel s'affiche
- ✅ Pas de rechargement de la page

**Statut** : À tester en navigateur

### 2. Requête lente (délai réseau simulé)

**Étapes** :
1. Ouvrir Test
2. Ralentir la connexion (DevTools)
3. Vérifier l'affichage pendant 2-3 secondes

**Attendu** :
- ✅ Message « Chargement du tutoriel… » visible pendant toute la durée
- ✅ Pas de basculement vers « Tutoriel non disponible »
- ✅ Contenu apparaît une fois la requête complète

**Statut** : À tester en navigateur

### 3. Changement rapide entre deux tutoriels

**Étapes** :
1. Ouvrir Test (en cours de chargement)
2. Immédiatement cliquer sur Dragon Arena
3. Attendre le rendu

**Attendu** :
- ✅ Affiche le contenu de Dragon Arena correctement
- ✅ Pas de mélange contenu Test + Dragon Arena
- ✅ Pas d'erreur TypeScript

**Statut** : À tester en navigateur

### 4. Tutoriel inexistant (pas d'API, pas de statique)

**Étapes** :
1. URL : `?tutorialId=nonexistent`
2. TutorialPage montée
3. API appelle avec ce tutorialId
4. Réponse : pas de contenu

**Attendu** :
- ✅ Affiche « Chargement du tutoriel… » pendant la requête
- ✅ Après la requête : « Tutoriel non disponible »
- ✅ Message correct, pas de rechargement

**Statut** : À tester en navigateur

### 5. Erreur réseau

**Étapes** :
1. Déconnecter la connexion réseau
2. Ouvrir Test
3. AttendreTimeout

**Attendu** :
- ✅ Affiche « Chargement du tutoriel… »
- ✅ Après timeout (~5-10s) : « Erreur de chargement »
- ✅ Message d'erreur lisible

**Statut** : À tester manuellement en navigateur

### 6. Brouillon vide accessible administrateur

**Étapes** :
1. Mode admin activé
2. « Mes tutoriels » → créer nouveau tutoriel « BrouillonTest »
3. Cliquer sur « BrouillonTest »

**Attendu** :
- ✅ Affiche « Brouillon vide »
- ✅ Bouton « + Ajouter la première section »
- ✅ Pas de flash

**Statut** : À tester en navigateur

### 7. Dragon Arena (tutoriel statique avec contenu)

**Étapes** :
1. HomePage chargée
2. Cliquer sur Dragon Arena
3. TutorialPage montée avec `tutorialId="dragon-arena"`

**Attendu** :
- ✅ Contenu affiche immédiatement (pas de chargement API)
- ✅ Pas de message « Chargement »
- ✅ Sections et blocs visibles

**Statut** : À tester en navigateur

### 8. Tutoriel publié (Test après publication)

**Étapes** :
1. Admin mode + brouillon Test chargé
2. Contenu édité et publié
3. Visitor (non-auth) ouvre Test

**Attendu** :
- ✅ Charge depuis API publique
- ✅ Affiche « Chargement du tutoriel… »
- ✅ Pas d'erreur authentification
- ✅ Contenu visible après ~500ms

**Statut** : À tester en navigateur

---

## Résumé des modifications

### Fichier : `app/src/pages/TutorialPage.tsx`

**Avant** : 290 lignes, états booléens multiples, conditions implicites

**Après** : ~350 lignes, machine d'état explicite, conditions exhaustives

**Changements clés** :
1. État `loadState` remplace `isLoadingPublished`
2. États distincts : `loading`, `success`, `not-found`, `error`
3. Chaque tutorialId associé à son état de requête
4. Fonction `loadPublished` utilise `requestTutorialId` pour éviter les conditions de course
5. Logique de rendu avec gardes explicites (Cas 1-5)
6. Séparation : états de chargement → affichage erreur/loader → contenu normal

**Lignes TypeScript** : 0 erreurs après build

---

## Technologie

- React 18 : `useState` + `useEffect` + `useRef`
- Isolation de requête : capturer `tutorialId` dans `requestTutorialId`
- Non-bloquant : `isMounted` flag + condition `requestTutorialId === tutorialId`
- Fallback réseau : rafraîchissement auto-5min si succès

---

## Déploiement

1. Commit local : SHA `[FINAL_SHA]`
2. Push origin/main
3. Cloudflare Pages auto-deploy
4. Tests navigateur
5. Rapporter résultats tests

---

## Prochaines étapes

Tests navigateur requis pour valider les 8 scénarios.

En cas de succès : phase suivante Étape 3.

En cas d'échec : rapporter le scénario exact, les logs console et le comportement observé.
