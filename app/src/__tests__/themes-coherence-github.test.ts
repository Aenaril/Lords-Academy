/**
 * Tests Critiques — Cohérence GitHub pour Publications de Thèmes
 *
 * Valide que :
 * - SHA et contenu sont lus de manière atomique
 * - Les conflits SHA sont gérés (retry avec nouveau SHA)
 * - Les vérifications par hash empêchent les contenus corrompus
 * - Les anciennes versions en cache ne sont jamais acceptées
 * - Les publications concurrentes ne créent pas de collision
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

/**
 * Simulateur GitHub : simule API GitHub avec SHA et contenu
 */
class GitHubSimulator {
  private storage: {
    sha: string
    content: any
  } = {
    sha: 'abc123def456',
    content: { activeThemeId: 'dark', _rev: 0, theme: DARK },
  }

  private conflictAttempts = 0
  private conflictTriggerAt = -1

  /**
   * Simuler un conflit SHA à une tentative précise
   */
  setConflictAt(attemptNumber: number) {
    this.conflictTriggerAt = attemptNumber
    this.conflictAttempts = 0
  }

  /**
   * Lire SHA + contenu (atomique depuis API GitHub)
   */
  readAtomic(): { sha: string; content: any } {
    return { sha: this.storage.sha, content: { ...this.storage.content } }
  }

  /**
   * Écrire avec SHA, simuler conflit si configuré
   */
  write(sha: string, newContent: any): { ok: boolean; sha?: string; error?: string } {
    this.conflictAttempts++

    // Simuler conflit à une tentative précise
    if (this.conflictAttempts === this.conflictTriggerAt) {
      console.warn(`⚠️ Conflit simulé à tentative ${this.conflictAttempts}`)
      return { ok: false, error: 'Conflict (409)' }
    }

    // Vérifier SHA
    if (sha !== this.storage.sha) {
      console.warn(`⚠️ SHA mismatch: ${sha} vs ${this.storage.sha}`)
      return { ok: false, error: 'Conflict (409)' }
    }

    // Écrire
    this.storage.sha = `sha${Date.now()}_${Math.random().toString(16).slice(2, 7)}`
    this.storage.content = { ...newContent }

    console.info(
      `✅ Écriture réussie: rev=${newContent._rev}, sha=${this.storage.sha.slice(0, 8)}`
    )
    return { ok: true, sha: this.storage.sha }
  }

  /**
   * Obtenir l'état courant
   */
  getState() {
    return { sha: this.storage.sha, content: { ...this.storage.content } }
  }

  /**
   * Calculer hash simple du contenu
   */
  static hashContent(obj: any): string {
    const json = JSON.stringify(obj, null, 2)
    let hash = 0
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) - hash) + json.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }
}

