/**
 * Tests du composant TutorialMetaPanel
 * Validations robustes des scénarios critiques.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TutorialMetaPanel from './TutorialMetaPanel'

const mockAdminContext = {
  tutorial: { id: 'test-1', title: 'Test', description: 'Desc', status: 'draft' as const, coverIcon: '⚔️', difficulty: 'medium' as const, estimatedDuration: '10', coverImage: 'test.png' },
  updateTutorialMeta: vi.fn(),
  isAuthenticated: true
}

vi.mock('./AdminContext', () => ({ useAdmin: () => mockAdminContext }))

describe('TutorialMetaPanel Component', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Cas 1: Affiche statut API quand KV != API (draft vs in_progress)', async () => {
    mockAdminContext.tutorial.status = 'draft'
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tutorialId: 'test-1', status: 'in_progress' })
    })

    render(<TutorialMetaPanel onClose={vi.fn()} />)

    await waitFor(() => {
      const radio = screen.getByDisplayValue('in_progress') as HTMLInputElement
      expect(radio.checked).toBe(true)
    }, { timeout: 3000 })
  })

  it('Cas 2: Affiche erreur 401 et désactive sélecteur', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({})
    })

    render(<TutorialMetaPanel onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Erreur d'authentification/)).toBeInTheDocument()
      const radios = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(radios.every(r => r.disabled)).toBe(true)
    }, { timeout: 3000 })
  })

  it('Cas 3: Bouton Réessayer visible et fonctionnel après erreur 500', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({})
    })

    render(<TutorialMetaPanel onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Erreur serveur \(500\)/)).toBeInTheDocument()
    }, { timeout: 3000 })

    const retryBtn = screen.getByText('Réessayer')
    expect(retryBtn).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tutorialId: 'test-1', status: 'draft' })
    })

    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.queryByText(/Erreur serveur/)).not.toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('Cas 4: Message de chargement visible initialement', async () => {
    fetchMock.mockImplementation(() => new Promise(r => setTimeout(() => r({ ok: true, json: async () => ({ tutorialId: 'test-1', status: 'draft' }) }), 100)))

    render(<TutorialMetaPanel onClose={vi.fn()} />)

    expect(screen.getByText(/⏳ Chargement/)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText(/⏳ Chargement/)).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Cas 5: 404 fallback au statut brouillon KV', async () => {
    mockAdminContext.tutorial.status = 'draft'
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })

    render(<TutorialMetaPanel onClose={vi.fn()} />)

    await waitFor(() => {
      const draftRadio = screen.getByDisplayValue('draft') as HTMLInputElement
      expect(draftRadio.checked).toBe(true)
    }, { timeout: 3000 })
  })

  it('Cas 6: Rechargement à chaque ouverture du panneau', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tutorialId: 'test-1', status: 'draft' })
    })

    const { unmount: u1 } = render(<TutorialMetaPanel onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue('draft')).toBeTruthy(), { timeout: 2000 })
    u1()

    vi.clearAllMocks()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tutorialId: 'test-1', status: 'draft' })
    })

    const { unmount: u2 } = render(<TutorialMetaPanel onClose={vi.fn()} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 2000 })
    u2()
  })

  it('Cas 7: Changement tutoriel pendant requête async → ancienne réponse ignorée', async () => {
    // Tutoriel 1 avec réponse lente
    mockAdminContext.tutorial.id = 'test-slow'
    mockAdminContext.tutorial.status = 'draft' as const

    let resolveFetch: any
    fetchMock.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )

    const { rerender } = render(<TutorialMetaPanel onClose={vi.fn()} />)

    // Avant que réponse arrive, changer tutoriel
    mockAdminContext.tutorial.id = 'test-fast'
    ;(mockAdminContext.tutorial.status as any) = 'published'

    // Réponse rapide pour tutoriel 2
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tutorialId: 'test-fast', status: 'published' })
    })

    rerender(<TutorialMetaPanel onClose={vi.fn()} />)

    // Attendre que tutoriel 2 soit chargé
    await waitFor(() => {
      const publishedRadio = screen.getByDisplayValue('published') as HTMLInputElement
      expect(publishedRadio.checked).toBe(true)
    }, { timeout: 2000 })

    // Maintenant résoudre la requête lente (tutoriel 1)
    resolveFetch({
      ok: true,
      json: async () => ({ tutorialId: 'test-slow', status: 'draft' })
    })

    // Attendre un peu et vérifier que le statut du tutoriel 2 n'a pas changé
    await new Promise(r => setTimeout(r, 100))

    const publishedRadioAfter = screen.getByDisplayValue('published') as HTMLInputElement
    expect(publishedRadioAfter.checked).toBe(true)
  })
})
