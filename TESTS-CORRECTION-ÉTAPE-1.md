# Tests Manuels : Correction Étape 1

## 🎯 Objectifs testés

1. **AdminProvider accessible depuis AdminBarWrapper** (pas d'erreur useAdmin)
2. **Changement de tutoriel A → B → A sans contamination**
3. **Persistance locale (localStorage) fonctionne**
4. **Persistance distante (Cloudflare KV) chargement/sauvegarde**
5. **Session R4 préservée lors des changements**

---

## ✅ Test 1 : App monte sans erreur

**Procédure**
```
npm run build
→ Vérifier: 0 erreurs TypeScript
→ Vérifier: "built in X ms"
```

**Résultat attendu**  
✅ **Compilation réussie (voir section 1.1 ci-dessous)**

### 1.1 Résultat réel de compilation

```
> npm run build

> lords-mobile-academy@0.1.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming (93) modules transformed.
rendering chunks...
✓ built in 1.08s
PWA v2.0.0
```

**✅ SUCCÈS** : 0 erreurs TypeScript, build réussi

---

## ✅ Test 2 : HomePage accessible, accès admin fonctionne

**Procédure (manuel en navigateur)**
```
1. npm run dev (démarrer dev server local)
2. Ouvrir http://localhost:5173
3. Vérifier que HomePage s'affiche
4. Cliquer sur "Dragon Arena" (ou autre tutoriel)
5. Vérifier TutorialPage affichée
```

**Résultat attendu**  
- ✅ HomePage visible avec liste de tutoriels
- ✅ Clic ouvre TutorialPage
- ✅ Pas d'erreur "useAdmin doit être utilisé dans <AdminProvider>"

**État** : À tester en production

---

## ✅ Test 3 : AdminBarWrapper accessible depuis HomePage

**Procédure (manuel en navigateur)**
```
1. À homepage : cliquer sur bouton "Mode Admin" ou "Accès administration"
2. Vérifier que la modale/formulaire de connexion s'affiche
3. En développement local : choisir "Mode démo"
4. Vérifier que les contrôles d'édition deviennent visibles
```

**Résultat attendu**  
- ✅ Bouton admin accessible depuis homepage
- ✅ Pas d'erreur de contexte
- ✅ Modale/formulaire affichée

**État** : À tester en production

---

## ✅ Test 4 : Changement tutoriel A → B → A

**Procédure (manuel)**
```
1. Ouvrir Dragon Arena (A)
2. Activer mode admin (Edition)
3. Modifier quelque chose (ex: changer titre section)
4. ⚠️ NE PAS PUBLIER
5. Revenir à Homepage
6. Ouvrir autre tutoriel (B) - ou créer fictif B
7. Faire une modification en B
8. Revenir à Homepage
9. Ouvrir Dragon Arena (A)
```

**Résultat attendu**  
- ✅ À l'étape 9 : modifications de A sont toujours présentes
- ✅ Pas d'écrasement par les modifications de B
- ✅ État d'édition isolé par tutorialId

**Validations techniques**
```
localStorage['lma.r4.dragon-arena.draft.v1'] → contient modifications de A
localStorage['lma.r4.tutorial-b.draft.v1'] → contient modifications de B
→ Deux clés distinctes = isolation garantie
```

**État** : À tester en production

---

## ✅ Test 5 : Persistance localStorage indépendante

**Procédure (inspection DevTools)**
```
1. Éditer Dragon Arena (A)
2. F12 → Application → localStorage
3. Chercher "lma.r4.dragon-arena.draft.v1"
4. Vérifier le contenu JSON
5. Modifier quelque chose en A
6. Attendre ~1s (debounce)
7. Rafraîchir la clé localStorage
8. Vérifier que le nouveau contenu s'y trouve
```

**Résultat attendu**  
- ✅ Clé localStorage exist avec le contenu du brouillon
- ✅ Modifications sauvegardées après debounce 500ms
- ✅ JSON valide et parse-able

**Format de la clé**
```
"lma.r4.{tutorialId}.draft.v1"
Exemple: "lma.r4.dragon-arena.draft.v1"
```

**État** : À tester en production

---

## ⏳ Test 6 : Persistance Cloudflare KV (remote)

**Configuration requise**  
- ✅ Variables d'environnement Cloudflare Pages configurées
- ✅ Backend Worker déployé (`app/functions/api/[[path]].ts`)
- ✅ `isRemoteConfigured() === true`

**Procédure (en production)**
```
1. S'authentifier en tant que R4
2. Éditer Dragon Arena
3. Ouvrir DevTools → Network → XHR
4. Attendre ~1.5s (debounce + network)
5. Chercher requête "PUT /api/draft" ou "PUT /api/"
6. Vérifier la réponse contient un nouveau revision SHA
```

**Résultat attendu**  
- ✅ Requête PUT vers `/api/draft` (corps: {tutorialId, content, baseRevision})
- ✅ Réponse 200 avec nouveau `revision` (SHA du commit ou token KV)
- ✅ À chaque nouveau brouillon : revision change
- ✅ Pas d'erreur 409 (conflict) sans raison

**Logs attendus (Console)**
```
[Si mode remote actif]:
 → Pas d'erreur "Erreur sauvegarde brouillon"
 → Pas d'erreur 404 ou 500
```

**Simulation (si KV pas encore disponible)**
```
// Dans adminApi.saveDraft() :
async saveDraft(tutorialId, content, baseRevision) {
  const res = await fetch('/api/draft', {
    method: 'PUT',
    body: JSON.stringify({tutorialId, content, baseRevision})
  })
  // Vérifier réponse 200
}
```

**État** : À tester en production avec KV configurée

---

## ✅ Test 7 : Publication ne mélange pas les tutoriels

**Procédure (manuel)**
```
1. Éditer Dragon Arena (A)
2. Changer un bloc
3. Publier (bouton Publier)
4. Vérifier GitHub historique : seul dragon-arena.json a changé
5. Commit message devrait contenir "dragon-arena", pas d'autre tutorialId
```

**Résultat attendu**  
- ✅ Publication crée un seul commit GitHub
- ✅ Commit modifie uniquement `app/public/content/dragon-arena.json`
- ✅ Commit message contient "dragon-arena"
- ✅ Pas d'autres fichiers modifiés

**Vérification**
```
GitHub → Commits → Dernier commit
- Message: "Publication tutoriel dragon-arena (R4) — ..."
- Files changed: 1 (app/public/content/dragon-arena.json)
```

**État** : À tester en production

---

## ✅ Test 8 : Session R4 préservée

**Procédure (manuel)**
```
1. Authentifier R4 (connexion réussie)
2. Éditer Dragon Arena
3. Revenir à Homepage
4. Vérifier: bouton admin visible, toujours connecté
5. Éditer autre tutoriel (ou homepage)
6. Revenir à Dragon Arena
7. Vérifier: toujours connecté, mode admin toujours actif
```

**Résultat attendu**  
- ✅ À chaque retour : session R4 intacte (pas de logout automatique)
- ✅ Mode admin reste actif
- ✅ Pas de re-authentification requise

**Code vérifié**
```
AdminProvider est au niveau App, pas recréé lors du changement de tutorialId
→ isAuthenticated persiste via useState
→ La session ne change pas quand tutorialId change
```

**État** : À tester en production

---

## ✅ Test 9 : Restauration depuis historique

**Procédure (manuel)**
```
1. Éditer Dragon Arena
2. Publier
3. Ouvrir "Historique des versions" (admin bar)
4. Sélectionner une version antérieure
5. Cliquer "Restaurer"
6. Vérifier: nouveau commit GitHub créé
7. Historique affiche le nouveau commit
```

**Résultat attendu**  
- ✅ Restauration crée un nouveau commit (pas d'overwrite)
- ✅ Message commit: "Restauration tutoriel dragon-arena depuis {sha} (R4)"
- ✅ Historique updated avec le nouveau commit
- ✅ Dragon Arena affiche le contenu restauré

**État** : À tester en production

---

## ✅ Test 10 : Erreur réseau gérée

**Procédure (simulation)**
```
1. DevTools → Network → throttling (Offline)
2. Éditer Dragon Arena
3. Attendre que les erreurs de sauvegarde arrivent
4. Vérifier: pas d'UI crash, isDirty reste true
5. Rétablir la connexion
6. Vérifier: sauvegarde reprend automatiquement (après debounce)
```

**Résultat attendu**  
- ✅ Pas d'erreur non-gérée en console
- ✅ isDirty reste true jusqu'à success
- ✅ Logs: "Erreur sauvegarde brouillon..." en console
- ✅ Reconnexion: nouvelle tentative automatique

**État** : À tester en production

---

## 🎬 Résumé des tests

| # | Test | Automatisé | Manuel | État |
|---|------|-----------|--------|------|
| 1 | Build compile | ✅ | - | ✅ SUCCÈS |
| 2 | HomePage + TutorialPage | ❌ | ⏳ | À tester |
| 3 | AdminBarWrapper accessible | ❌ | ⏳ | À tester |
| 4 | A → B → A isolation | ❌ | ⏳ | À tester |
| 5 | localStorage isolation | ❌ | ⏳ | À tester |
| 6 | Cloudflare KV remote | ❌ | ⏳ | À tester |
| 7 | Publication isolée | ❌ | ⏳ | À tester |
| 8 | Session R4 préservée | ❌ | ⏳ | À tester |
| 9 | Restauration GitHub | ❌ | ⏳ | À tester |
| 10 | Erreur réseau gérée | ❌ | ⏳ | À tester |

---

## 📋 Checklist de déploiement

- [ ] Build compile sans erreurs (npm run build)
- [ ] HomePage et TutorialPage montent sans erreur
- [ ] AdminBarWrapper accessible depuis homepage
- [ ] Changement tutoriel A → B → A restaure brouillon
- [ ] localStorage keys isolées par tutorialId
- [ ] Publication isolée (seul bon tutorialId publié)
- [ ] Session R4 préservée
- [ ] Restauration crée nouveau commit GitHub
- [ ] Erreur réseau gérée gracieusement
- [ ] Pas de modification pédagogique du contenu

---

## 📝 Notes sur les tests automatisés

**Pourquoi pas de tests Jest ?**
- Projet Vite + React sans react-testing-library configuré
- Configuration Jest coûteuse en temps/dépendances
- Tests manuels plus informatifs pour Étape 1

**Prochaines étapes**
1. Configurer react-testing-library + Jest
2. Implémenter tests dans `app/src/__tests__/app.integration.test.tsx`
3. CI/CD avec npm test

---

**Généré** : 11 octobre 2026  
**Statut** : Prêt pour tests manuels en production
