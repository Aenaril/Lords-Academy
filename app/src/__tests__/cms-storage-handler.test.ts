/**
 * Tests du handler HTTP /api/cms-storage/[[route]] — réellement exécutés
 *
 * On invoque directement onRequest() avec :
 * - un environnement de test isolé (KV mocké en mémoire)
 * - une clé de signature de test connue
 * - un cookie de session signé HMAC-SHA256 généré dans le test (auth simulée)
 *
 * Aucune donnée réelle, aucun secret de production, aucune publication.
 * Les parcours de sécurité (origine, auth, CSRF) sont vérifiés explicitement.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { onRequest } from '../../functions/api/cms-storage/[[route]]'

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'
const ALLOWED_ORIGIN = 'https://example.test'

// ───────────── Mock KV ─────────────

class MockKV {
  store = new Map<string, string>()
  async get(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  async put(key: string, value: string) {
    this.store.set(key, value)
  }
  async delete(key: string) {
    this.store.delete(key)
  }
}

function makeEnv() {
  return {
    STORAGE_BACKEND: 'kv',
    DRAFTS: new MockKV(),
    SESSION_SIGNING_KEY: SIGNING_KEY,
    ALLOWED_ORIGIN,
  }
}

// ───────────── Cookie de session signé (auth simulée) ─────────────

async function hmacHex(data: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function validSessionCookie(expiresInMs = 3600_000): Promise<string> {
  const payload = String(Date.now() + expiresInMs)
  const sig = await hmacHex(payload, SIGNING_KEY)
  const payloadB64 = btoa(payload)
  return `lma_session=${payloadB64}.${sig}`
}

// ───────────── Helper : construire une requête ─────────────

interface ReqOpts {
  cookie?: string
  csrf?: boolean
  origin?: string | null
  body?: any
  method?: string
}

function buildRequest(resource: string, action: string, opts: ReqOpts = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.cookie) headers['Cookie'] = opts.cookie
  if (opts.csrf !== false) headers['X-Requested-With'] = 'lma-admin'
  if (opts.origin !== null) headers['Origin'] = opts.origin ?? ALLOWED_ORIGIN

  return new Request(`https://example.test/api/cms-storage/${resource}/${action}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

async function invoke(resource: string, action: string, env: any, opts: ReqOpts = {}) {
  const request = buildRequest(resource, action, opts)
  const context: any = {
    request,
    env,
    params: { route: [resource, action] },
  }
  const response = await onRequest(context)
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

// ───────────── Tests sécurité ─────────────

describe('CMS Storage handler — sécurité', () => {
  let env: any
  beforeEach(() => {
    env = makeEnv()
  })

  it('rejects a disallowed origin with 403', async () => {
    const cookie = await validSessionCookie()
    const { status, data } = await invoke('announcements', 'load', env, {
      cookie,
      origin: 'https://evil.example',
    })
    expect(status).toBe(403)
    expect(data.error).toMatch(/Origine/)
  })

  it('rejects a request without session with 401', async () => {
    const { status, data } = await invoke('announcements', 'load', env, {
      cookie: undefined,
    })
    expect(status).toBe(401)
    expect(data.error).toMatch(/Authentification/)
  })

  it('rejects a request without CSRF header with 403', async () => {
    const cookie = await validSessionCookie()
    const { status, data } = await invoke('announcements', 'load', env, {
      cookie,
      csrf: false,
    })
    expect(status).toBe(403)
    expect(data.error).toMatch(/CSRF/)
  })

  it('rejects an expired session with 401', async () => {
    const cookie = await validSessionCookie(-1000) // déjà expirée
    const { status } = await invoke('announcements', 'load', env, { cookie })
    expect(status).toBe(401)
  })

  it('rejects a forged signature with 401', async () => {
    const payload = String(Date.now() + 3600_000)
    const forged = `lma_session=${btoa(payload)}.deadbeef`
    const { status } = await invoke('announcements', 'load', env, { cookie: forged })
    expect(status).toBe(401)
  })

  it('rejects non-POST methods with 405', async () => {
    const cookie = await validSessionCookie()
    const { status } = await invoke('announcements', 'load', env, {
      cookie,
      method: 'GET',
    })
    expect(status).toBe(405)
  })
})

// ───────────── Tests parcours authentifiés ─────────────

describe('CMS Storage handler — parcours authentifiés', () => {
  let env: any
  beforeEach(() => {
    env = makeEnv()
  })

  it('announcements: save then load round-trips the data', async () => {
    const cookie = await validSessionCookie()
    const announcements = [
      {
        id: 'a1',
        title: 'Test',
        description: 'desc',
        bgColor: '#000',
        textColor: '#fff',
        buttonText: 'Voir',
        buttonLink: 'dragon-arena',
        linkType: 'tutorial',
        order: 0,
        enabled: true,
        createdAt: 1000,
        modifiedAt: 1000,
      },
    ]

    const saveRes = await invoke('announcements', 'save', env, { cookie, body: { announcements } })
    expect(saveRes.status).toBe(200)
    expect(saveRes.data.ok).toBe(true)

    const loadRes = await invoke('announcements', 'load', env, { cookie })
    expect(loadRes.status).toBe(200)
    expect(loadRes.data.announcements.length).toBe(1)
    expect(loadRes.data.announcements[0].id).toBe('a1')
  })

  it('announcements: rejects invalid body (not an array) with 400', async () => {
    const cookie = await validSessionCookie()
    const { status, data } = await invoke('announcements', 'save', env, {
      cookie,
      body: { announcements: 'nope' },
    })
    expect(status).toBe(400)
    expect(data.ok).toBe(false)
  })

  it('themes: save then load round-trips the library', async () => {
    const cookie = await validSessionCookie()
    const library = { themes: [], activeThemeId: 'dark', publishedThemeId: 'dark' }

    const saveRes = await invoke('themes', 'save', env, { cookie, body: { library } })
    expect(saveRes.status).toBe(200)

    const loadRes = await invoke('themes', 'load', env, { cookie })
    expect(loadRes.data.library.activeThemeId).toBe('dark')
  })

  it('events: save then load round-trips the data', async () => {
    const cookie = await validSessionCookie()
    const events = [
      {
        id: 'e1',
        name: 'Event',
        description: 'd',
        startAt: 2000,
        tutorialId: 'dragon-arena',
        status: 'active',
        createdAt: 1000,
        modifiedAt: 1000,
      },
    ]
    await invoke('events', 'save', env, { cookie, body: { events } })
    const loadRes = await invoke('events', 'load', env, { cookie })
    expect(loadRes.data.events.length).toBe(1)
  })

  it('notifications: save then load round-trips the data', async () => {
    const cookie = await validSessionCookie()
    const schedules = [
      {
        id: 's1',
        eventId: 'e1',
        enabled: true,
        title: 'Rappel',
        message: 'msg',
        timing: 'relative',
        relativeDelay: '-24h',
        status: 'pending',
      },
    ]
    await invoke('notifications', 'save', env, { cookie, body: { schedules } })
    const loadRes = await invoke('notifications', 'load', env, { cookie })
    expect(loadRes.data.schedules.length).toBe(1)
  })

  it('data persists across a simulated reconnection (new session cookie, same store)', async () => {
    const cookie1 = await validSessionCookie()
    const announcements = [
      {
        id: 'persist-1',
        title: 'Persist',
        description: 'd',
        bgColor: '#000',
        textColor: '#fff',
        buttonText: 'Voir',
        buttonLink: '#',
        linkType: 'external',
        order: 0,
        enabled: true,
        createdAt: 1000,
        modifiedAt: 1000,
      },
    ]
    await invoke('announcements', 'save', env, { cookie: cookie1, body: { announcements } })

    // Nouvelle session (cookie différent, expiration différente) — même env/store
    await new Promise((r) => setTimeout(r, 5))
    const cookie2 = await validSessionCookie(7200_000)
    expect(cookie2).not.toBe(cookie1)

    const loadRes = await invoke('announcements', 'load', env, { cookie: cookie2 })
    expect(loadRes.data.announcements.length).toBe(1)
    expect(loadRes.data.announcements[0].id).toBe('persist-1')
  })

  it('returns 404 for an unknown resource', async () => {
    const cookie = await validSessionCookie()
    const { status } = await invoke('unknown', 'load', env, { cookie })
    expect(status).toBe(404)
  })
})