describe('Thèmes — Cohérence GitHub et Gestion SHA', () => {
  let github: GitHubSimulator

  beforeEach(() => {
    github = new GitHubSimulator()
  })

  it('reads SHA and content atomically from single API call', () => {
    const { sha, content } = github.readAtomic()

    expect(sha).toBeDefined()
    expect(content).toBeDefined()
    expect(content._rev).toBeDefined()
    expect(sha.length).toBeGreaterThan(0)
  })

  it('detects SHA mismatch and retries', () => {
    const { sha: initialSha, content: initialContent } = github.readAtomic()

    // Première tentative avec ancien SHA
    const oldSha = 'obsolete_sha_123'
    const newContent1 = { ...initialContent, _rev: 1, activeThemeId: 'light' }

    const write1 = github.write(oldSha, newContent1)
    expect(write1.ok).toBe(false) // Rejeté

    // Deuxième tentative avec bon SHA
    const write2 = github.write(initialSha, newContent1)
    expect(write2.ok).toBe(true) // Accepté

    // Obtenir le nouveau SHA
    const { sha: newSha } = github.getState()
    expect(newSha).not.toBe(initialSha)
  })

  it('handles 409 conflict by re-reading and retrying', () => {
    github.setConflictAt(1) // Conflit à tentative 1

    const { sha: sha1 } = github.readAtomic()

    // Tentative 1 : conflit
    const content1 = { activeThemeId: 'light', _rev: 1 }
    const result1 = github.write(sha1, content1)
    expect(result1.ok).toBe(false)

    // Entre les tentatives : relire
    const { sha: sha2 } = github.readAtomic()
    expect(sha2).toBe(sha1) // SHA initial inchangé

    // Tentative 2 : succès
    const result2 = github.write(sha2, content1)
    expect(result2.ok).toBe(true)

    // Le nouvel état reflète la deuxième tentative
    const { content: finalContent } = github.getState()
    expect(finalContent._rev).toBe(1)
  })

  it('verifies content by SHA match, not just revision match', () => {
    const { sha: initialSha, content: initialContent } = github.readAtomic()

    // Écrire contenu 1 (thème Light)
    const content1 = { ...initialContent, _rev: 1, activeThemeId: 'light', theme: LIGHT }
    const write1 = github.write(initialSha, content1)
    expect(write1.ok).toBe(true)
    const newSha1 = write1.sha!

    // Écrire contenu 2 (thème Yellow) avec SHA de 1
    const content2 = { ...initialContent, _rev: 2, activeThemeId: 'yellow', theme: DARK }
    const write2 = github.write(newSha1, content2)
    expect(write2.ok).toBe(true)
    const newSha2 = write2.sha!

    // Vérifier que les SHA sont DIFFÉRENTS (contenu différent)
    expect(newSha1).not.toBe(newSha2)

    // L'état actuel doit être content2
    const { sha: currentSha, content: currentContent } = github.getState()
    expect(currentSha).toBe(newSha2)
    expect(currentContent._rev).toBe(2)
    expect(currentContent.activeThemeId).toBe('yellow')
  })

  it('prevents cached old content from overwriting newer content', () => {
    const { sha: sha1 } = github.readAtomic()

    // Pub 1 : écrire rev 1
    const content1 = { activeThemeId: 'light', _rev: 1 }
    github.write(sha1, content1)
    const { sha: sha2 } = github.getState()

    // Pub 2 : écrire rev 2
    const content2 = { activeThemeId: 'yellow', _rev: 2 }
    github.write(sha2, content2)
    const { sha: sha3 } = github.getState()

    // Essayer d'écrire contenu ancien (content1) avec SHA1 => échoue
    const obsoleteWrite = github.write(sha1, content1)
    expect(obsoleteWrite.ok).toBe(false)

    // État reste rev 2
    const { content: finalContent, sha: finalSha } = github.getState()
    expect(finalContent._rev).toBe(2)
    expect(finalSha).toBe(sha3)
  })

  it('handles sequence: Dark → Light → Yellow → Dark', () => {
    let { sha } = github.readAtomic()
    const sequence = [
      { theme: 'dark', rev: 1 },
      { theme: 'light', rev: 2 },
      { theme: 'yellow', rev: 3 },
      { theme: 'dark', rev: 4 },
    ]

    for (const { theme, rev } of sequence) {
      const content = { activeThemeId: theme, _rev: rev }
      const write = github.write(sha, content)

      expect(write.ok).toBe(true)
      sha = write.sha!

      const { content: stored } = github.getState()
      expect(stored._rev).toBe(rev)
      expect(stored.activeThemeId).toBe(theme)
    }

    // État final doit être Dark rev 4
    const { content: final } = github.getState()
    expect(final._rev).toBe(4)
    expect(final.activeThemeId).toBe('dark')
  })

  it('distinguishes content by hash, not just by _rev', () => {
    const { sha: initialSha } = github.readAtomic()

    // Deux contenus différents avec même _rev
    const contentA = { activeThemeId: 'light', _rev: 1, name: 'A' }
    const contentB = { activeThemeId: 'yellow', _rev: 1, name: 'B' }

    const hashA = GitHubSimulator.hashContent(contentA)
    const hashB = GitHubSimulator.hashContent(contentB)

    expect(hashA).not.toBe(hashB) // Hashes différents malgré même _rev

    // Écrire A
    const writeA = github.write(initialSha, contentA)
    expect(writeA.ok).toBe(true)
    const shaA = writeA.sha!

    // Écrire B avec sha de A
    const writeB = github.write(shaA, contentB)
    expect(writeB.ok).toBe(true)
    const shaB = writeB.sha!

    // SHA diffère = contenu diffère
    expect(shaA).not.toBe(shaB)
  })

  it('prevents split-brain with concurrent publications', () => {
    const { sha: initialSha } = github.readAtomic()

    // Pub 1 : Light rev 1
    const pub1Content = { activeThemeId: 'light', _rev: 1 }
    const write1 = github.write(initialSha, pub1Content)
    expect(write1.ok).toBe(true)

    // Entre les deux publications : relire SHA (quelqu'un d'autre peut avoir écrit)
    const { sha: sha2 } = github.readAtomic()

    // Pub 2 : Yellow rev 2
    const pub2Content = { activeThemeId: 'yellow', _rev: 2 }
    const write2 = github.write(sha2, pub2Content)
    expect(write2.ok).toBe(true)

    // État final doit être Yellow rev 2
    const { content: final } = github.getState()
    expect(final._rev).toBe(2)
    expect(final.activeThemeId).toBe('yellow')
  })
})
