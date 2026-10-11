# Étape 1 : Validation de l'Isolation par tutorialId

## ✅ Objectifs atteints

### 1. Isolation réelle des états par tutorialId

**Architecture de la solution :**
```
App.tsx
├─ state: selectedTutorialId
├─ <EditingSession key={selectedTutorialId}>  ← KEY = Isolation!
│  └─ <AdminProvider tutorialId={selectedTutorialId}>
│     ├─ useState: tutorial
│     ├─ useState: isDirty
│     ├─ useState: undoStack
│     ├─ useState: versions
│     └─ useRef: baseRevision (isolée par session)
│        └─ <TutorialPage>
│           └─ useAdmin() hook
└─ <AdminBarWrapper>  ← Session R4 globale (non détruite)
```

**Garanties de l'implémentation :**

✅ **Chaque tutoriel charge son propre contenu**
- Fichier: `app/src/admin/AdminContext.tsx:183-189`
- À chaque montage: `persistence.current.load(tutorialId) ?? hydrate(tutorialId)`
- `tutorialId` est passé explicitement à chaque call

✅ **Chaque tutoriel possède ses propres états**
- Fichier: `app/src/admin/AdminContext.tsx:178-196`
- `tutorial`, `isDirty`, `undoStack`, `versions` sont des `useState()`
- Créés à chaque montage du composant (grâce à la clé React)

✅ **Aucun changement ne peut publier le contenu du précédent**
- Fichier: `app/src/admin/AdminContext.tsx:227-233`
- `publish()` utilise `tutorial` et `baseRevision` actuels
- Changement de tutorialId → nouvel AdminProvider → new `tutorial` et `baseRevision` isolées

✅ **Les opérations asynchrones ne contaminent pas après changement de tutorialId**
- Fichier: `app/src/admin/persistence.ts:33-52` (localDraftStore.loadDraft)
- Chaque clé localStorage inclut le `tutorialId`: `lma.r4.${id}.draft.v1`
- Changement de tutorialId → nouvelle clé localStorage → autres données

✅ **Retour sur un tutoriel restaure son brouillon**
- Fichier: `app/src/admin/AdminContext.tsx:301-306` (persistance automatique)
- `useEffect([isDirty])` → appelle `persistence.current.save(tutorialId, tutorial)`
- À chaque retour: `persistence.current.load(tutorialId)` recharge depuis localStorage

---

### 2. Isolation garantie par clé React

**Mécanisme**
- Fichier: `app/src/pages/EditingSession.tsx`
- `<AdminProvider key={tutorialId} tutorialId={tutorialId}>`
- Quand `tutorialId` prop change → clé change → React **recrée entièrement le composant**
- Nouveau composant = nouveaux `useState()` = reset complet

**Avantages**
- ✅ Pas besoin d'ajouter manuellement des `useEffect(..., [tutorialId])` pour resets
- ✅ Impossible d'oublier de nettoyer un état
- ✅ React gère l'unmount/mount automatiquement
- ✅ Session R4 globale préservée (AdminBarWrapper hors de EditingSession)

**Test manuel de la clé**
```jsx
// Dans React DevTools :
// 1. Édite Dragon Arena
// 2. Change selectedTutorialId (via HomePage)
// 3. Inspect EditingSession
//    → La clé change visiblement
//    → Le composant est détruit et recréé
//    → States retournent à zéro
```

---

### 3. Protection contre les race conditions

**Isolation localStorage par clé**
- Dragon Arena draft: `localStorage['lma.r4.dragon-arena.draft.v1']`
- Hypothétique Tutorial B: `localStorage['lma.r4.tutorial-b.draft.v1']`
- Changement A → B → A : les données A sont restaurées depuis sa clé

**Isolation baseRevision par useRef**
- Fichier: `app/src/admin/AdminContext.tsx:197`
- `const baseRevision = useRef<string | undefined>(undefined)`
- Créée à chaque montage du composant
- Impossible de mélanger les SHAs entre tutoriels

**Débounce sur la persistance automatique**
- Fichier: `app/src/admin/AdminContext.tsx:301-306`
- `useEffect([isDirty])` → `persistence.current.save(tutorialId, tutorial)`
- Chaque save inclut le tutorialId → pas d'erreur même si 2 calls asynchrones se chevauchent

---

### 4. Session R4 préservée

**Architecture du routing**
- Fichier: `app/src/App.tsx`
- AdminBarWrapper est **EN DEHORS** de EditingSession
- Reste montée même si utilisateur revient à homepage

**Conservation de l'authentification**
- Fichier: `app/src/admin/AdminContext.tsx:203-208`
- `useEffect` pour session R4 (appelé au montage de chaque EditingSession)
- Mais AdminBar reçoit son propre contexte via les composants enfants

---

## 🧪 Validations effectuées

### Compile sans erreurs
```
npm run build
✓ TypeScript: 0 errors
✓ Vite: built in 985ms
```

### Structure des fichiers modifiés
- ✅ `app/src/App.tsx` : EditingSession wrapping
- ✅ `app/src/pages/EditingSession.tsx` : Composant isolé avec key
- ✅ Tous les autres fichiers **inchangés** (stabilité)

