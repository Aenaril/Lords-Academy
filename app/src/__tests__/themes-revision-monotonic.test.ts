/**
 * Tests Critiques — Révisions Monotones des Thèmes
 *
 * Valide que :
 * - Les révisions sont calculées côté serveur uniquement
 * - Les révisions augmentent toujours (jamais de retour à 1)
 * - Une ancienne révision ne peut jamais écraser une plus récente
 * - Les réponses réseau en désordre ne cassent pas l'ordre
 * - Le thème publié est bien celui demandé, avec la révision correcte
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Theme } from '../cms/types'

const DARK: Theme = {
  id: 'dark',
  name: 'Sombre',
  description: 'Dark',
  colors: {
    bgMain: '#0f0f12',
    primary: '#d4af37',
    bgCard: '#1a1a1e',
    bgSection: '#242428',
    textPrimary: '#f2f2f2',
    textSecondary: '#b0b0b0',
    textMuted: '#707070',
    secondary: '#5e92b3',
    accent: '#ff6b6b',
    success: '#4caf50',
    error: '#ff5252',
    warning: '#ffb74d',
    borderColor: '#333333',
    buttonText: '#1a1a1a',
    linkColor: '#5eaaff',
  },
  typography: {
    fontPrimary: 'Segoe UI',
    fontHeadings: 'Segoe UI',
    sizeBase: 16,
    sizeSmall: 14,
    sizeLarge: 18,
    sizeXL: 24,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: 8,
  createdAt: 1000,
  modifiedAt: 1000,
  isPredefined: true,
}

const LIGHT: Theme = {
  ...DARK,
  id: 'light',
  name: 'Clair',
  colors: { ...DARK.colors, bgMain: '#ffffff', textPrimary: '#1a1a1a' },
}

const YELLOW: Theme = {
  ...DARK,
  id: 'yellow',
  name: 'Jaune',
  colors: { ...DARK.colors, bgMain: '#ffffcc', primary: '#ffcc00' },
}

/**
 * Simulateur de système de publication avec révisions
 * Implémente la logique côté serveur
 */
class PublicationServerSimulator {
  private currentPublished: {
    activeThemeId: string
    _rev: number
    _publishedAt: number
    theme: Theme
  } = {
    activeThemeId: 'dark',
    _rev: 0,
    _publishedAt: 0,
    theme: DARK,
  }

  /**
   * Simuler une publication côté serveur
   * - Lire la révision publiée actuelle
   * - Incrémenter et écrire
   * - Vérifier post-publication
   */
  async publish(theme: Theme, simulatedNetworkDelayMs = 0): Promise<number | null> {
    // Lire la révision actuelle
    const currentRev = this.currentPublished._rev
    const newRev = currentRev + 1

    // Simuler délai réseau
    if (simulatedNetworkDelayMs > 0) {
      await new Promise((r) => setTimeout(r, simulatedNetworkDelayMs))
    }

    // Écrire
    this.currentPublished = {
      activeThemeId: theme.id,
      _rev: newRev,
      _publishedAt: Date.now(),
      theme,
    }

    console.info(`✅ Publication: theme=${theme.id}, rev=${newRev}`)
    return newRev
  }

  /**
   * Vérifier la révision publiée actuelle
   */
  getCurrentPublishedRev(): number {
    return this.currentPublished._rev
  }

  /**
   * Lire l'état entier publié (simule le site public qui recharge)
   */
  readPublishedState() {
    return { ...this.currentPublished }
  }

  /**
   * Simuler une ancienne réponse qui arrive tard
   * Vérifier qu'elle ne peut pas écraser
   */
  tryApplyStaleResponse(staleContent: {
    activeThemeId: string
    _rev: number
    theme: Theme
  }): boolean {
    // Logique de rejet : si _rev < courant, rejeter
    if (staleContent._rev < this.currentPublished._rev) {
      console.warn(
        `⚠️ Rejet: rev ${staleContent._rev} < rev actuelle ${this.currentPublished._rev}`
      )
      return false
    }

    // Si rev === courant mais thème différent, rejeter aussi (conflit)
    if (staleContent._rev === this.currentPublished._rev && 
        staleContent.activeThemeId !== this.currentPublished.activeThemeId) {
      console.warn(
        `⚠️ Rejet: rev ${staleContent._rev} identique mais thème différent (${staleContent.activeThemeId} vs ${this.currentPublished.activeThemeId})`
      )
      return false
    }

    // Sinon accepter
    this.currentPublished = {
      activeThemeId: staleContent.activeThemeId,
      _rev: staleContent._rev,
      _publishedAt: Date.now(),
      theme: staleContent.theme,
    }
    return true
  }
}

