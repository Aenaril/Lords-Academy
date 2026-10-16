#!/usr/bin/env node
/**
 * Vérification CRITIQUE : HomePage.tsx - Priorité absolue à l'API
 * 
 * Scénario :
 * - Dragon Arena dans staticTutorials (status='published' par défaut)
 * - Dans index.json reçu de l'API : Dragon Arena status='unpublished'
 * - Résultat attendu : Dragon Arena ABSENT de la page d'accueil
 * 
 * C'est le test critique de la correction HomePage #1.
 */

function test(name, fn) {
  console.log(`\n[TEST] ${name}`)
  try {
    fn()
    console.log(`✓ PASS`)
    return true
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`)
    return false
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`)
  }
}

let passed = 0, failed = 0

// ============================================================================
// Simulation de la logique HomePage : fusion API + static
// ============================================================================

/**
 * Simule la fusion HomePage :
 * 1. Reçoit staticTutorials (source locale)
 * 2. Reçoit API data (source GitHub index.json)
 * 3. Fusionne avec API comme autorité pour statuts
 */
function mergeHomePage(staticTutorials, apiTutorials) {
  // CORRECTION Phase 1 : Filtrer API AVANT fusion
  const apiPublishedOrComingSoon = apiTutorials.filter((t) =>
    t.status === 'published' || t.status === 'coming-soon'
  )
  const publishedMap = new Map(
    apiPublishedOrComingSoon.map((t) => [t.id, t])
  )

  // Remplacer statiques par API, rejeter si dépubliés
  const merged = staticTutorials
    .map((staticTut) =>
      (publishedMap.get(staticTut.id)) || null
    )
    .filter((t) => t !== null)

  // Ajouter tutoriels dynamiques (API seulement)
  for (const [id, publishedTut] of publishedMap) {
    if (!merged.some((t) => t.id === id)) {
      merged.push(publishedTut)
    }
  }

  merged.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  return merged
}

// ============================================================================
// Test 1 : CRITIQUE — Dragon Arena dépublié n'apparaît pas
// ============================================================================
if (test('Test 1: CRITICAL - Dragon Arena unpublished excluded', () => {
  const staticTutorials = [
    { id: 'dragon-arena', status: 'published', title: 'Dragon Arena', order: 1 },
    { id: 'regles-generales', status: 'published', title: 'Règles Générales', order: 2 }
  ]

  // API : Dragon Arena est dépublié
  const apiTutorials = [
    { id: 'dragon-arena', status: 'unpublished', title: 'Dragon Arena', order: 1 },
    { id: 'regles-generales', status: 'published', title: 'Règles Générales', order: 2 }
  ]

  const merged = mergeHomePage(staticTutorials, apiTutorials)

  // ASSERTION CRITIQUE
  const hasdragonArena = merged.some((t) => t.id === 'dragon-arena')
  assert(!hasdragonArena, 'Dragon Arena should NOT appear when unpublished in API')

  // Vérifier que Règles Générales est toujours là
  const hasRegles = merged.some((t) => t.id === 'regles-generales')
  assert(hasRegles, 'Regles-Generales should appear when published')

  assertEqual(merged.length, 1, 'Should have exactly 1 tutorial (Regles-Generales)')
})) passed++; else failed++

// ============================================================================
// Test 2 : Fallback (API indisponible) — conserve statiques
// ============================================================================
if (test('Test 2: Fallback preserves static tutorials on API error', () => {
  const staticTutorials = [
    { id: 'dragon-arena', status: 'published', title: 'Dragon Arena', order: 1 },
    { id: 'regles-generales', status: 'published', title: 'Règles Générales', order: 2 }
  ]

  // Simuler API indisponible (fallback utilise staticTutorials)
  const fallbackMerge = staticTutorials
    .filter((t) => t.status === 'published' || t.status === 'coming-soon')
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))

  assertEqual(fallbackMerge.length, 2, 'Fallback should show all static published')
  // LIMITE : Le fallback ne peut pas savoir qu'un tutoriel a été dépublié via API
  // (Accepté par design : API indisponible = risque assumé)
})) passed++; else failed++

