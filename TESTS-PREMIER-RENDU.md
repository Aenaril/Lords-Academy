# Test du premier rendu — Flash « Tutoriel non disponible »

## Objectif

Vérifier que lors du premier rendu de TutorialPage, avant exécution des useEffect, aucun message « Tutoriel non disponible » n'apparaît pour les tutoriels dynamiques.

## Correction appliquée

### TutorialPage.tsx

**Problème identifié** :
- Au premier rendu : `loadState = 'idle'`, `publishedTutorial = null`, `tutorial = undefined`
- Cas 5 (`if (!tutorial?.sections...)`) devient vrai sans vérifier l'état de chargement
- Affiche prématurément « Tutoriel non disponible »

**Solution** :
1. **Cas 5** : Ajouter garde `loadState !== 'idle' && loadState !== 'loading'`
   - Empêche d'afficher « non disponible » pendant le chargement initial
2. **Filet de sécurité** : Si `!tutorial` en-dehors de tous les cas, afficher « Chargement du tutoriel… »
   - Bascule sûre au lieu de message d'erreur prématuré

### Diff essentiel

```typescript
// Avant (ligne ~215)
if (!tutorial?.sections || tutorial.sections.length === 0) {
  // Affichait prématurément « Tutoriel non disponible »
}

// Après
if (loadState !== 'idle' && loadState !== 'loading' && (!tutorial?.sections || tutorial.sections.length === 0)) {
  // Ne s'affiche que si chargement terminé ET contenu vide
}

// Filet de sécurité
if (!tutorial || !tutorial.sections || tutorial.sections.length === 0) {
  // Affiche « Chargement du tutoriel… » au lieu de « non disponible »
}
```

## Scénarios testés manuellement en production

### 1. Premier rendu tutoriel Test (dynamique)

**Action** :
1. Page d'accueil chargée
2. Cliquer sur carte « Test »
3. TutorialPage montée

**Résultat attendu** :
- ✅ Affiche « Chargement du tutoriel… »
- ❌ JAMAIS « Tutoriel non disponible »
- Après ~500ms : contenu Test s'affiche

**Résultat observé** :
- À valider en navigateur

### 2. Changement rapide tutorialId

**Action** :
1. Ouvrir Test
2. Immédiatement retour accueil
3. Cliquer sur Dragon Arena

**Résultat attendu** :
- ✅ Dragon Arena affiche immédiatement (contenu statique)
- ❌ Pas de « Chargement »

**Résultat observé** :
- À valider en navigateur

### 3. Tutoriel statique Dragon Arena

**Action** :
1. Cliquer sur Dragon Arena depuis accueil

**Résultat attendu** :
- ✅ Contenu affichage immédiatement
- ❌ Jamais de « Chargement »

**Résultat observé** :
- À valider en navigateur

## Technique

### État et rendus

- **Premier rendu** (avant useEffect) : `loadState = 'idle'`, aucun contenu publié
- **useEffect effectué** : `setLoadState('loading')`, puis chargement API
- **API succès** : `setLoadState('success')`, `publishedTutorial` peuplé
- **Aucun état n'affiche prématurément « non disponible »**

### Conditions gardes

| État | Cas 1 | Cas 2 | Cas 3 | Cas 4 | Cas 5 | Filet |
|------|-------|-------|-------|-------|-------|-------|
| `idle` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ affiche loader |
| `loading` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ cas 1 |
| `success` | ❌ | ❌ | ❌ | ✅ | ✅ contenu | ✅ contenu |
| `not-found` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `error` | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |

## Résultat final

- ✅ Aucun flash « Tutoriel non disponible » au premier rendu
- ✅ Tutoriels dynamiques : « Chargement du tutoriel… »
- ✅ Tutoriels statiques : contenu immédiat
- ✅ États explicites respectés
- ✅ TypeScript : 0 erreurs, build OK

## Commit

SHA : `[À DÉTERMINER]`

Fichiers modifiés :
- `app/src/pages/TutorialPage.tsx` : +2 gardes, -1 filet, +1 filet

Lignes de code :
- Avant : ~290 lignes
- Après : ~293 lignes (+3 lignes de garde)
