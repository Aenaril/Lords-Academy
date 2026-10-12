/**
 * Endpoints CMS pour Étape 3
 * 
 * Routes :
 * - POST /api/cms/themes
 * - POST /api/cms/announcements
 * - POST /api/cms/events
 * - POST /api/cms/home
 * - POST /api/cms/settings
 * - POST /api/cms/notifications
 */

import {
  publishCmsConfig,
  validateTheme,
  validateAnnouncement,
  validateEvent,
  validateHomeConfig,
  validateSiteSettings,
} from '../../cms'

export const onRequest: PagesFunction = async (context) => {
  const { request, env, params } = context
  const url = new URL(request.url)

  const pathParts = (params.route as string[] | undefined) ?? []
  const route = pathParts[0] || ''

  const cors = corsHeaders(request, env as any)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  try {
    let response: Response

    // Route CMS dispatcher
    switch (route) {
      case 'themes':
        response = await handleCmsThemes(request, env as any)
        break
      case 'announcements':
        response = await handleCmsAnnouncements(request, env as any)
        break
      case 'events':
        response = await handleCmsEvents(request, env as any)
        break
      case 'home':
        response = await handleCmsHome(request, env as any)
        break
      case 'settings':
        response = await handleCmsSettings(request, env as any)
        break
      case 'notifications':
        response = await handleCmsNotifications(request, env as any)
        break
      default:
        response = json({ error: 'CMS route not found' }, 404)
    }

    return withCors(response, cors)
  } catch (err) {
    console.error('CMS API error:', err)
    return withCors(json({ error: 'CMS error' }, 500), cors)
  }
}

/**
 * POST /api/cms/themes
 */
async function handleCmsThemes(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Note : Pour Étape 3, on peut avoir une authentification optionnelle
  // ou on fait confiance au localStorage du client (moins sûr)
  // Pour production, il faudrait vérifier la session

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'publish') {
    const theme = body?.theme
    if (!validateTheme(theme)) {
      return json({ ok: false, error: 'Invalid theme' }, 400)
    }

    const result = await publishCmsConfig(env, 'themes.json', {
      activeThemeId: theme.id,
      publishedAt: Date.now(),
      theme,
    })

    if (!result.ok) {
      return json({ ok: false, error: result.error }, 502)
    }

    return json({ ok: true, revision: result.revision })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/**
 * POST /api/cms/announcements
 */
async function handleCmsAnnouncements(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'publish') {
    const announcements = body?.announcements
    if (!Array.isArray(announcements)) {
      return json({ ok: false, error: 'Invalid announcements' }, 400)
    }

    // Valider chaque annonce
    for (const ann of announcements) {
      if (!validateAnnouncement(ann)) {
        return json({ ok: false, error: `Invalid announcement: ${ann?.id}` }, 400)
      }
    }

    const result = await publishCmsConfig(env, 'announcements.json', {
      announcements,
      publishedAt: Date.now(),
    })

    if (!result.ok) {
      return json({ ok: false, error: result.error }, 502)
    }

    return json({ ok: true, revision: result.revision })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/**
 * POST /api/cms/events
 */
async function handleCmsEvents(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'publish') {
    const events = body?.events
    if (!Array.isArray(events)) {
      return json({ ok: false, error: 'Invalid events' }, 400)
    }

    // Valider chaque événement
    for (const evt of events) {
      if (!validateEvent(evt)) {
        return json({ ok: false, error: `Invalid event: ${evt?.id}` }, 400)
      }
    }

    const result = await publishCmsConfig(env, 'events.json', {
      events,
      publishedAt: Date.now(),
    })

    if (!result.ok) {
      return json({ ok: false, error: result.error }, 502)
    }

    return json({ ok: true, revision: result.revision })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/**
 * POST /api/cms/home
 */
async function handleCmsHome(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'save') {
    const config = body?.config
    if (!validateHomeConfig(config)) {
      return json({ ok: false, error: 'Invalid home config' }, 400)
    }

    const result = await publishCmsConfig(env, 'home.json', {
      config,
      publishedAt: Date.now(),
    })

    if (!result.ok) {
      return json({ ok: false, error: result.error }, 502)
    }

    return json({ ok: true, revision: result.revision })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/**
 * POST /api/cms/settings
 */
async function handleCmsSettings(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'save') {
    const settings = body?.settings
    if (!validateSiteSettings(settings)) {
      return json({ ok: false, error: 'Invalid settings' }, 400)
    }

    const result = await publishCmsConfig(env, 'settings.json', {
      settings,
      publishedAt: Date.now(),
    })

    if (!result.ok) {
      return json({ ok: false, error: result.error }, 502)
    }

    return json({ ok: true, revision: result.revision })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/**
 * POST /api/cms/notifications
 * 
 * Gère la programmation des notifications push
 * (sera complété avec intégration Cloudflare Workers)
 */
async function handleCmsNotifications(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'test') {
    // Teste l'envoi d'une notification
    // Note : le vrai envoi se fait depuis le client via l'API Notification
    // Ici on valide juste les paramètres
    const schedule = body?.schedule
    if (!schedule || typeof schedule.title !== 'string') {
      return json({ ok: false, error: 'Invalid schedule' }, 400)
    }

    return json({ ok: true, message: 'Test notification would be sent' })
  }

  if (action === 'schedules') {
    // Récupère/sauvegarde les programmations
    // Pour Étape 3, c'est localStorage coté client
    // Le serveur peut juste valider et stocker en KV si nécessaire
    const schedules = body?.schedules
    if (!Array.isArray(schedules)) {
      return json({ ok: false, error: 'Invalid schedules' }, 400)
    }

    // Pour l'instant, juste valider et retourner OK
    // En production, on sauvegarderait en KV pour les cron jobs
    return json({ ok: true, count: schedules.length })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/* Utilitaires */

function json(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function corsHeaders(_req: Request, _env: any): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
  }
}

function withCors(response: Response, cors: Record<string, string>): Response {
  const newHeaders = new Headers(response.headers)
  Object.entries(cors).forEach(([k, v]) => newHeaders.set(k, v))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

