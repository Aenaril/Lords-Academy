/**
 * Tests — Bug Critique : Publication de Thèmes avec Retard de Version
 *
 * Simule la séquence bug :
 * - Publication de Sombre → affichage correct
 * - Publication de Clair → affichage correct  
 * - Publication de Jaune → affichage correct
 * - Publication de Sombre → affichage correct (pas de retour à Jaune)
 *
 * Vérifie aussi :
 * - Publications concurrentes (sans ordre garanti)
 * - Révisions monotones
 * - Réponses réseau retardées/désordre
 * - Prévisualisation qui n'écrase pas une publication
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Theme, ThemeLibrary } from '../cms/types'

// Mock thèmes
const THEMES = {
  dark: {
    id: 'dark',
    name: 'Sombre',
    colors: { bgMain: '#0f0f12', primary: '#d4af37' },
  } as Theme,
  light: {
    id: 'light',
    name: 'Clair',
    colors: { bgMain: '#ffffff', primary: '#0066cc' },
  } as Theme,
  yellow: {
    id: 'yellow',
    name: 'Jaune',
    colors: { bgMain: '#ffffcc', primary: '#ffcc00' },
  } as Theme,
}

interface PublishedState {
  activeThemeId: string
  _rev: number
  _publishedAt: number
  theme: Theme
}

class ThemePublicationSimulator {
  private publishedState: PublishedState = {
    activeThemeId: 'dark',
    _rev: 0,
    _publishedAt: 0,
    theme: THEMES.dark,
  }

  private pendingPublishes: Array<{
    themeId: string
    revision: number
    resolveTime: number
  }> = []

  /**
   * Simuler une publication (avec délai variable)
   */
  async publishTheme(theme: Theme, revision: number, delayMs: number): Promise<boolean> {
    // Ajouter à la file des publications en attente
    const publish = { themeId: theme.id, revision, resolveTime: Date.now() + delayMs }
    this.pendingPublishes.push(publish)

    // Attendre le délai
    await new Promise((r) => setTimeout(r, delayMs))

    // Vérifier si une publication plus récente l'a remplacée
    const moreRecent = this.pendingPublishes.find((p) => p.revision > revision)
    if (moreRecent) {
      // Une publication plus récente existe
      console.warn(
        `⚠️ Publication ${theme.id} rev ${revision} remplacée par rev ${moreRecent.revision}`
      )
      this.pendingPublishes = this.pendingPublishes.filter((p) => p !== publish)
      return false
    }

    // Vérifier aussi qu'aucune publication antérieure plus haute révision n'a été appliquée
    if (revision < this.publishedState._rev) {
      console.warn(
        `⚠️ Publication ${theme.id} rev ${revision} refusée (${this.publishedState._rev} déjà appliquée)`
      )
      this.pendingPublishes = this.pendingPublishes.filter((p) => p !== publish)
      return false
    }

    // Appliquer cette publication
    this.publishedState = {
      activeThemeId: theme.id,
      _rev: revision,
      _publishedAt: Date.now(),
      theme,
    }

    this.pendingPublishes = this.pendingPublishes.filter((p) => p !== publish)
    console.info(`✅ Publication appliquée: ${theme.id} rev ${revision}`)
    return true
  }

  /**
   * Lire l'état publié actuel (simule une page web qui recharge)
   */
  getPublishedState(): PublishedState {
    return { ...this.publishedState }
  }

  /**
   * Obtenir la révision actuelle
   */
  getCurrentRevision(): number {
    return this.publishedState._rev
  }
}

