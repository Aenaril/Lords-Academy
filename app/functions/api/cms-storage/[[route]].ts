/**
 * Endpoints API CMS Storage — Persistance serveur des brouillons CMS
 *
 * Routes (POST uniquement) :
 * - /api/cms-storage/themes/load | save
 * - /api/cms-storage/announcements/load | save
 * - /api/cms-storage/events/load | save
 * - /api/cms-storage/notifications/load | save
 * - /api/cms-storage/settings/load | save
 *
 * Sécurité (toutes les routes) :
 * - Vérification stricte ALLOWED_ORIGIN
 * - Authentification R4 (cookie lma_session signé HMAC-SHA256)
 * - Protection CSRF (header X-Requested-With = 'lma-admin')
 * - Validation des données entrantes
 *
 * Les données sont PRIVÉES (brouillons) : jamais exposées publiquement.
 * Stockage mono-site partagé via getCmsDocStore() (DO par défaut, KV fallback).
 */

import {
  cmsStore,
  loadThemeLibrary,
  saveThemeLibrary,
  loadAnnouncementsDraft,
  saveAnnouncementsDraft,
  loadEventsDraft,
  saveEventsDraft,
  loadNotificationSchedules,
  saveNotificationSchedules,
  loadSiteSettings,
  saveSiteSettings,
} from '../../cms-storage'

// ───────────────────────── Auth & sécurité ─────────────────────────

async function readSession(req: Request, env: any): Promise<{ expiresAt: number } | null> {
  const cookie = req.headers.get('Cookie') ?? ''
  const match = cookie.match(/lma_session=([^;]+)/)
  if (!match) return null

  const [payloadB64, sig] = match[1].split('.')
  if (!payloadB64 || !sig) return null

  try {
    const payload = atob(payloadB64)
    const expected = await hmac(payload, env.SESSION_SIGNING_KEY)
    if (!timingSafeEqual(sig, expected)) return null

    const expiresAt = Number(payload)
    if (!expiresAt || Date.now() > expiresAt) return null

    return { expiresAt }
  } catch {
    return null
  }
}

async function hmac(data: string, key: string): Promise<string> {
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function csrfOk(req: Request): boolean {
  return req.headers.get('X-Requested-With') === 'lma-admin'
}

function originAllowed(req: Request, env: any): boolean {
  const origin = req.headers.get('Origin')
  // Pas d'origine (navigation directe/dev local) OU origine = ALLOWED_ORIGIN
  return !origin || origin === env.ALLOWED_ORIGIN
}

function corsHeaders(req: Request, env: any): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
  // N'autoriser que l'origine attendue (jamais de wildcard)
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function json(data: any, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

// ───────────────────────── Validation ─────────────────────────

function isArray(v: any): v is any[] {
  return Array.isArray(v)
}

function isObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// ───────────────────────── Handler ─────────────────────────

interface CmsStorageContext {
  request: Request
  env: any
  params: { route?: string[] }
}

export const onRequest = async (context: CmsStorageContext): Promise<Response> => {
  const { request, env, params } = context

  const parts = (params.route as string[] | undefined) ?? []
  const resource = parts[0] ?? ''
  const action = parts[1] ?? ''

  const cors = corsHeaders(request, env as any)

  // Préflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors)
  }

  // 1) Origine stricte
  if (!originAllowed(request, env)) {
    return json({ error: 'Origine refusée' }, 403, cors)
  }

  // 2) Authentification R4
  const session = await readSession(request, env)
  if (!session) {
    return json({ error: 'Authentification requise' }, 401, cors)
  }

  // 3) CSRF
  if (!csrfOk(request)) {
    return json({ error: 'CSRF invalide' }, 403, cors)
  }

  // 4) Store via abstraction déployée (DO/KV)
  let store
  try {
    store = cmsStore(env)
  } catch (err) {
    // Message générique côté client ; détail en logs seulement
    console.error('❌ CMS Storage: backend indisponible')
    return json({ error: 'Service de stockage indisponible' }, 502, cors)
  }

  // 5) Dispatch
  try {
    if (resource === 'themes') {
      if (action === 'load') {
        const library = await loadThemeLibrary(store)
        return json({ ok: true, library }, 200, cors)
      }
      if (action === 'save') {
        const body = (await request.json().catch(() => null)) as any
        if (!isObject(body?.library)) {
          return json({ ok: false, error: 'Invalid library' }, 400, cors)
        }
        const result = await saveThemeLibrary(store, body.library)
        return json(result, result.ok ? 200 : 502, cors)
      }
    }

    if (resource === 'announcements') {
      if (action === 'load') {
        const announcements = await loadAnnouncementsDraft(store)
        return json({ ok: true, announcements }, 200, cors)
      }
      if (action === 'save') {
        const body = (await request.json().catch(() => null)) as any
        if (!isArray(body?.announcements)) {
          return json({ ok: false, error: 'Invalid announcements' }, 400, cors)
        }
        const result = await saveAnnouncementsDraft(store, body.announcements)
        return json(result, result.ok ? 200 : 502, cors)
      }
    }

    if (resource === 'events') {
      if (action === 'load') {
        const events = await loadEventsDraft(store)
        return json({ ok: true, events }, 200, cors)
      }
      if (action === 'save') {
        const body = (await request.json().catch(() => null)) as any
        if (!isArray(body?.events)) {
          return json({ ok: false, error: 'Invalid events' }, 400, cors)
        }
        const result = await saveEventsDraft(store, body.events)
        return json(result, result.ok ? 200 : 502, cors)
      }
    }

    if (resource === 'notifications') {
      if (action === 'load') {
        const schedules = await loadNotificationSchedules(store)
        return json({ ok: true, schedules }, 200, cors)
      }
      if (action === 'save') {
        const body = (await request.json().catch(() => null)) as any
        if (!isArray(body?.schedules)) {
          return json({ ok: false, error: 'Invalid schedules' }, 400, cors)
        }
        const result = await saveNotificationSchedules(store, body.schedules)
        return json(result, result.ok ? 200 : 502, cors)
      }
    }

    if (resource === 'settings') {
      if (action === 'load') {
        const settings = await loadSiteSettings(store)
        return json({ ok: true, settings }, 200, cors)
      }
      if (action === 'save') {
        const body = (await request.json().catch(() => null)) as any
        if (!isObject(body?.settings)) {
          return json({ ok: false, error: 'Invalid settings' }, 400, cors)
        }
        const result = await saveSiteSettings(store, body.settings)
        return json(result, result.ok ? 200 : 502, cors)
      }
    }

    return json({ error: 'Unknown CMS storage route' }, 404, cors)
  } catch (err) {
    console.error('❌ CMS Storage error')
    return json({ error: 'Internal server error' }, 500, cors)
  }
}
