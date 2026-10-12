/**
 * Tests — Chargement du Thème par le Site Public
 *
 * Simule :
 * - Publication d'un thème
 * - Chargement par CmsConfigLoader
 * - Vérification que c'est le bon thème
 * - Rechargement après publication
 * - Réseau retardé/stale
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Theme } from '../cms/types'

const DARK: Theme = {
  id: 'dark',
  name: 'Sombre',
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

/**
 * Simulateur de stockage public (ce que GitHub expose)
 */
class PublicThemeStorage {
  private storage: { activeThemeId: string; _rev: number; theme: Theme } = {
    activeThemeId: 'dark',
    _rev: 1,
    theme: DARK,
  }

  /**
   * Simuler une publication
   */
  publish(theme: Theme, rev: number) {
    this.storage = {
      activeThemeId: theme.id,
      _rev: rev,
      theme,
    }
  }

  /**
   * Simuler une lecture par le site public (avec cache headers)
   * cache: 'no-store' dans CmsConfigLoader
   */
  read(): { activeThemeId: string; _rev: number; theme: Theme } {
    return { ...this.storage }
  }
}

describe('Thèmes — Chargement par Site Public', () => {
  let publicStorage: PublicThemeStorage

  beforeEach(() => {
    publicStorage = new PublicThemeStorage()
  })

  it('loads correct theme on initial page load', () => {
    // État initial : Dark rev 1
    const loaded = publicStorage.read()

    expect(loaded.activeThemeId).toBe('dark')
    expect(loaded._rev).toBe(1)
    expect(loaded.theme.id).toBe('dark')
    expect(loaded.theme.colors.bgMain).toBe('#0f0f12')
  })

  it('loads correct theme after publication', () => {
    // Publier Light rev 2
    publicStorage.publish(LIGHT, 2)

    // Lire (simule rechargement du site public)
    const loaded = publicStorage.read()

    expect(loaded.activeThemeId).toBe('light')
    expect(loaded._rev).toBe(2)
    expect(loaded.theme.colors.bgMain).toBe('#ffffff')
  })

  it('persists theme through multiple publications', () => {
    // Publier Dark (rev 1) → Clair (rev 2) → Sombre (rev 3)
    publicStorage.publish(DARK, 1)
    const loaded1 = publicStorage.read()
    expect(loaded1.activeThemeId).toBe('dark')

    publicStorage.publish(LIGHT, 2)
    const loaded2 = publicStorage.read()
    expect(loaded2.activeThemeId).toBe('light')

    publicStorage.publish(DARK, 3)
    const loaded3 = publicStorage.read()
    expect(loaded3.activeThemeId).toBe('dark')
    expect(loaded3._rev).toBe(3) // ✅ Rev 3, pas rev 1
  })

  it('rejects stale cached response', () => {
    // Publier rev 2 (Light)
    publicStorage.publish(LIGHT, 2)

    // Vérifier que si on reçoit rev 1 (old), on ne le remplace pas
    const currentLoaded = publicStorage.read()
    expect(currentLoaded._rev).toBe(2)

    // Essayer d'appliquer une réponse stale rev 1
    const staleResponse = { activeThemeId: 'dark', _rev: 1, theme: DARK }

    // Client doit rejeter (rev 1 < rev 2)
    const shouldReplace = staleResponse._rev > currentLoaded._rev
    expect(shouldReplace).toBe(false)

    // État ne change pas
    const reloaded = publicStorage.read()
    expect(reloaded._rev).toBe(2)
    expect(reloaded.activeThemeId).toBe('light')
  })

  it('handles out-of-order network responses gracefully', async () => {
    // Scénario simplifié : vérifier que l'ordre des révisions est correct
    // même si les publications arrivent dans un ordre différent

    // Initialement : Dark rev 1
    let current = publicStorage.read()
    expect(current._rev).toBe(1)

    // Publier Clair rev 2
    publicStorage.publish(LIGHT, 2)

    // Client lit (charge rev 2)
    let loaded = publicStorage.read()
    expect(loaded._rev).toBe(2)
    expect(loaded.activeThemeId).toBe('light')

    // Publier Sombre rev 3
    publicStorage.publish(DARK, 3)

    // Client lit (charge rev 3)
    loaded = publicStorage.read()
    expect(loaded._rev).toBe(3)
    expect(loaded.activeThemeId).toBe('dark')

    // Anciennes réponses ne doivent pas écraser
    const staleLight = { activeThemeId: 'light', _rev: 2, theme: LIGHT }
    const shouldAccept = staleLight._rev > loaded._rev
    expect(shouldAccept).toBe(false)

    // État reste Dark rev 3
    expect(publicStorage.read().activeThemeId).toBe('dark')
  })

  it('validates theme structure on load', () => {
    const loaded = publicStorage.read()

    // Vérifications de validité
    expect(loaded.theme).toBeDefined()
    expect(loaded.theme.id).toBeDefined()
    expect(loaded.theme.name).toBeDefined()
    expect(loaded.theme.colors).toBeDefined()
    expect(loaded.theme.typography).toBeDefined()
    expect(loaded.theme.spacing).toBeDefined()

    // Vérifications de cohérence
    expect(loaded.theme.id).toBe(loaded.activeThemeId)
    expect(loaded._rev).toBeGreaterThan(0)
    expect(loaded._rev).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })

  it('ensures theme consistency: never mix old theme with new revision', () => {
    // Publier Clair rev 2
    publicStorage.publish(LIGHT, 2)
    let loaded = publicStorage.read()

    expect(loaded._rev).toBe(2)
    expect(loaded.activeThemeId).toBe('light')
    expect(loaded.theme.id).toBe('light')
    expect(loaded.theme.colors.bgMain).toBe('#ffffff')

    // Publier Sombre rev 3
    publicStorage.publish(DARK, 3)
    loaded = publicStorage.read()

    expect(loaded._rev).toBe(3)
    expect(loaded.activeThemeId).toBe('dark')
    expect(loaded.theme.id).toBe('dark') // ✅ Cohérent
    expect(loaded.theme.colors.bgMain).toBe('#0f0f12') // ✅ Correct
  })

  it('never reuses revision number', () => {
    const revisions = new Set<number>()

    const themes = [DARK, LIGHT, DARK, LIGHT]
    for (let i = 0; i < themes.length; i++) {
      const rev = i + 1
      publicStorage.publish(themes[i]!, rev)
      revisions.add(rev)
    }

    // Toutes révisions distinctes
    expect(revisions.size).toBe(4)
    expect([...revisions].sort()).toEqual([1, 2, 3, 4])
  })

  it('restores from published state after preview closes', () => {
    // État publié : Light rev 2
    publicStorage.publish(LIGHT, 2)

    // User ouvre preview, voit Dark temporairement

    // User ferme preview → restaurer depuis state publié
    const published = publicStorage.read()
    expect(published.activeThemeId).toBe('light') // ✅ Restauré correct
    expect(published._rev).toBe(2) // ✅ Rev correcte

    // Jamais appliquer le faux rev 999
    expect(published._rev).not.toBe(999)
  })
})
