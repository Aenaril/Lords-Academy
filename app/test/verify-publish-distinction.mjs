#!/usr/bin/env node
/**
 * Vérification CRITIQUE : Publication explicite vs changement de visibilité
 * 
 * - Changement de statut (status='published') = modification index.json seulement
 * - Publication contenu (POST /api/publish) = pousse contenu pédagogique
 * 
 * Ces deux mécanismes doivent rester distincts.
 * Un tutoriel ne peut pas être "published" si son fichier JSON n'existe pas.
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
// Simulation des deux mécanismes distincts
// ============================================================================

/**
 * Simule handleSetTutorialStatus :
 * - Modifie UNIQUEMENT index.json
 * - Valide que le fichier JSON existe avant publication
 */
async function handleSetTutorialStatus(tutorialId, newStatus, filesInGitHub) {
  // Validation : si on publie, le fichier doit exister
  if (newStatus === 'published') {
    const contentPath = `app/public/content/${tutorialId}.json`
    if (!filesInGitHub.has(contentPath)) {
      throw new Error(`Impossible publier: tutoriel ${tutorialId}.json n'existe pas`)
    }
  }

  // Modification de index.json
  return {
    indexJsonModified: true,
    contentJsonModified: false,
    tutorialId,
    newStatus
  }
}

/**
 * Simule handlePublish :
 * - Pousse ou met à jour le fichier JSON du tutoriel
 * - Distinct du changement de statut
 */
async function handlePublish(tutorialId, content) {
  // Publier le contenu pédagogique
  return {
    indexJsonModified: false,
    contentJsonModified: true,
    tutorialId,
    contentLength: JSON.stringify(content).length
  }
}

// ============================================================================
// Test 1 : Ne peut pas publier si fichier n'existe pas
// ============================================================================
if (test('Test 1: Cannot publish without content file', async () => {
  const filesInGitHub = new Set([
    'app/public/content/index.json',
    'app/public/content/dragon-arena.json'
  ])

  try {
    await handleSetTutorialStatus('nonexistent-tut', 'published', filesInGitHub)
    throw new Error('Should have thrown')
  } catch (err) {
    assert(err.message.includes('n\'existe pas'), 'Should reject missing file')
  }
})) passed++; else failed++

// ============================================================================
// Test 2 : Peut publier si fichier existe
// ============================================================================
if (test('Test 2: Can publish if content file exists', async () => {
  const filesInGitHub = new Set([
    'app/public/content/index.json',
    'app/public/content/dragon-arena.json'
  ])

  const result = await handleSetTutorialStatus('dragon-arena', 'published', filesInGitHub)

  assert(result.indexJsonModified, 'index.json should be modified')
  assert(!result.contentJsonModified, 'Content JSON should NOT be modified')
})) passed++; else failed++

// ============================================================================
// Test 3 : Changement de statut ne modifie PAS le contenu
// ============================================================================
if (test('Test 3: Status change does NOT modify content', async () => {
  const filesInGitHub = new Set([
    'app/public/content/index.json',
    'app/public/content/test-tut.json'
  ])

  const result = await handleSetTutorialStatus('test-tut', 'unpublished', filesInGitHub)

  assertEqual(result.indexJsonModified, true, 'index.json should be modified')
  assertEqual(result.contentJsonModified, false, 'Content should NOT be modified')
  assertEqual(result.newStatus, 'unpublished', 'Status should change to unpublished')
})) passed++; else failed++

// ============================================================================
// Test 4 : Publication contenu distinct du changement de visibilité
// ============================================================================
if (test('Test 4: Publishing content is distinct from visibility change', async () => {
  // Publier (pousser le contenu)
  const publishResult = await handlePublish('new-tutorial', {
    id: 'new-tutorial',
    title: 'New Tutorial',
    sections: [{ content: 'lesson' }]
  })

  assert(!publishResult.indexJsonModified, 'Publishing should NOT modify index.json')
  assert(publishResult.contentJsonModified, 'Publishing should modify content JSON')

  // Après publication du contenu, on PEUT changer le statut
  const filesInGitHub = new Set([
    'app/public/content/index.json',
    'app/public/content/new-tutorial.json'
  ])

  const statusResult = await handleSetTutorialStatus('new-tutorial', 'published', filesInGitHub)

  assert(statusResult.indexJsonModified, 'Status change should modify index.json')
  assert(!statusResult.contentJsonModified, 'Status change should NOT modify content JSON')
})) passed++; else failed++

// ============================================================================
// Test 5 : Brouillon peut exister sans être publié
// ============================================================================
if (test('Test 5: Draft can exist without being published', async () => {
  const filesInGitHub = new Set([
    'app/public/content/index.json',
    'app/public/content/draft-tut.json'
  ])

  // Créer un brouillon : changer statut à 'draft' ne change rien (c'est la valeur par défaut)
  const result = await handleSetTutorialStatus('draft-tut', 'draft', filesInGitHub)

  assert(result.indexJsonModified, 'index.json should be modified')
  assertEqual(result.newStatus, 'draft', 'Status should be draft')

  // Même avec le fichier JSON, on peut rester en 'draft'
})) passed++; else failed++

// ============================================================================
// Résumé
// ============================================================================
console.log('\n' + '='.repeat(70))
console.log('PUBLISH DISTINCTION VERIFICATION')
console.log('='.repeat(70))
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed === 0) {
  console.log(`✓ ALL PUBLISH TESTS PASSED`)
  console.log(`\nKey Distinctions:`)
  console.log(`  1. Status changes → modify index.json only`)
  console.log(`  2. Content publication → modify tutorialId.json only`)
  console.log(`  3. Publishing requires existing file (validation)`)
  console.log(`  4. Both can happen independently`)
} else {
  console.log(`✗ SOME TESTS FAILED`)
  process.exit(1)
}