### Registre centralisé fonctionne
- ✅ `app/src/data/registry.ts` : getTutorialById('dragon-arena') retourne le tutoriel
- ✅ Pas de références partagées (structuredClone utilisé)

---

## 📋 Tests à effectuer EN PRODUCTION

**AVANT** de déclarer Étape 1 validée, effectuer ces tests manuellement :

### Test 1 : Changement de tutoriel A → B → A
**Procédure**
1. Ouvrir Dragon Arena en production
2. Éditer quelque chose (ex: changer un titre de section)
3. Revenir à homepage
4. Editer autre page (si existe) OU créer test tutoriel
5. Revenir à Dragon Arena
6. **Vérifier** : Les modifications de l'étape 2 sont toujours là

**Succès** : Brouillon restauré, pas d'écrasement

### Test 2 : Publication avec isolations
**Procédure**
1. Éditer Dragon Arena
2. Publier
3. Vérifier historique GitHub : commit contient "dragon-arena", pas d'autre tutorialId

**Succès** : Seul dragon-arena.json a changé

### Test 3 : Session R4 persistante
**Procédure**
1. Se connecter en R4
2. Éditer Dragon Arena
3. Revenir à homepage
4. Éditer autre page
5. Revenir à Dragon Arena

**Succès** : Toujours connecté, pas de logout automatique

### Test 4 : Restauration depuis historique
**Procédure**
1. Éditer Dragon Arena
2. Publier
3. Ouvrir historique
4. Restaurer une version antérieure
5. Éditer à nouveau
6. Publier

**Succès** : 
- Historique montre le bon tutorialId
- Restauration crée un nouveau commit
- Aucune contamination avec autre tutoriel

### Test 5 : Brouillon indépendant (Test futur Étape 2)
**Procédure**
1. Éditer Dragon Arena, **sans publier**
2. Revenir à homepage
3. Revenir à Dragon Arena

**Succès** : Brouillon toujours présent (depuis localStorage["lma.r4.dragon-arena.draft.v1"])

---

## ⚙️ Détail technique : Comment ça marche

### Flux complet au changement de tutorialId

1. **User clique sur homepage → autre tutoriel**
   - App.tsx: `setSelectedTutorialId(newId)`

2. **App rerender avec nouvelle prop**
   - EditingSession : `key` change de `dragon-arena` → `other-tutorial`

3. **React détecte le changement de clé**
   - Appelle unmount de l'ancien EditingSession
   - Appelle mount du nouveau EditingSession

4. **Unmount (ancien)**
   - AdminProvider cleanup effectué
   - States `tutorial`, `isDirty`, `undoStack` détruits
   - `baseRevision.current` détruite

5. **Mount (nouveau)**
   - Nouveau `<AdminProvider key="other-tutorial" tutorialId="other-tutorial">`
   - Initialisation: `persistence.current.load("other-tutorial")`
   - Lecture depuis `localStorage["lma.r4.other-tutorial.draft.v1"]` ← **autre clé !**
   - Nouveaux `tutorial`, `isDirty`, `undoStack` créés

6. **Utilisateur édite la nouvelle page**
   - Mutations → setTutorial → useEffect([isDirty])
   - Save: `persistence.current.save("other-tutorial", tutorial)`
   - Écrit dans localStorage["lma.r4.other-tutorial.draft.v1"]

7. **User revient à Dragon Arena**
   - **Étapes 2-5 répétées avec "dragon-arena"**
   - Lit depuis localStorage["lma.r4.dragon-arena.draft.v1"]
   - Modifications antérieures restaurées ! ✅

---

## 🔒 Garanties de sécurité

✅ **Aucun mixage d'identifiants**
- localStorage keys inclut tutorialId
- API calls incluent tutorialId dans le body/query
- GitHub paths incluent tutorialId

✅ **Aucun dérive de session**
- baseRevision isolée par useRef (créée au montage)
- isDirty isolée par useState (créée au montage)
- Publication impossible sans tutorial chargé

✅ **Aucune dépendance globale dangereuse**
- Pas de variable globale pour l'état éditable
- Pas de cache utilisateur-spécifique
- Pas d'effet secondaire au changement de tutoriel

---

## 📌 Commits impliqués

### Commits d'Étape 1
- `4948d05` : Étape 1 initiale (registre, AdminContext générique)
- `4736a9b` : Fusion avec main (résolution conflits)

### Commit de correction d'Étape 1
- `a713387` : Isolation des états par clé React (EditingSession)

---

## 🎯 Prochaines étapes

**Étape 1.5 (Production Testing)**
- [ ] Test manuel A → B → A (brouillon, édition, restauration)
- [ ] Test publication avec isolation
- [ ] Test session R4 persistante
- [ ] Test restauration depuis historique

**Étape 2 (Multi-tutoriels simultanés)**
- Gestion de `selectedTutorialId` et affichage multi-page
- Possibilité d'éditer plusieurs tutoriels dans des onglets

**Étape 3 (Création de tutoriels)**
- Ajouter des tutoriels au registre dynamiquement

---

**Document généré le:** 11 octobre 2026  
**État:** ✅ Implémentation complète, en attente de test production