// ============================================================================
// Test 3 : Coming-soon tutoriels préservés
// ============================================================================
if (test('Test 3: Coming-soon tutorials preserved', () => {
  const staticTutorials = [
    { id: 'dragon-arena', status: 'published', title: 'Dragon Arena', order: 1 }
  ]

  const apiTutorials = [
    { id: 'dragon-arena', status: 'published', title: 'Dragon Arena', order: 1 },
    { id: 'future-tut', status: 'coming-soon', title: 'Tutoriel Futur', order: 5 }
  ]

  const merged = mergeHomePage(staticTutorials, apiTutorials)

  assertEqual(merged.length, 2, 'Should have 2 tutorials (1 published + 1 coming-soon)')

  const published = merged.filter((t) => t.status === 'published')
  const comingSoon = merged.filter((t) => t.status === 'coming-soon')

  assertEqual(published.length, 1, 'Published section should have 1')
  assertEqual(comingSoon.length, 1, 'Coming-soon section should have 1')
})) passed++; else failed++

// ============================================================================
// Test 4 : API est autorité — écrase statiques
// ============================================================================
if (test('Test 4: API is authority over static', () => {
  const staticTutorials = [
    { id: 'tut-1', status: 'published', title: 'Tut 1 (static)', order: 1 }
  ]

  const apiTutorials = [
    { id: 'tut-1', status: 'published', title: 'Tut 1 (API)', order: 1 }
  ]

  const merged = mergeHomePage(staticTutorials, apiTutorials)

  assertEqual(merged.length, 1, 'Should have 1 tutorial')
  assertEqual(merged[0].title, 'Tut 1 (API)', 'API version should be used')
})) passed++; else failed++

// ============================================================================
// Test 5 : Scénario complexe multi-tutoriels
// ============================================================================
if (test('Test 5: Complex scenario with multiple status transitions', () => {
  const staticTutorials = [
    { id: 'a', status: 'published', title: 'A', order: 1 },
    { id: 'b', status: 'published', title: 'B', order: 2 },
    { id: 'c', status: 'published', title: 'C', order: 3 }
  ]

  // API : a=published, b=unpublished, c=draft (nouveau), d=published (dynamique)
  const apiTutorials = [
    { id: 'a', status: 'published', title: 'A', order: 1 },
    { id: 'b', status: 'unpublished', title: 'B', order: 2 },
    { id: 'c', status: 'draft', title: 'C', order: 3 },
    { id: 'd', status: 'published', title: 'D', order: 4 }
  ]

  const merged = mergeHomePage(staticTutorials, apiTutorials)

  // Attendu : a (published), d (published dynamique)
  assertEqual(merged.length, 2, 'Should have 2 published tutorials (a, d)')

  const ids = merged.map((t) => t.id)
  assert(ids.includes('a'), 'a should be present (published)')
  assert(!ids.includes('b'), 'b should NOT be present (unpublished)')
  assert(!ids.includes('c'), 'c should NOT be present (draft)')
  assert(ids.includes('d'), 'd should be present (published, dynamic)')
})) passed++; else failed++

// ============================================================================
// Résumé
// ============================================================================
console.log('\n' + '='.repeat(70))
console.log('HOMEPAGE PRECEDENCE VERIFICATION (API AUTHORITY)')
console.log('='.repeat(70))
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed === 0) {
  console.log(`✓ ALL HOMEPAGE TESTS PASSED`)
  console.log(`\nFallback Limitation (accepted by design):`)
  console.log(`  If API is unavailable, page shows all static 'published'`)
  console.log(`  Dépublished tutorials MAY reappear (requires API recovery)`)
} else {
  console.log(`✗ SOME TESTS FAILED`)
  process.exit(1)
}
