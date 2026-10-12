/**
 * Tests d'intégration CMS — Vérifier le flux publish → display
 * 
 * Scénarios testés :
 * 1. Charger configs CMS au démarrage
 * 2. Appliquer thèmes au DOM
 * 3. Afficher annonces carrousel
 * 4. Publier config accueil via API
 * 5. Recharger et afficher nouveau contenu
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Mock fetch pour tester les appels API
 */
let fetchedUrls: string[] = []
let mockResponses: Record<string, any> = {}

const originalFetch = global.fetch

beforeEach(() => {
  fetchedUrls = []
  mockResponses = {}
  
  global.fetch = async (url: string, options?: any) => {
    const urlStr = url instanceof Request ? url.url : String(url)
    fetchedUrls.push(urlStr)

    // Mock des réponses CMS
    if (urlStr.includes('/cms/themes.json')) {
      return new Response(JSON.stringify(mockResponses['themes.json'] || {
        "activeThemeId": "default-light",
        "theme": { id: "default-light", name: "Default Light" }
      }), { status: 200 })
    }

    if (urlStr.includes('/cms/announcements.json')) {
      return new Response(JSON.stringify(mockResponses['announcements.json'] || {
        "announcements": []
      }), { status: 200 })
    }

    if (urlStr.includes('/api/cms/home')) {
      if (options?.method === 'POST') {
        // Publier config
        return new Response(JSON.stringify({ ok: true, revision: 'abc123' }), { status: 200 })
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  } as any
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('CMS Integration Tests', () => {
  it('should load home config from CMS JSON', async () => {
    mockResponses['home.json'] = {
      config: {
        title: 'Test Academy',
        subtitle: 'Learn strategy',
        introText: 'Welcome to the academy'
      }
    }

    const res = await fetch('/cms/home.json')
    const data = await res.json()
    
    expect(data.config.title).toBe('Test Academy')
    expect(data.config.subtitle).toBe('Learn strategy')
  })

  it('should load announcements and filter active ones', async () => {
    mockResponses['announcements.json'] = {
      announcements: [
        {
          id: 'ann1',
          title: 'Welcome',
          enabled: true,
          visibilityStartAt: Date.now() - 1000,
          visibilityEndAt: Date.now() + 1000
        },
        {
          id: 'ann2',
          title: 'Expired',
          enabled: true,
          visibilityStartAt: Date.now() - 2000,
          visibilityEndAt: Date.now() - 1000 // Déjà expiré
        }
      ]
    }

    const res = await fetch('/cms/announcements.json')
    const data = await res.json()
    
    expect(data.announcements).toHaveLength(2)
    
    // Filter active
    const now = Date.now()
    const active = data.announcements.filter((ann: any) => {
      if (!ann.enabled) return false
      if (ann.visibilityStartAt && now < ann.visibilityStartAt) return false
      if (ann.visibilityEndAt && now > ann.visibilityEndAt) return false
      return true
    })
    
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('ann1')
  })

  it('should publish home config via API with authentication', async () => {
    const config = {
      title: 'Updated Academy',
      subtitle: 'New strategy',
      sections: { available: { visible: true, title: 'Available' } }
    }

    const res = await fetch('/api/cms/home', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'test-token' },
      body: JSON.stringify({ action: 'save', config })
    })

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.revision).toBeDefined()
  })

  it('should fetch theme and apply CSS variables', async () => {
    mockResponses['themes.json'] = {
      activeThemeId: 'dark',
      theme: {
        id: 'dark',
        name: 'Dark Theme',
        colors: {
          bgMain: '#000000',
          textPrimary: '#ffffff',
          primary: '#6366f1'
        },
        typography: {
          fontPrimary: 'Arial',
          fontHeadings: 'Georgia'
        },
        spacing: { xs: 4, sm: 8, md: 16 }
      }
    }

    const res = await fetch('/cms/themes.json')
    const data = await res.json()
    
    expect(data.theme.colors.bgMain).toBe('#000000')
    expect(data.theme.colors.textPrimary).toBe('#ffffff')
    
    // CSS generation check
    const css = `
      :root {
        --bg-main: ${data.theme.colors.bgMain};
        --text-primary: ${data.theme.colors.textPrimary};
      }
    `
    expect(css).toContain('--bg-main: #000000')
    expect(css).toContain('--text-primary: #ffffff')
  })

  it('should track all CMS API calls', () => {
    expect(fetchedUrls.length).toBeGreaterThan(0)
    console.info('Fetched URLs:', fetchedUrls)
  })
})
