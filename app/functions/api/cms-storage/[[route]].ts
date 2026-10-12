/**
 * Endpoints API CMS Storage — Persistance serveur des brouillons CMS
 * 
 * Routes :
 * - POST /api/cms-storage/themes/load — Charger bibliothèque thèmes
 * - POST /api/cms-storage/themes/save — Sauvegarder bibliothèque thèmes
 * - POST /api/cms-storage/announcements/load — Charger brouillons annonces
 * - POST /api/cms-storage/announcements/save — Sauvegarder brouillons annonces
 * - POST /api/cms-storage/events/load — Charger brouillons événements
 * - POST /api/cms-storage/events/save — Sauvegarder brouillons événements
 * - POST /api/cms-storage/notifications/load — Charger programmations
 * - POST /api/cms-storage/notifications/save — Sauvegarder programmations
 * 
 * Tous les endpoints requièrent authentification R4 + CSRF
 */

import {
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
  type CmsStorageContext,
} from '../../cms-storage'

/**
 * Lire la session authentifiée (réutiliser depuis cms/[[route]].ts)
 */
async function readSession(req: Request, env: any): Promise<{ expiresAt: number } | null> {
  const cookie = req.headers.get('Cookie') ?? ''
  const match = cookie.match(/lma_session=([^;]+)/)
  if (!match) {
    return null
  }

  const [payloadB64, sig] = match[1].split('.')
  if (!payloadB64 || !sig) {
    return null
  }

  try {
    const payload = atob(payloadB64)
    const expected = await hmac(payload, env.SESSION_SIGNING_KEY)

    if (!timingSafeEqual(sig, expected)) {
      console.warn('❌ CMS Storage: Signature session invalide')
      return null
    }

    const expiresAt = Number(payload)
    if (!expiresAt || Date.now() > expiresAt) {
      console.warn('❌ CMS Storage: Session expirée')
      return null
    }

    return { expiresAt }
  } catch (err) {
    console.warn('❌ CMS Storage: Erreur parsing session:', err)
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

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Extraire un ID admin cohérent depuis la session
 * En production, utiliser l'ID utilisateur réel de la session R4
 * Pour maintenant, utiliser un hash du timestamp d'expiration (unique par session)
 */
function getAdminIdFromSession(session: { expiresAt: number }): string {
  // HACK : Utiliser expiresAt comme proxy d'ID (en prod, utiliser session.userId)
  return `admin-${session.expiresAt}`
}

export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)

  // Parse route
  const pathname = url.pathname
  const match = pathname.match(/\/api\/cms-storage\/([^/]+)\/([^/]+)/)

  if (!match) {
    return json({ error: 'Invalid CMS storage route' }, 404)
  }

  const resource = match[1] // themes, announcements, events, notifications
  const action = match[2] // load, save

  // Vérifier authentification + CSRF
  const session = await readSession(request, env)
  if (!session) {
    console.warn('❌ CMS Storage: Authentification requise')
    return json({ error: 'Authentification requise' }, 401)
  }

  if (!csrfOk(request)) {
    console.warn('❌ CMS Storage: CSRF invalide')
    return json({ error: 'CSRF invalide' }, 403)
  }

  // Contexte de stockage
  const ctx: CmsStorageContext = {
    kv: env.DRAFTS, // Réutiliser le namespace DRAFTS existant
    adminId: getAdminIdFromSession(session),
  }

  if (!ctx.kv) {
    console.error('❌ CMS Storage: DRAFTS KV binding not found')
    return json({ error: 'Storage service unavailable' }, 502)
  }

  // Routes
  try {
    if (resource === 'themes') {
      if (action === 'load') {
        const library = await loadThemeLibrary(ctx)
        return json({ ok: true, library })
      } else if (action === 'save') {
        const body = (await request.json()) as any
        const library = body.library
        if (!library || typeof library !== 'object') {
          return json({ ok: false, error: 'Invalid library' }, 400)
        }
        const result = await saveThemeLibrary(ctx, library)
        return json(result)
      }
    }

    if (resource === 'announcements') {
      if (action === 'load') {
        const announcements = await loadAnnouncementsDraft(ctx)
        return json({ ok: true, announcements })
      } else if (action === 'save') {
        const body = (await request.json()) as any
        const announcements = body.announcements
        if (!Array.isArray(announcements)) {
          return json({ ok: false, error: 'Invalid announcements' }, 400)
        }
        const result = await saveAnnouncementsDraft(ctx, announcements)
        return json(result)
      }
    }

    if (resource === 'events') {
      if (action === 'load') {
        const events = await loadEventsDraft(ctx)
        return json({ ok: true, events })
      } else if (action === 'save') {
        const body = (await request.json()) as any
        const events = body.events
        if (!Array.isArray(events)) {
          return json({ ok: false, error: 'Invalid events' }, 400)
        }
        const result = await saveEventsDraft(ctx, events)
        return json(result)
      }
    }

    if (resource === 'notifications') {
      if (action === 'load') {
        const schedules = await loadNotificationSchedules(ctx)
        return json({ ok: true, schedules })
      } else if (action === 'save') {
        const body = (await request.json()) as any
        const schedules = body.schedules
        if (!Array.isArray(schedules)) {
          return json({ ok: false, error: 'Invalid schedules' }, 400)
        }
        const result = await saveNotificationSchedules(ctx, schedules)
        return json(result)
      }
    }

    if (resource === 'settings') {
      if (action === 'load') {
        const settings = await loadSiteSettings(ctx)
        return json({ ok: true, settings })
      } else if (action === 'save') {
        const body = (await request.json()) as any
        const settings = body.settings
        if (!settings || typeof settings !== 'object') {
          return json({ ok: false, error: 'Invalid settings' }, 400)
        }
        const result = await saveSiteSettings(ctx, settings)
        return json(result)
      }
    }

    return json({ error: 'Unknown CMS storage resource' }, 404)
  } catch (err) {
    console.error('❌ CMS Storage error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
}
