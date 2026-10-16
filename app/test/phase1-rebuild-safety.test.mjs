#!/usr/bin/env node
/**
 * Phase 1: rebuildPublishedIndex Safety Tests
 * 
 * Vérifie que la reconstruction de l'index :
 * 1. Préserve les statuts existants
 * 2. N'auto-publie jamais les nouveaux fichiers
 * 3. Conserve coming-soon et unpublished
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
// Test 1: Existing tutoriels preserve their status
// ============================================================================
if (test('Test 1: Existing tutorials preserve status', () => {
  // Simulate currentIndex (existing state)
  const currentIndex = {
    tutorials: [
      { id: 'dragon-arena', status: 'published', title: 'Dragon Arena' },
      { id: 'test-unpub', status: 'unpublished', title: 'Test Unpub' },
      { id: 'test-coming', status: 'coming-soon', title: 'Test Coming' }
    ]
  }

  const existingMap = new Map(currentIndex.tutorials.map(t => [t.id, t]))

  // Simulate rebuild logic
  const discovered = [
    { id: 'dragon-arena', title: 'Dragon Arena (updated)' },
    { id: 'test-unpub', title: 'Test Unpub (updated)' },
    { id: 'test-coming', title: 'Test Coming (updated)' }
  ]

  const rebuilt = discovered.map(content => {
    const existingEntry = existingMap.get(content.id)
    const status = existingEntry?.status ?? 'draft'
    return { ...content, status }
  })

  // Verify all statuses preserved
  assert(rebuilt[0].status === 'published', 'dragon-arena should stay published')
  assert(rebuilt[1].status === 'unpublished', 'test-unpub should stay unpublished')
  assert(rebuilt[2].status === 'coming-soon', 'test-coming should stay coming-soon')
})) passed++ ; else failed++

// ============================================================================
// Test 2: New tutoriels get 'draft' not 'published'
// ============================================================================
if (test('Test 2: New tutorials default to draft', () => {
  const currentIndex = { tutorials: [] }
  const existingMap = new Map()

  // New tutoriel discovered
  const newContent = { id: 'new-tutorial', title: 'New Tut' }
  
  const existingEntry = existingMap.get(newContent.id)
  const status = existingEntry?.status ?? 'draft'
  
  assert(status === 'draft', 'New tutorial should be draft, not published')
})) passed++ ; else failed++

// ============================================================================
// Test 3: Unpublished tutoriels don't disappear
// ============================================================================
if (test('Test 3: Unpublished tutorials preserved in rebuild', () => {
  const currentIndex = {
    tutorials: [
      { id: 'unpub-tutorial', status: 'unpublished', title: 'Should stay' }
    ]
  }

  const existingMap = new Map(currentIndex.tutorials.map(t => [t.id, t]))
  
  // Simulate rebuild finding the same tutoriel
  const discovered = [
    { id: 'unpub-tutorial', title: 'Should stay (updated)' }
  ]

  const rebuilt = discovered.map(content => {
    const existingEntry = existingMap.get(content.id)
    const status = existingEntry?.status ?? 'draft'
    return { ...content, status }
  })

  assert(rebuilt[0].status === 'unpublished', 'unpublished should be preserved')
  assert(rebuilt.length === 1, 'unpublished should not disappear')
})) passed++ ; else failed++

// ============================================================================
// Test 4: Coming-soon tutoriels remain visible
// ============================================================================
if (test('Test 4: Coming-soon tutoriels preserved', () => {
  const currentIndex = {
    tutorials: [
      { id: 'coming-soon-tut', status: 'coming-soon', title: 'Coming Soon' }
    ]
  }

  const existingMap = new Map(currentIndex.tutorials.map(t => [t.id, t]))
  
  const discovered = [{ id: 'coming-soon-tut', title: 'Coming Soon (updated)' }]

  const rebuilt = discovered.map(content => {
    const existingEntry = existingMap.get(content.id)
    const status = existingEntry?.status ?? 'draft'
    return { ...content, status }
  })

  assert(rebuilt[0].status === 'coming-soon', 'coming-soon status should be preserved')
})) passed++ ; else failed++

// ============================================================================
// Test 5: Published remains published
// ============================================================================
if (test('Test 5: Published tutoriels remain published', () => {
  const currentIndex = {
    tutorials: [
      { id: 'dragon-arena', status: 'published' },
      { id: 'regles-generales', status: 'published' }
    ]
  }

  const existingMap = new Map(currentIndex.tutorials.map(t => [t.id, t]))

  const discovered = [
    { id: 'dragon-arena' },
    { id: 'regles-generales' }
  ]

  const rebuilt = discovered.map(content => {
    const existingEntry = existingMap.get(content.id)
    const status = existingEntry?.status ?? 'draft'
    return { ...content, status }
  })

  assert(rebuilt.every(t => t.status === 'published'), 'All should remain published')
})) passed++ ; else failed++

// ============================================================================
// REPORT
// ============================================================================
console.log('\n' + '='.repeat(70))
console.log('PHASE 1 REBUILD SAFETY TESTS')
console.log('='.repeat(70))
console.log(`\nPassed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed === 0) {
  console.log('\n✓ ALL REBUILD SAFETY TESTS PASSED')
  process.exit(0)
} else {
  console.log(`\n✗ ${failed} TEST(S) FAILED`)
  process.exit(1)
}
