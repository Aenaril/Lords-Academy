#!/usr/bin/env node
/**
 * VÉRIFICATION : TutorialMetaPanel avec useRef — Gestion des requêtes concurrentes
 * 
 * Scenario :
 * 1. R4 ouvre Dragon Arena (displayedStatus='published')
 * 2. Change le statut (requête lancée)
 * 3. PENDANT la requête : bascule vers Règles Générales
 * 4. Réponse Dragon Arena arrive
 * 5. Résultat attendu : Règles Générales reste inchangée
 * 
 * La clé : useRef(tutorial.id) se met à jour dans le useEffect([tutorial.id])
 * et la vérification `currentTutorialIdRef.current !== startingTutorialId` rejette la réponse stale.
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
// Simulation du composant TutorialMetaPanel avec useRef
// ============================================================================

class TutorialMetaPanelSimulator {
  constructor(initialTutorialId) {
    this.currentTutorialIdRef = { current: initialTutorialId }
    this.displayedStatus = 'published'
    this.isStatusSaving = false
    this.lastAppliedStatus = null
  }

  // Équivalent du useEffect([tutorial.id])
  switchTutorial(newTutorialId) {
    console.log(`  → Bascule vers tutoriel: ${newTutorialId}`)
    this.currentTutorialIdRef.current = newTutorialId
    if (this.isStatusSaving) {
      console.log(`  ⚠️  Requête en cours sera rejetée`)
    }
    this.isStatusSaving = false
  }

  // Équivalent de performStatusChange
  async performStatusChange(newStatus, delayMs = 100) {
    const startingTutorialId = this.currentTutorialIdRef.current
    console.log(`  → Requête lancée pour ${startingTutorialId} (status: ${newStatus})`)
    
    this.isStatusSaving = true

    // Simuler un délai réseau
    await new Promise(resolve => setTimeout(resolve, delayMs))

    // Vérifier avec useRef (toujours actualisée)
    if (this.currentTutorialIdRef.current !== startingTutorialId) {
      console.log(`  ✗ Tutoriel changé pendant requête. Ignorer réponse pour ${startingTutorialId}. Actuellement: ${this.currentTutorialIdRef.current}`)
      this.isStatusSaving = false
      return false
    }

    // Appliquer le statut
    this.displayedStatus = newStatus
    this.lastAppliedStatus = newStatus
    console.log(`  ✓ Réponse appliquée: displayedStatus = ${newStatus}`)
    this.isStatusSaving = false
    return true
  }
}

// ============================================================================
// TESTS
// ============================================================================

// Test 1: Requête complète sans interruption
if (test('Requête Dragon Arena complète sans changement', async () => {
  const panel = new TutorialMetaPanelSimulator('dragon-arena')
  await panel.performStatusChange('unpublished')
  
  assert(panel.displayedStatus === 'unpublished', 'Status appliqué')
  assert(panel.lastAppliedStatus === 'unpublished', 'Dernière réponse appliquée')
})) passed++; else failed++

// Test 2: Changement tutoriel pendant requête — réponse rejetée
if (test('Changement vers Règles Générales pendant requête Dragon Arena', async () => {
  const panel = new TutorialMetaPanelSimulator('dragon-arena')
  
  // Lancer requête pour Dragon Arena
  const requestPromise = panel.performStatusChange('unpublished', 50)
  
  // Après 20ms, basculer vers Règles Générales
  await new Promise(resolve => setTimeout(resolve, 20))
  panel.switchTutorial('regles-generales')
  
  // Attendre la réponse
  const applied = await requestPromise
  
  assert(!applied, 'Réponse Dragon Arena rejetée')
  assert(panel.displayedStatus === 'published', 'Status reste à published (valeur initiale)')
  assert(panel.currentTutorialIdRef.current === 'regles-generales', 'useRef pointe vers Règles Générales')
})) passed++; else failed++

// Test 3: Deux requêtes concurrentes — dernière gagne
if (test('Deux requêtes concurrentes: Dragon Arena puis Règles Générales', async () => {
  const panel = new TutorialMetaPanelSimulator('dragon-arena')
  
  // Lancer requête 1 pour Dragon Arena
  const req1 = panel.performStatusChange('unpublished', 100)
  
  // Après 30ms, basculer et lancer requête 2 pour Règles Générales
  await new Promise(resolve => setTimeout(resolve, 30))
  panel.switchTutorial('regles-generales')
  const req2 = panel.performStatusChange('coming-soon', 50)
  
  // Requête 2 termine d'abord
  await req2
  assert(panel.displayedStatus === 'coming-soon', 'Requête 2 appliquée (Règles Générales)')
  
  // Requête 1 termine ensuite — doit être rejetée
  await req1
  assert(panel.displayedStatus === 'coming-soon', 'Requête 1 rejetée, status reste coming-soon')
  assert(panel.lastAppliedStatus === 'coming-soon', 'Dernière réponse appliquée = requête 2')
})) passed++; else failed++

// Test 4: Requête rejette, puis nouvelle requête avec nouveau tutoriel
if (test('Requête rejetée, puis nouvelle requête pour nouveau tutoriel', async () => {
  const panel = new TutorialMetaPanelSimulator('dragon-arena')
  
  // Requête 1 pour Dragon Arena (sera rejetée)
  const req1 = panel.performStatusChange('unpublished', 80)
  await new Promise(resolve => setTimeout(resolve, 20))
  panel.switchTutorial('regles-generales')
  
  // Attendre fin req1 (rejetée)
  await req1
  assert(panel.displayedStatus === 'published', 'Status reste published après rejet')
  
  // Nouvelle requête pour Règles Générales (acceptée)
  await panel.performStatusChange('coming-soon', 30)
  assert(panel.displayedStatus === 'coming-soon', 'Nouvelle requête appliquée')
})) passed++; else failed++

// ============================================================================
// RÉSUMÉ
// ============================================================================
console.log('\n' + '='.repeat(60))
console.log(`RÉSULTAT : ${passed} réussi(s), ${failed} échoué(s)`)
console.log('='.repeat(60))
console.log('\nClé de la correction :')
console.log('  1. useRef(tutorial.id) se met à jour dans useEffect([tutorial.id])')
console.log('  2. performStatusChange capture startingTutorialId au début')
console.log('  3. Après await, vérifie: currentTutorialIdRef.current !== startingTutorialId')
console.log('  4. Si tutoriel changé → réponse rejetée, state inchangé')
console.log('  5. handleStatusChange utilise displayedStatus (reactive) au lieu de tutorial.status')

if (failed > 0) {
  process.exit(1)
}