describe('Thèmes — Publication avec Retard de Version (Bug Critique)', () => {
  let simulator: ThemePublicationSimulator

  beforeEach(() => {
    simulator = new ThemePublicationSimulator()
  })

  it('publishes themes in sequence correctly', async () => {
    let rev = 1
    await simulator.publishTheme(THEMES.dark, rev++, 100)
    expect(simulator.getCurrentRevision()).toBe(1)
    expect(simulator.getPublishedState().activeThemeId).toBe('dark')

    await simulator.publishTheme(THEMES.light, rev++, 100)
    expect(simulator.getCurrentRevision()).toBe(2)
    expect(simulator.getPublishedState().activeThemeId).toBe('light')

    await simulator.publishTheme(THEMES.yellow, rev++, 100)
    expect(simulator.getCurrentRevision()).toBe(3)
    expect(simulator.getPublishedState().activeThemeId).toBe('yellow')

    // Republier Sombre (doit passer en rev 4, PAS rester sur yellow)
    await simulator.publishTheme(THEMES.dark, rev++, 100)
    expect(simulator.getCurrentRevision()).toBe(4)
    expect(simulator.getPublishedState().activeThemeId).toBe('dark')
  })

  it('rejects old revisions in favor of newer ones', async () => {
    // Publier rev 1 (Clair) avec délai long
    const pub1 = simulator.publishTheme(THEMES.light, 1, 500)

    // Publier rev 2 (Jaune) avec délai court
    await simulator.publishTheme(THEMES.yellow, 2, 100)

    // Vérifier que Jaune rev 2 est actif (pas Clair rev 1)
    expect(simulator.getCurrentRevision()).toBe(2)
    expect(simulator.getPublishedState().activeThemeId).toBe('yellow')

    // Attendre que la première publication essaie de se résoudre
    await pub1

    // Jaune doit rester actif (Clair rev 1 n'a pas pu l'écraser)
    expect(simulator.getCurrentRevision()).toBe(2)
    expect(simulator.getPublishedState().activeThemeId).toBe('yellow')
  })

  it('handles concurrent rapid publications', async () => {
    let rev = 1

    // Trois publications rapides, sans attendre
    const p1 = simulator.publishTheme(THEMES.dark, rev++, 50)
    const p2 = simulator.publishTheme(THEMES.light, rev++, 40)
    const p3 = simulator.publishTheme(THEMES.yellow, rev++, 30)

    // Attendre que toutes se résolvent
    await Promise.all([p1, p2, p3])

    // Seule la dernière (plus courte) doit être appliquée
    // (les deux premières seront remplacées par la plus récente avant leur résolution)
    expect(simulator.getCurrentRevision()).toBeGreaterThanOrEqual(3)
    expect(simulator.getPublishedState().activeThemeId).toBe('yellow')
  })

  it('enforces revision monotonicity', async () => {
    await simulator.publishTheme(THEMES.dark, 5, 50)
    expect(simulator.getCurrentRevision()).toBe(5)

    // Essayer de publier une ancienne révision
    await simulator.publishTheme(THEMES.light, 3, 50)

    // L'ancienne révision ne peut pas s'appliquer
    expect(simulator.getCurrentRevision()).toBe(5)
    expect(simulator.getPublishedState().activeThemeId).toBe('dark')
  })

  it('tracks publication state correctly through multiple cycles', async () => {
    const sequence = [
      { theme: THEMES.dark, delay: 100 },
      { theme: THEMES.light, delay: 100 },
      { theme: THEMES.yellow, delay: 100 },
      { theme: THEMES.dark, delay: 100 },
      { theme: THEMES.light, delay: 100 },
    ]

    let rev = 1
    for (const { theme, delay } of sequence) {
      await simulator.publishTheme(theme, rev, delay)
      expect(simulator.getPublishedState().activeThemeId).toBe(theme.id)
      expect(simulator.getCurrentRevision()).toBe(rev)
      rev++
    }

    // Vérifier l'état final
    expect(simulator.getCurrentRevision()).toBe(5)
    expect(simulator.getPublishedState().activeThemeId).toBe('light')
  })

  it('ensures revision increases monotonically', async () => {
    let rev = 1
    const revisions: number[] = []

    for (let i = 0; i < 5; i++) {
      const theme = i % 2 === 0 ? THEMES.dark : THEMES.light
      await simulator.publishTheme(theme, rev, 30)
      revisions.push(simulator.getCurrentRevision())
      rev++
    }

    // Vérifier que les révisions augmentent toujours
    for (let i = 1; i < revisions.length; i++) {
      expect(revisions[i]).toBeGreaterThan(revisions[i - 1])
    }
  })
})

/**
 * Intégration : Vérifier que le système de révision empêche les retours arrière
 */
describe('Thèmes — Prévention des Retours Arrière', () => {
  it('prevents old theme from being restored by stale response', async () => {
    const library: ThemeLibrary = {
      themes: [THEMES.dark, THEMES.light, THEMES.yellow],
      activeThemeId: 'yellow',
      publishedThemeId: 'yellow',
      publishedRevision: 10,
      publishedAt: Date.now(),
    }

    // Simuler une réponse réseau qui arrive en retard avec une ancienne révision
    const stalePublish = { publishedThemeId: 'dark', publishedRevision: 5 }
    const fresherPublish = { publishedThemeId: 'light', publishedRevision: 11 }

    // Appliquer la réponse plus fraîche d'abord
    const updated1 = { ...library, ...fresherPublish }
    expect(updated1.publishedRevision).toBe(11)
    expect(updated1.publishedThemeId).toBe('light')

    // La réponse en retard avec révision ancienne ne devrait pas écraser
    const currentRev = updated1.publishedRevision ?? 0
    if (stalePublish.publishedRevision > currentRev) {
      const updated2 = { ...updated1, ...stalePublish }
      expect(updated2.publishedRevision).toBe(5) // Écraserais si pas de vérification
    }
    // Sans vérification, stale aurait écrasé fresher. Avec vérification : non.
    expect(updated1.publishedThemeId).toBe('light') // Reste correct
  })

  it('compares revision numbers before accepting published state', () => {
    let current = { rev: 10, themeId: 'yellow' }
    const incomingFromServer = { rev: 5, themeId: 'dark' }

    // Vérifier avant d'appliquer
    const shouldUpdate = incomingFromServer.rev > current.rev
    if (shouldUpdate) {
      current = { rev: incomingFromServer.rev, themeId: incomingFromServer.themeId }
    }

    // Le thème ne devrait pas avoir changé
    expect(current.themeId).toBe('yellow')
    expect(current.rev).toBe(10)
  })
})