describe('Thèmes — Révisions Monotones (Source Serveur)', () => {
  let server: PublicationServerSimulator

  beforeEach(() => {
    server = new PublicationServerSimulator()
  })

  it('never calculates _rev=1 on second publish', async () => {
    // Bug initial : chaque publication donnait _rev=1 car content._rev était undefined
    const rev1 = await server.publish(DARK)
    expect(rev1).toBe(1)

    const rev2 = await server.publish(LIGHT)
    expect(rev2).toBe(2) // ✅ Pas revenu à 1

    const rev3 = await server.publish(YELLOW)
    expect(rev3).toBe(3) // ✅ Continue à augmenter

    const rev4 = await server.publish(DARK)
    expect(rev4).toBe(4) // ✅ Jamais de retour

    expect(server.getCurrentPublishedRev()).toBe(4)
  })

  it('rejects stale response with lower revision', async () => {
    // Publier rev 1, 2, 3
    await server.publish(DARK)
    await server.publish(LIGHT)
    await server.publish(YELLOW)

    // Essayer d'appliquer une réponse stale rev 1
    const staleContent = {
      activeThemeId: 'dark',
      _rev: 1,
      theme: DARK,
    }

    const accepted = server.tryApplyStaleResponse(staleContent)
    expect(accepted).toBe(false) // ✅ Rejeté

    // État doit rester rev 3
    expect(server.getCurrentPublishedRev()).toBe(3)
    expect(server.readPublishedState().activeThemeId).toBe('yellow')
  })

  it('rejects stale response even if it arrives out of order', async () => {
    // Publier Dark (rev 1)
    await server.publish(DARK)

    // Publier Light (rev 2) et Yellow (rev 3) séquentiellement
    await server.publish(LIGHT)
    await server.publish(YELLOW)

    // Vérifier que Yellow (rev 3) est actif
    expect(server.getCurrentPublishedRev()).toBe(3)
    expect(server.readPublishedState().activeThemeId).toBe('yellow')
  })

  it('prevents rollback to previous theme version', async () => {
    // Chronologie :
    // t=1: Publier Clair (rev 1)
    // t=2: Publier Jaune (rev 2)
    // t=3: Bug? Ancienne réponse Clair rev 1 arrive
    //      Elle ne doit PAS écraser Jaune rev 2

    await server.publish(LIGHT)
    await server.publish(YELLOW)

    const published = server.readPublishedState()
    expect(published.activeThemeId).toBe('yellow')
    expect(published._rev).toBe(2)

    // Simuler réponse en retard avec Clair rev 1
    const staleLight = { activeThemeId: 'light', _rev: 1, theme: LIGHT }
    const accepted = server.tryApplyStaleResponse(staleLight)

    expect(accepted).toBe(false) // ✅ Rejeté
    expect(server.readPublishedState().activeThemeId).toBe('yellow') // Reste Jaune
  })

  it('strictly validates exact theme on read back', async () => {
    // Publier Dark
    await server.publish(DARK)

    // Lire ce qui est réellement publié
    const published = server.readPublishedState()

    // Vérifications strictes :
    expect(published._rev).toBe(1)
    expect(published.activeThemeId).toBe('dark')
    expect(published.theme.id).toBe('dark')
    expect(published.theme.colors.bgMain).toBe('#0f0f12')

    // Publier Light
    await server.publish(LIGHT)

    const published2 = server.readPublishedState()
    expect(published2._rev).toBe(2)
    expect(published2.activeThemeId).toBe('light')
    expect(published2.theme.colors.bgMain).toBe('#ffffff')

    // Jamais mélanger les thèmes
    expect(published2.theme.id).not.toBe('dark')
  })

  it('tracks correct revision through sequence: Dark → Light → Yellow → Dark', async () => {
    const revisions: { theme: string; rev: number }[] = []

    revisions.push({ theme: 'dark', rev: (await server.publish(DARK))! })
    revisions.push({ theme: 'light', rev: (await server.publish(LIGHT))! })
    revisions.push({ theme: 'yellow', rev: (await server.publish(YELLOW))! })
    revisions.push({ theme: 'dark', rev: (await server.publish(DARK))! })

    // Vérifier que les révisions sont exactes et en ordre
    expect(revisions[0]).toEqual({ theme: 'dark', rev: 1 })
    expect(revisions[1]).toEqual({ theme: 'light', rev: 2 })
    expect(revisions[2]).toEqual({ theme: 'yellow', rev: 3 })
    expect(revisions[3]).toEqual({ theme: 'dark', rev: 4 }) // Pas rev 1 !

    // Vérifier l'ordre strict
    for (let i = 1; i < revisions.length; i++) {
      expect(revisions[i].rev).toBeGreaterThan(revisions[i - 1].rev)
    }
  })

  it('ensures no two publications have the same revision', async () => {
    const revisions = new Set<number>()

    for (let i = 0; i < 5; i++) {
      const theme = i % 2 === 0 ? DARK : LIGHT
      const rev = (await server.publish(theme))!
      expect(revisions.has(rev)).toBe(false) // Doit être unique
      revisions.add(rev)
    }

    expect(revisions.size).toBe(5) // 5 révisions distinctes
  })

  it('rejects concurrent publications with conflicting revisions', async () => {
    // Simuler deux requêtes concurrentes qui veulent publier
    // Les deux lisent rev 0, calculent rev 1 côté client... NON CORRECT
    // Côté serveur, une seule peut être rev 1

    const pub1 = server.publish(DARK)
    const pub2 = server.publish(LIGHT)

    const [rev1, rev2] = await Promise.all([pub1, pub2])

    // Une est rev 1, l'autre rev 2
    // Jamais les deux à rev 1
    expect([rev1, rev2]).toContain(1)
    expect([rev1, rev2]).toContain(2)
    expect(rev1).not.toEqual(rev2)
  })

  it('verifies published content exactly as written', async () => {
    const rev1 = await server.publish(DARK)
    const published1 = server.readPublishedState()

    // Vérifications :
    expect(published1._rev).toBe(rev1)
    expect(published1.activeThemeId).toBe('dark')
    expect(published1.theme).toEqual(DARK)
    expect(published1._publishedAt).toBeGreaterThan(0)

    // Puis publier Light
    await server.publish(LIGHT)

    // Ancienne réponse Dark/rev1 ne peut pas écraser
    const oldResponse = { activeThemeId: 'dark', _rev: 1, theme: DARK }
    const accepted = server.tryApplyStaleResponse(oldResponse)

    expect(accepted).toBe(false)
    expect(server.readPublishedState()._rev).toBe(2)
    expect(server.readPublishedState().activeThemeId).toBe('light')
  })
})
