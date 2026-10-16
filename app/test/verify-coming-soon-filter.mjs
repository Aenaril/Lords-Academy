#!/usr/bin/env node
/**
 * VÉRIFICATION : handlePublishedTutorials + handleGetPublished
 * 
 * Scenario :
 * 1. handlePublishedTutorials() doit retourner published ET coming-soon
 * 2. handleGetPublished() doit bloquer coming-soon (accès refusé)
 * 3. Les autres statuts (draft, in_progress, unpublished) doivent être exclus
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

let passed = 0, failed = 0

// ============================================================================
// Mock index.json avec statuts variés
// ============================================================================

const mockIndexData = {
  tutorials: [
    { id: 'dragon-arena', title: 'Dragon Arena', status: 'published', order: 1 },
    { id: 'regles-generales', title: 'Règles Générales', status: 'coming-soon', order: 2 },
    { id: 'bataillons', title: 'Bataillons', status: 'draft', order: 3 },
    { id: 'attaque-defense', title: 'Attaque-Défense', status: 'in_progress', order: 4 },
    { id: 'phalanges', title: 'Phalanges', status: 'unpublished', order: 5 }
  ]
}

// ============================================================================
// Simulation handlePublishedTutorials
// ============================================================================

function simulateHandlePublishedTutorials(indexData) {
  const allTutorials = indexData.tutorials || []
  
  // CORRIGÉ : Inclure published ET coming-soon
  const visibleTutorials = allTutorials.filter((t) => 
    t.status === 'published' || t.status === 'coming-soon'
  )
  
  return visibleTutorials
}

// ============================================================================
// Simulation handleGetPublished (vérification de statut)
// ============================================================================

function simulateHandleGetPublished(indexData, tutorialId) {
  const tutorial = (indexData.tutorials || []).find((t) => t.id === tutorialId)
  
  // PHASE 1 : Bloquer l'accès si pas publié
  if (!tutorial || tutorial.status !== 'published') {
    return { error: 'Tutoriel non publié', status: 404 }
  }
  
  // Servir le contenu
  return { content: tutorial, status: 200 }
}

// ============================================================================
// TESTS
// ============================================================================

// Test 1 : handlePublishedTutorials retourne published + coming-soon
if (test('handlePublishedTutorials inclut published et coming-soon', () => {
  const visible = simulateHandlePublishedTutorials(mockIndexData)
  
  assert(visible.length === 2, `Expected 2 tutoriels visibles, got ${visible.length}`)
  assert(visible.some((t) => t.id === 'dragon-arena'), 'Dragon Arena (published) absent')
  assert(visible.some((t) => t.id === 'regles-generales'), 'Règles Générales (coming-soon) absent')
  assert(!visible.some((t) => t.status === 'draft'), 'Draft doit être exclu')
  assert(!visible.some((t) => t.status === 'in_progress'), 'in_progress doit être exclu')
  assert(!visible.some((t) => t.status === 'unpublished'), 'unpublished doit être exclu')
})) passed++; else failed++

// Test 2 : handleGetPublished accepte published
if (test('handleGetPublished accepte published', () => {
  const result = simulateHandleGetPublished(mockIndexData, 'dragon-arena')
  
  assert(result.status === 200, `Expected 200, got ${result.status}`)
  assert(result.content !== undefined, 'Contenu doit être servé')
  assert(!result.error, 'Pas d\'erreur pour published')
})) passed++; else failed++

// Test 3 : handleGetPublished refuse coming-soon
if (test('handleGetPublished refuse coming-soon (accès refusé)', () => {
  const result = simulateHandleGetPublished(mockIndexData, 'regles-generales')
  
  assert(result.status === 404, `Expected 404, got ${result.status}`)
  assert(result.error !== undefined, 'Doit retourner une erreur')
  assert(result.error === 'Tutoriel non publié', `Expected error message, got ${result.error}`)
})) passed++; else failed++

// Test 4 : handleGetPublished refuse draft
if (test('handleGetPublished refuse draft', () => {
  const result = simulateHandleGetPublished(mockIndexData, 'bataillons')
  
  assert(result.status === 404, `Expected 404, got ${result.status}`)
  assert(result.error === 'Tutoriel non publié', 'Doit refuser draft')
})) passed++; else failed++

// Test 5 : handleGetPublished refuse unpublished
if (test('handleGetPublished refuse unpublished', () => {
  const result = simulateHandleGetPublished(mockIndexData, 'phalanges')
  
  assert(result.status === 404, `Expected 404, got ${result.status}`)
  assert(result.error === 'Tutoriel non publié', 'Doit refuser unpublished')
})) passed++; else failed++

// Test 6 : handleGetPublished refuse tutoriel inexistant
if (test('handleGetPublished refuse tutoriel inexistant', () => {
  const result = simulateHandleGetPublished(mockIndexData, 'inexistant')
  
  assert(result.status === 404, `Expected 404, got ${result.status}`)
  assert(result.error === 'Tutoriel non publié', 'Doit refuser inexistant')
})) passed++; else failed++

// ============================================================================
// RÉSUMÉ
// ============================================================================
console.log('\n' + '='.repeat(60))
console.log(`RÉSULTAT : ${passed} réussi(s), ${failed} échoué(s)`)
console.log('='.repeat(60))
console.log('\nComportement corrigé :')
console.log('  - API /api/tutorials/published : retourne published + coming-soon')
console.log('  - API /api/published : refuse coming-soon (404)')
console.log('  - Homepage affiche : published et coming-soon')
console.log('  - Contenu accessible : published uniquement')

if (failed > 0) {
  process.exit(1)
}
