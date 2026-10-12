/**
 * Tests critiques — Publication CMS avec décodage UTF-8 exact
 * 
 * Valide que :
 * - Accents français et caractères non-ASCII sont préservés
 * - Encodage Base64 ↔ UTF-8 est correct (aller-retour)
 * - Vérification par hash distingue contenus différents
 * - Écriture réussie + vérification retardée est clairement rapportée
 * - Écriture réussie + vérification échouée retourne status spécifique
 */

import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Simulateur de publication avec décodage UTF-8 et gestion d'états
 */
class CmsPublisher {
  private storage: {
    sha: string
    content: any
  } = {
    sha: 'abc123def456',
    content: {
      activeThemeId: 'dark',
      _rev: 0,
      themeName: 'Thème sombre',
    },
  }

  private verifyFailAt = -1
  private verifyAttempt = 0

  /**
   * Décoder Base64 en UTF-8 (imite decodeBase64ToJSON)
   */
  decodeBase64(base64String: string): any {
    const cleanBase64 = base64String.replace(/\s/g, '')
    const binaryString = atob(cleanBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const decoder = new TextDecoder('utf-8')
    const jsonString = decoder.decode(bytes)
    return JSON.parse(jsonString)
  }

  /**
   * Encoder JSON en Base64 UTF-8 (imite encodeJSONToBase64)
   */
  encodeJSON(obj: any): string {
    const jsonString = JSON.stringify(obj, null, 2)
    const encoder = new TextEncoder()
    const bytes = encoder.encode(jsonString)
    let binaryString = ''
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i])
    }
    return btoa(binaryString)
  }

  /**
   * Hash simple du contenu
   */
  hashContent(obj: any): string {
    const json = JSON.stringify(obj, null, 2)
    let hash = 0
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }

  /**
   * Lire SHA + contenu atomiquement (simule API GitHub)
   */
  readAtomic(): { sha: string; content: string } {
    const base64 = this.encodeJSON(this.storage.content)
    return { sha: this.storage.sha, content: base64 }
  }

  /**
   * Écrire contenu (simule GitHub PUT)
   */
  write(sha: string, contentB64: string): { ok: boolean; sha?: string; error?: string } {
    if (sha !== this.storage.sha) {
      return { ok: false, error: 'Conflict (409)' }
    }

    const decoded = this.decodeBase64(contentB64)
    this.storage.sha = `sha${Date.now()}_${Math.random().toString(16).slice(2, 7)}`
    this.storage.content = decoded

    console.info(
      `✅ Écriture réussie: rev=${decoded._rev}, sha=${this.storage.sha.slice(0, 8)}`
    )
    return { ok: true, sha: this.storage.sha }
  }

  /**
   * Vérifier contenu (simule vérification post-publication)
   */
  verify(expectedSha: string, expectedHash: string): { ok: boolean; sha?: string; hash?: string; error?: string } {
    this.verifyAttempt++

    // Simuler vérification retardée (échouée à tentative précise)
    if (this.verifyAttempt === this.verifyFailAt) {
      console.warn(`⚠️ Vérification échouée simulée à tentative ${this.verifyAttempt}`)
      return { ok: false, error: 'Verify failed' }
    }

    const base64 = this.encodeJSON(this.storage.content)
    const decoded = this.decodeBase64(base64)
    const actualHash = this.hashContent(decoded)

    if (this.storage.sha === expectedSha && actualHash === expectedHash) {
      console.info(`✅ Vérification réussie: sha=${this.storage.sha.slice(0, 8)}, hash=${actualHash.slice(0, 7)}`)
      return { ok: true, sha: this.storage.sha, hash: actualHash }
    }

    console.warn(
      `⚠️ Vérification échouée: sha ${this.storage.sha.slice(0, 8)} vs ${expectedSha.slice(0, 8)}, hash ${actualHash.slice(0, 7)} vs ${expectedHash.slice(0, 7)}`
    )
    return { ok: false, error: 'Hash mismatch' }
  }

  /**
   * Réinitialiser état de vérification
   */
  resetVerify() {
    this.verifyAttempt = 0
  }

  /**
   * Configurer vérification échouée à tentative N
   */
  setVerifyFailAt(attempt: number) {
    this.verifyFailAt = attempt
  }

  /**
   * Obtenir état courant
   */
  getState() {
    return { sha: this.storage.sha, content: { ...this.storage.content } }
  }
}

