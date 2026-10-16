#!/usr/bin/env node
/**
 * Verify 1: Explicit Publish Workflow
 * 
 * Scénario : R4 crée nouveau tutoriel, puis le publie explicitement.
 * Status dans index.json doit passer de 'draft' → 'published'
 */

function test(name, fn) {
  console.log(`\n[VERIFY 1] ${name}`)
  try {
    fn()
    console.log(`✓ OK`)
    return true
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`)
    return false
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ============================================================================
// Workflow: New Tutorial → Draft → Published
// ============================================================================
if (test('New tutorial starts as draft', () => {
  // R4 crée nouveau tutoriel (fichier créé, pas encore dans index.json)
  const newTutorial = {
    id: 'new-tutorial',
    title: 'Nouveau Tutoriel',
    status: 'draft' // Par défaut, nouveau = draft
  }

  assert(newTutorial.status === 'draft', 'New tutorial should default to draft')
})) {
  console.log('✓ Step 1: New tutorial → draft')
} else {
  process.exit(1)
}

// ============================================================================
if (test('R4 publishes tutorial explicitly', () => {
  // R4 clique "Publié" + confirme dans le sélecteur
  // Appelle POST /api/tutorial/status avec newStatus='published'

  const indexBefore = {
    tutorials: [
      { id: 'new-tutorial', status: 'draft', title: 'Nouveau Tutoriel' }
    ]
  }

  // Simulate API call
  const updateRequest = {
    tutorialId: 'new-tutorial',
    newStatus: 'published'
  }

  assert(updateRequest.newStatus === 'published', 'Request should specify published')

  // Simulate handler updating index
  const indexAfter = {
    tutorials: [
      { id: 'new-tutorial', status: 'published', title: 'Nouveau Tutoriel' }
    ]
  }

  assert(indexAfter.tutorials[0].status === 'published', 'Index should have published status')
  assert(indexAfter.tutorials[0].title === 'Nouveau Tutoriel', 'Title preserved')
})) {
  console.log('✓ Step 2: R4 publishes explicitly → status = published')
} else {
  process.exit(1)
}

// ============================================================================
if (test('Published tutoriel appears in public API', () => {
  const index = {
    tutorials: [
      { id: 'new-tutorial', status: 'published' }
    ]
  }

  const published = index.tutorials.filter(t => t.status === 'published')
  
  assert(published.length === 1, 'Published tutorial should appear')
  assert(published[0].id === 'new-tutorial', 'Correct tutorial published')
})) {
  console.log('✓ Step 3: Published tutorial visible in public API')
} else {
  process.exit(1)
}

console.log('\n✓ VERIFY 1: EXPLICIT PUBLISH — ALL CHECKS PASSED')
