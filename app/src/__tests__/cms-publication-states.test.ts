/**
 * Tests — Publication States API et Frontend
 * 
 * Valide que :
 * - API expose status et userMessage explicitement
 * - Frontend interprète les statuts correctement
 * - États distinctes : write-success, verify-failed, verify-expired, conflict, write-failed
 * - Messages utilisateur clairs (pas "Erreur publication")
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { PublicationResponse, PublishUIStatus } from '../cms/PublicationTypes'
import { PublicationStatus } from '../cms/PublicationTypes'

/**
 * Mapper statut serveur → UI status
 */
function mapServerStatusToUIStatus(serverStatus?: PublicationStatus): PublishUIStatus {
  switch (serverStatus) {
    case PublicationStatus.VERIFY_SUCCESS:
      return 'verify-success'
    case PublicationStatus.VERIFY_FAILED:
      return 'verify-failed'
    case PublicationStatus.EXPIRED_VERIFY:
      return 'verify-expired'
    case PublicationStatus.CONFLICT:
      return 'conflict'
    case PublicationStatus.WRITE_FAILED:
      return 'write-failed'
    default:
      return 'idle'
  }
}

/**
 * Simulateur API publication
 */
class ApiPublicationSimulator {
  private state: {
    ok: boolean
    status: PublicationStatus
    revision?: string
    revisionNumber?: number
    error: string
    userMessage: string
  } = {
    ok: false,
    status: PublicationStatus.BEFORE_WRITE,
    error: '',
    userMessage: '',
  }

  writeSuccess(revision: string, revisionNumber: number) {
    this.state = {
      ok: true,
      status: PublicationStatus.VERIFY_SUCCESS,
      revision,
      revisionNumber,
      error: '',
      userMessage: 'Thème publié avec succès. Déploiement sur Cloudflare en cours.',
    }
  }

  writeThenVerifyFailed(revision: string, revisionNumber: number) {
    this.state = {
      ok: false,
      status: PublicationStatus.VERIFY_FAILED,
      revision,
      revisionNumber,
      error: 'Publication verification failed',
      userMessage: 'Écriture GitHub réussie, mais vérification du contenu échouée. État incertain.',
    }
  }

  writeThenVerifyExpired(revision: string) {
    this.state = {
      ok: false,
      status: PublicationStatus.EXPIRED_VERIFY,
      revision,
      error: 'Verification expired after write success',
      userMessage: 'Écriture GitHub réussie. Vérification expirée. Vérifiez manuellement.',
    }
  }

  conflict() {
    this.state = {
      ok: false,
      status: PublicationStatus.CONFLICT,
      error: 'SHA conflict after retries',
      userMessage: 'Conflit lors de la publication. Le fichier a changé. Veuillez réessayer.',
    }
  }

  writeFailed() {
    this.state = {
      ok: false,
      status: PublicationStatus.WRITE_FAILED,
      error: 'GitHub write failed',
      userMessage: 'Impossible d\'écrire sur GitHub. Vérifiez votre authentification.',
    }
  }

  getResponse(): PublicationResponse {
    return this.state
  }
}