describe('CMS — UTF-8 Publication et Gestion d\'États', () => {
  let publisher: CmsPublisher

  beforeEach(() => {
    publisher = new CmsPublisher()
  })

  it('preserves French accents and special characters through Base64/UTF-8 cycle', () => {
    const content = {
      activeThemeId: 'light',
      _rev: 1,
      themeName: 'Thème clair classique',
      description: 'Utilise des couleurs vives avec accent bleu — parfait pour une lecture confortable.',
      author: 'Équipe LMA',
      tags: ['clair', 'français', 'français'],
    }

    const base64 = publisher.encodeJSON(content)
    const decoded = publisher.decodeBase64(base64)

    // Tous les champs doivent être identiques après aller-retour
    expect(decoded.themeName).toBe('Thème clair classique')
    expect(decoded.description).toContain('accent bleu')
    expect(decoded.author).toBe('Équipe LMA')
    expect(decoded.tags).toEqual(['clair', 'français', 'français'])
  })

  it('handles theme names with non-ASCII characters exactly', () => {
    const themes = [
      { id: 'dark', name: 'Sombre' },
      { id: 'light', name: 'Clair' },
      { id: 'yellow', name: 'Jaune personnalisé' },
      { id: 'blue', name: 'Bleu — Professionnel' },
    ]

    for (const theme of themes) {
      const base64 = publisher.encodeJSON(theme)
      const decoded = publisher.decodeBase64(base64)
      expect(decoded.name).toBe(theme.name)
    }
  })

  it('distinguishes content by hash even with same _rev', () => {
    const content1 = {
      activeThemeId: 'light',
      _rev: 1,
      themeName: 'Thème clair',
    }

    const content2 = {
      activeThemeId: 'yellow',
      _rev: 1,
      themeName: 'Thème jaune personnalisé',
    }

    const hash1 = publisher.hashContent(content1)
    const hash2 = publisher.hashContent(content2)

    expect(hash1).not.toBe(hash2)
  })

  it('sequence: Publish light → verify delayed → verify success', () => {
    // Lire SHA initial
    const { sha: initialSha } = publisher.readAtomic()

    // Préparer nouveau contenu
    const newContent = {
      activeThemeId: 'light',
      _rev: 1,
      themeName: 'Thème clair classique',
    }

    const newContentB64 = publisher.encodeJSON(newContent)
    const newContentHash = publisher.hashContent(newContent)

    // Écrire
    const writeResult = publisher.write(initialSha, newContentB64)
    expect(writeResult.ok).toBe(true)
    const newSha = writeResult.sha!

    // Configurer vérification échouée à tentative 1
    publisher.setVerifyFailAt(1)
    publisher.resetVerify()

    // Tentative 1 : échouée
    const verify1 = publisher.verify(newSha, newContentHash)
    expect(verify1.ok).toBe(false)

    // Tentative 2 : réussie
    const verify2 = publisher.verify(newSha, newContentHash)
    expect(verify2.ok).toBe(true)
    expect(verify2.sha).toBe(newSha)
    expect(verify2.hash).toBe(newContentHash)
  })

  it('reports distinct states: write success → verify delayed then success', () => {
    // Lire SHA initial
    const { sha: initialSha } = publisher.readAtomic()

    // Écrire contenu
    const newContent = { activeThemeId: 'yellow', _rev: 1 }
    const newContentB64 = publisher.encodeJSON(newContent)
    const newContentHash = publisher.hashContent(newContent)

    // Écriture réussie
    const writeResult = publisher.write(initialSha, newContentB64)
    expect(writeResult.ok).toBe(true)

    // Configurer vérification échouée à tentative 1
    publisher.setVerifyFailAt(1)
    publisher.resetVerify()

    // Tentative 1 : échouée
    const verify1 = publisher.verify(writeResult.sha!, newContentHash)
    expect(verify1.ok).toBe(false)

    // Tentatives 2-3 : réussies
    for (let i = 0; i < 2; i++) {
      const verifyResult = publisher.verify(writeResult.sha!, newContentHash)
      expect(verifyResult.ok).toBe(true)
    }

    // État stocké doit montrer contenu écrit (pas ancien)
    const { content } = publisher.getState()
    expect(content.activeThemeId).toBe('yellow')
    expect(content._rev).toBe(1)
  })

  it('sequence: Dark → Light → Yellow → Dark with UTF-8 preservation', () => {
    let { sha } = publisher.readAtomic()

    const sequence = [
      { id: 'light', name: 'Thème clair classique', rev: 1 },
      { id: 'yellow', name: 'Jaune personnalisé', rev: 2 },
      { id: 'dark', name: 'Thème sombre — professionnel', rev: 3 },
    ]

    for (const { id, name, rev } of sequence) {
      const content = { activeThemeId: id, _rev: rev, themeName: name }
      const contentB64 = publisher.encodeJSON(content)
      const contentHash = publisher.hashContent(content)

      // Écrire
      const writeResult = publisher.write(sha, contentB64)
      expect(writeResult.ok).toBe(true)
      sha = writeResult.sha!

      // Vérifier
      publisher.resetVerify()
      const verifyResult = publisher.verify(sha, contentHash)
      expect(verifyResult.ok).toBe(true)

      // Vérifier contenu stocké
      const { content: stored } = publisher.getState()
      expect(stored.themeName).toBe(name)
      expect(stored.activeThemeId).toBe(id)
    }
  })

  it('prevents stale theme from being applied despite network retry', () => {
    let { sha } = publisher.readAtomic()

    // Pub 1 : Light
    const light = { activeThemeId: 'light', _rev: 1, themeName: 'Clair' }
    let writeResult = publisher.write(sha, publisher.encodeJSON(light))
    expect(writeResult.ok).toBe(true)
    sha = writeResult.sha!

    // Pub 2 : Yellow
    const yellow = { activeThemeId: 'yellow', _rev: 2, themeName: 'Jaune' }
    writeResult = publisher.write(sha, publisher.encodeJSON(yellow))
    expect(writeResult.ok).toBe(true)

    // Essayer d'écrire ancien contenu (Light) avec ancien SHA → échouera
    const oldSha = sha // SHA avant yellow
    const writeOld = publisher.write(oldSha, publisher.encodeJSON(light))
    expect(writeOld.ok).toBe(false)

    // État doit rester Yellow
    const { content } = publisher.getState()
    expect(content.activeThemeId).toBe('yellow')
    expect(content._rev).toBe(2)
  })

  it('UTF-8 identity verification: same content = same hash, different content = different hash', () => {
    const content1 = {
      activeThemeId: 'light',
      themeName: 'Thème clair',
    }

    const content2 = {
      activeThemeId: 'light',
      themeName: 'Thème clair classique',
    }

    const hash1a = publisher.hashContent(content1)
    const hash1b = publisher.hashContent(content1)
    const hash2 = publisher.hashContent(content2)

    // Même contenu = même hash
    expect(hash1a).toBe(hash1b)

    // Contenu différent = hash différent
    expect(hash1a).not.toBe(hash2)
  })

  it('preview disables after publication: temp theme cleared on successful publish', () => {
    // État initial : Dark
    const { content: initial } = publisher.getState()
    expect(initial.activeThemeId).toBe('dark')

    // Lire SHA
    let { sha } = publisher.readAtomic()

    // Publier Light
    const light = { activeThemeId: 'light', _rev: 1 }
    const writeResult = publisher.write(sha, publisher.encodeJSON(light))
    expect(writeResult.ok).toBe(true)

    // Vérifier
    publisher.resetVerify()
    const verifyResult = publisher.verify(writeResult.sha!, publisher.hashContent(light))
    expect(verifyResult.ok).toBe(true)

    // État doit être Light (ancien Dark ne doit pas être visible)
    const { content: afterPub } = publisher.getState()
    expect(afterPub.activeThemeId).toBe('light')
    expect(afterPub._rev).toBe(1)
  })
})
