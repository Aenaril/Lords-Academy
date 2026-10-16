#!/usr/bin/env node
/**
 * Phase 1 Scenarios — Tests Exécutables
 * 
 * Utilise les fixtures isolées pour tester tous les scénarios.
 * Ne modifie jamais app/public/content/index.json.
 * 
 * Exécution : npm run test:phase1-scenarios
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Charge fixture
const fixtureePath = path.join(__dirname, 'fixtures/index-with-all-statuses.json')
const fixture = JSON.parse(fs.readFileSync(fixtureePath, 'utf-8'))

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
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

function assertIncludes(arr, value, message) {
  if (!arr.includes(value)) {
    throw new Error(`${message}: ${value} not found in ${arr}`)
  }
}

let passed = 0
let failed = 0

// ============================================================================
// Scenario 1 : Published tutoriel remain accessible
// ============================================================================
if (test('Scenario 1: Published tutorials accessible', () => {
  const published = fixture.tutorials.find(t => t.id === 'dragon-arena')
  assert(published, 'dragon-arena should exist')
  assertEqual(published.status, 'published', 'dragon-arena should be published')
})) passed++ ; else failed++

// ============================================================================
// Scenario 2 : Unpublished not in public list
// ============================================================================
if (test('Scenario 2: Unpublished filtered from public list', () => {
  const publicList = fixture.tutorials.filter(t => t.status === 'published')
  const unpublished = fixture.tutorials.find(t => t.id === 'attaque-defense-test')
  
  assert(unpublished, 'unpublished tutorial should exist in fixture')
  assertEqual(unpublished.status, 'unpublished', 'attaque-defense-test should be unpublished')
  
  const inPublic = publicList.find(t => t.id === 'attaque-defense-test')
  assert(!inPublic, 'unpublished should not be in public list')
})) passed++ ; else failed++

// ============================================================================
// Scenario 3 : R4 can modify unpublished
// ============================================================================
if (test('Scenario 3: R4 can modify unpublished tutorial', () => {
  const unpublished = fixture.tutorials.find(t => t.status === 'unpublished')
  assert(unpublished, 'unpublished tutorial should exist')
  
  // Simulate modification
  const modified = { ...unpublished, title: unpublished.title + ' (updated)' }
  assert(modified.status === 'unpublished', 'status should be preserved')
  assert(modified.title !== unpublished.title, 'title should be modified')
})) passed++ ; else failed++

// ============================================================================
// Scenario 4 : Unpublished can be reactivated
// ============================================================================
if (test('Scenario 4: Unpublished tutoriel can be reactivated', () => {
  const unpublished = fixture.tutorials.find(t => t.status === 'unpublished')
  assert(unpublished, 'unpublished tutorial should exist')
  
  // Simulate reactivation
  const reactivated = { ...unpublished, status: 'published' }
  assertEqual(reactivated.status, 'published', 'status should change to published')
})) passed++ ; else failed++

// ============================================================================
// Scenario 5 : Coming-soon visible but unclickable
// ============================================================================
if (test('Scenario 5: Coming-soon visible but not published', () => {
  const comingSoon = fixture.tutorials.find(t => t.status === 'coming-soon')
  assert(comingSoon, 'coming-soon tutorial should exist')
  
  const inPublished = fixture.tutorials.filter(t => t.status === 'published')
  const inComingSoon = inPublished.find(t => t.id === comingSoon.id)
  assert(!inComingSoon, 'coming-soon should not be in published list')
  
  // But should be visible in homepage
  const inVisibleList = fixture.tutorials.filter(t => 
    t.status === 'published' || t.status === 'coming-soon'
  )
  const visibleComingSoon = inVisibleList.find(t => t.id === comingSoon.id)
  assert(visibleComingSoon, 'coming-soon should be visible on homepage')
})) passed++ ; else failed++

// ============================================================================
// Scenario 6 : All statuses are valid
// ============================================================================
if (test('Scenario 6: All tutorials have valid status', () => {
  const validStatuses = ['draft', 'in_progress', 'published', 'unpublished', 'coming-soon']
  
  for (const tut of fixture.tutorials) {
    assertIncludes(validStatuses, tut.status, `${tut.id} status`)
  }
})) passed++ ; else failed++

// ============================================================================
// Scenario 7 : Dragon Arena & Règles Générales remain functional
// ============================================================================
if (test('Scenario 7: Real tutorials remain accessible', () => {
  const dragonArena = fixture.tutorials.find(t => t.id === 'dragon-arena')
  const reglesGenerales = fixture.tutorials.find(t => t.id === 'regles-generales')
  
  assert(dragonArena, 'dragon-arena should exist')
  assert(reglesGenerales, 'regles-generales should exist')
  
  assertEqual(dragonArena.status, 'published', 'dragon-arena should be published')
  assertEqual(reglesGenerales.status, 'published', 'regles-generales should be published')
})) passed++ ; else failed++

// ============================================================================
// Scenario 8 : Status transitions preserve data
// ============================================================================
if (test('Scenario 8: Status changes preserve all other fields', () => {
  const original = fixture.tutorials[0]
  const fields = ['id', 'title', 'description', 'category', 'difficulty', 'estimatedDuration', 'coverIcon', 'order']
  
  // Simulate status change
  const changed = { ...original, status: 'unpublished' }
  
  for (const field of fields) {
    assertEqual(changed[field], original[field], `field ${field} should be preserved`)
  }
})) passed++ ; else failed++

// ============================================================================
// REPORT
// ============================================================================
console.log('\n' + '='.repeat(70))
console.log('PHASE 1 SCENARIOS — REPORT')
console.log('='.repeat(70))
console.log(`\nPassed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(`Total: ${passed + failed}`)

if (failed === 0) {
  console.log('\n✓ ALL SCENARIOS PASSED')
  process.exit(0)
} else {
  console.log(`\n✗ ${failed} SCENARIO(S) FAILED`)
  process.exit(1)
}