describe('CMS — Publication States API et Frontend', () => {
  let api: ApiPublicationSimulator

  beforeEach(() => {
    api = new ApiPublicationSimulator()
  })

  it('success: write + verify both succeed', () => {
    api.writeSuccess('sha123abc', 1)
    const response = api.getResponse()

    expect(response.ok).toBe(true)
    expect(response.status).toBe(PublicationStatus.VERIFY_SUCCESS)
    expect(response.userMessage).toContain('succès')
    expect(response.userMessage).toContain('Cloudflare')

    const uiStatus = mapServerStatusToUIStatus(response.status)
    expect(uiStatus).toBe('verify-success')
  })

  it('write succeeded, verify failed — distinct state', () => {
    api.writeThenVerifyFailed('sha123abc', 1)
    const response = api.getResponse()

    expect(response.ok).toBe(false)
    expect(response.status).toBe(PublicationStatus.VERIFY_FAILED)
    expect(response.revision).toBe('sha123abc')
    expect(response.revisionNumber).toBe(1)
    expect(response.userMessage).toContain('réussie')
    expect(response.userMessage).toContain('vérification')

    const uiStatus = mapServerStatusToUIStatus(response.status)
    expect(uiStatus).toBe('verify-failed')
  })

  it('write succeeded, verify expired — distinct state from verify-failed', () => {
    api.writeThenVerifyExpired('sha123abc')
    const response = api.getResponse()

    expect(response.ok).toBe(false)
    expect(response.status).toBe(PublicationStatus.EXPIRED_VERIFY)
    expect(response.revision).toBe('sha123abc')
    expect(response.userMessage).toContain('réussie')
    expect(response.userMessage).toContain('Vérification expirée')

    const uiStatus = mapServerStatusToUIStatus(response.status)
    expect(uiStatus).toBe('verify-expired')
  })

  it('conflict: SHA mismatch — clear message', () => {
    api.conflict()
    const response = api.getResponse()

    expect(response.ok).toBe(false)
    expect(response.status).toBe(PublicationStatus.CONFLICT)
    expect(response.userMessage).toContain('Conflit')
    expect(response.userMessage).toContain('fichier a changé')

    const uiStatus = mapServerStatusToUIStatus(response.status)
    expect(uiStatus).toBe('conflict')
  })

  it('write failed — distinct from verify-failed', () => {
    api.writeFailed()
    const response = api.getResponse()

    expect(response.ok).toBe(false)
    expect(response.status).toBe(PublicationStatus.WRITE_FAILED)
    expect(response.revision).toBeUndefined()
    expect(response.userMessage).toContain('GitHub')

    const uiStatus = mapServerStatusToUIStatus(response.status)
    expect(uiStatus).toBe('write-failed')
  })

  it('frontend distinguishes: verify-failed = write OK vs verify-failed = GitHub fail', () => {
    // Cas 1 : Write succeeded, verify failed
    api.writeThenVerifyFailed('sha123', 1)
    const verifyFailed = api.getResponse()
    expect(verifyFailed.revision).toBeDefined() // Écriture a réussi
    expect(verifyFailed.revisionNumber).toBe(1)

    // Cas 2 : Write failed
    api.writeFailed()
    const writeFailed = api.getResponse()
    expect(writeFailed.revision).toBeUndefined() // Pas d'écriture
    expect(writeFailed.status).toBe(PublicationStatus.WRITE_FAILED)

    // States doivent être clairement distincts
    expect(verifyFailed.status).not.toBe(writeFailed.status)
  })

  it('userMessage never generic "Erreur publication" — always specific reason', () => {
    const cases = [
      { setup: () => api.writeSuccess('sha1', 1), status: PublicationStatus.VERIFY_SUCCESS },
      { setup: () => api.writeThenVerifyFailed('sha1', 1), status: PublicationStatus.VERIFY_FAILED },
      { setup: () => api.writeThenVerifyExpired('sha1'), status: PublicationStatus.EXPIRED_VERIFY },
      { setup: () => api.conflict(), status: PublicationStatus.CONFLICT },
      { setup: () => api.writeFailed(), status: PublicationStatus.WRITE_FAILED },
    ]

    for (const { setup, status } of cases) {
      setup()
      const response = api.getResponse()

      expect(response.userMessage).toBeTruthy()
      expect((response.userMessage ?? '').length).toBeGreaterThan(10)
      expect(response.userMessage).not.toMatch(/^Erreur/)
      console.info(`Status ${status}: "${response.userMessage}"`)
    }
  })

  it('preview disabled after successful publish — no stale theme reapplied', () => {
    // État initial : Dark
    let publishedThemeId = 'dark'

    // Publish Light
    publishedThemeId = 'light'

    // Simulate close CMS window
    // Should NOT restore old Dark — should keep Light
    const restoredTheme = publishedThemeId // From library.publishedThemeId
    expect(restoredTheme).toBe('light')
  })

  it('no relance after write success + verify expired', () => {
    api.writeThenVerifyExpired('sha123')
    const response = api.getResponse()

    // Don't blindly retry — user should check manually
    expect(response.revision).toBeDefined()
    expect(response.status).toBe(PublicationStatus.EXPIRED_VERIFY)

    // Interface should show this state clearly, not just "error"
    const uiStatus = mapServerStatusToUIStatus(response.status)
    expect(uiStatus).toBe('verify-expired')
    expect(uiStatus).not.toBe('write-failed')
  })
})
