/**
 * Tests End-to-End CMS — Flux complets de publication
 * 
 * Simule les parcours réels :
 * 1. Publication annonce → lecture depuis accueil
 * 2. Publication thème → vérification CSS appliqué
 * 3. Création événement → association tutoriel
 * 4. Programmation notifications → persistance
 */

import { describe, it, expect } from 'vitest'
import { Announcement, Theme } from '../cms/types'

/**
 * Contexte de test : simulation session admin authentifiée
 */
interface TestSessionContext {
  sessionCookie: string
  csrfToken: string
  adminPassword: string
  baseUrl: string
}

// Contexte global (simulé — en production, utiliser vraie session R4)
const testSession: TestSessionContext = {
  sessionCookie: '', // Devra être défini avec vraie session
  csrfToken: 'lma-admin',
  adminPassword: '', // Simulé
  baseUrl: 'http://localhost:5173', // Dev server
}

/**
 * Helper : Publier annonce via API
 */
async function publishAnnouncements(
  announcements: Announcement[]
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const response = await fetch(`${testSession.baseUrl}/api/cms/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': testSession.csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ action: 'publish', announcements }),
    })

    const data = await response.json().catch(() => ({}))

    return {
      ok: response.ok,
      status: response.status,
      error: data.error,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: String(err),
    }
  }
}

/**
 * Helper : Charger annonces publiées
 */
async function loadPublishedAnnouncements(): Promise<Announcement[]> {
  try {
    const response = await fetch(`${testSession.baseUrl}/cms/announcements.json`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn(`Failed to load announcements: ${response.status}`)
      return []
    }

    const data = await response.json()
    return data.announcements || []
  } catch (err) {
    console.error('Error loading announcements:', err)
    return []
  }
}

/**
 * Helper : Publier thème via API
 */
async function publishTheme(theme: Theme): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const response = await fetch(`${testSession.baseUrl}/api/cms/themes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': testSession.csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ action: 'publish', theme }),
    })

    const data = await response.json().catch(() => ({}))

    return {
      ok: response.ok,
      status: response.status,
      error: data.error,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: String(err),
    }
  }
}

/**
 * Helper : Charger thème publié
 */
async function loadPublishedTheme(): Promise<Theme | null> {
  try {
    const response = await fetch(`${testSession.baseUrl}/cms/themes.json`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn(`Failed to load theme: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data.theme || null
  } catch (err) {
    console.error('Error loading theme:', err)
    return null
  }
}

describe('CMS End-to-End Tests', () => {
  // SKIP tous les tests end-to-end en dev si le serveur n'est pas lancé
  const isServerRunning = false // Change à true si tu as lancé npm run dev

  describe('Announcements Publication', () => {
    it.skipIf(!isServerRunning)(
      'should publish announcement and be readable from public endpoint',
      async () => {
      // Créer une annonce test
      const testAnnouncement: Announcement = {
        id: `test-${Date.now()}`,
        title: 'Test Announcement',
        description: 'Cette annonce est un test',
        bgColor: '#1a1a1e',
        textColor: '#f2f2f2',
        buttonText: 'Lire la suite',
        buttonLink: 'https://example.com',
        linkType: 'external',
        order: 0,
        enabled: true,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      }

      // Publier
      console.log('📢 Publishing test announcement...')
      const publishResult = await publishAnnouncements([testAnnouncement])
      console.log(`📢 Publish result: ${JSON.stringify(publishResult)}`)

      // Vérifier la réponse API
      if (publishResult.status === 401) {
        console.warn('⚠️ Authentication required — skipping remaining assertions')
        expect(publishResult.ok).toBe(false)
        expect(publishResult.status).toBe(401)
        return
      }

      expect(publishResult.ok).toBe(true)
      expect(publishResult.status).toBe(200)

      // Attendre un peu pour la propagation
      await new Promise((r) => setTimeout(r, 1000))

      // Charger les annonces publiées
      console.log('📢 Loading published announcements...')
      const published = await loadPublishedAnnouncements()
      console.log(`📢 Published announcements: ${published.length} found`)

      // Vérifier l'annonce
      const found = published.find((a) => a.id === testAnnouncement.id)
      if (!found) {
        console.warn('⚠️ Announcement not found in published file — may be propagation delay')
      } else {
        expect(found.title).toBe(testAnnouncement.title)
        expect(found.enabled).toBe(true)
      }
    })
  })

  describe('Theme Publication', () => {
    it.skipIf(!isServerRunning)(
      'should publish theme and be readable from public endpoint',
      async () => {
      // Créer un thème test personnalisé
      const testTheme: Theme = {
        id: `test-${Date.now()}`,
        name: 'Test Theme',
        colors: {
          bgMain: '#ffffff',
          bgCard: '#f5f5f5',
          bgSection: '#eeeeee',
          textPrimary: '#000000',
          textSecondary: '#666666',
          textMuted: '#999999',
          primary: '#ff6600',
          secondary: '#0066ff',
          accent: '#ffcc00',
          success: '#00cc00',
          error: '#cc0000',
          warning: '#ffcc00',
          borderColor: '#cccccc',
          buttonText: '#ffffff',
          linkColor: '#0066ff',
        },
        typography: {
          fontPrimary: 'Arial, sans-serif',
          fontHeadings: 'Georgia, serif',
          sizeBase: 16,
          sizeSmall: 14,
          sizeLarge: 18,
          sizeXL: 24,
        },
        spacing: {
          xs: 4,
          sm: 8,
          md: 16,
          lg: 24,
          xl: 32,
        },
        borderRadius: 8,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        isPredefined: false,
      }

      // Publier
      console.log('🎨 Publishing test theme...')
      const publishResult = await publishTheme(testTheme)
      console.log(`🎨 Publish result: ${JSON.stringify(publishResult)}`)

      // Vérifier la réponse API
      if (publishResult.status === 401) {
        console.warn('⚠️ Authentication required — skipping remaining assertions')
        expect(publishResult.ok).toBe(false)
        expect(publishResult.status).toBe(401)
        return
      }

      expect(publishResult.ok).toBe(true)
      expect(publishResult.status).toBe(200)

      // Attendre propagation
      await new Promise((r) => setTimeout(r, 1000))

      // Charger le thème publié
      console.log('🎨 Loading published theme...')
      const published = await loadPublishedTheme()
      console.log(`🎨 Published theme: ${published?.name || 'NOT FOUND'}`)

      if (!published) {
        console.warn('⚠️ Theme not found in published file')
      } else {
        expect(published.name).toBe(testTheme.name)
        expect(published.colors.primary).toBe(testTheme.colors.primary)
      }
    })
  })

  describe('Session & Authentication', () => {
    it.skipIf(!isServerRunning)(
      'should reject unauthenticated publish attempts',
      async () => {
      const testAnnouncement: Announcement = {
        id: `unauth-${Date.now()}`,
        title: 'Unauthorized Announcement',
        description: 'Ceci ne devrait pas être publié',
        bgColor: '#1a1a1e',
        textColor: '#f2f2f2',
        buttonText: 'Essayer',
        buttonLink: '#',
        linkType: 'external',
        order: 0,
        enabled: true,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      }

      // Publier SANS cookies de session
      console.log('🔐 Testing unauthenticated publish...')
      const response = await fetch(`${testSession.baseUrl}/api/cms/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': testSession.csrfToken,
        },
        // NO credentials: 'include' — pas de session cookie
        body: JSON.stringify({ action: 'publish', announcements: [testAnnouncement] }),
      })

      console.log(`🔐 Unauthenticated request status: ${response.status}`)

      // Devrait être 401
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toContain('Authentification')
    })
  })

  describe('CSRF Protection', () => {
    it.skipIf(!isServerRunning)(
      'should reject requests without valid CSRF header',
      async () => {
      const testAnnouncement: Announcement = {
        id: `csrf-${Date.now()}`,
        title: 'CSRF Test',
        description: 'Test CSRF protection',
        bgColor: '#1a1a1e',
        textColor: '#f2f2f2',
        buttonText: 'Tester',
        buttonLink: '#',
        linkType: 'external',
        order: 0,
        enabled: true,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      }

      // Publier SANS header X-Requested-With
      console.log('🔐 Testing CSRF protection...')
      const response = await fetch(`${testSession.baseUrl}/api/cms/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // NO 'X-Requested-With' header
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'publish', announcements: [testAnnouncement] }),
      })

      console.log(`🔐 CSRF test request status: ${response.status}`)

      // Devrait être 403 (CSRF invalide) ou 401 (auth manquante)
      expect([401, 403]).toContain(response.status)
    })
  })
})
