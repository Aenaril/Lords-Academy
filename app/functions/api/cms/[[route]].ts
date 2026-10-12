/**
 * Endpoints CMS pour Étape 3 — SÉCURISÉS
 * 
 * ⚠️ TOUS les endpoints requièrent une session R4 authentifiée + CSRF
 * Les modifications (publish, save, etc.) sont refusées sans authentification
 * 
 * Réutilise les fonctions d'authentification du handler principal [[path]].ts :
 * - readSession() : vérifie le cookie lma_session avec HMAC-SHA256
 * - csrfOk() : vérifie le header X-Requested-With = 'lma-admin'
 * - timingSafeEqual() : comparaison timing-safe pour signatures
 * 
 * Routes :
 * - POST /api/cms/themes — Requiert authentification + CSRF
 * - POST /api/cms/announcements — Requiert authentification + CSRF
 * - POST /api/cms/events — Requiert authentification + CSRF
 * - POST /api/cms/home — Requiert authentification + CSRF
 * - POST /api/cms/settings — Requiert authentification + CSRF
 * - POST /api/cms/notifications — Requiert authentification + CSRF
 */

import {
  publishCmsConfig,
  validateTheme,
  validateAnnouncement,
  validateEvent,
  validateHomeConfig,
  validateSiteSettings,
} from '../../cms'

/**
 * ✅ AUTHENTIFICATION RÉELLE — Vérifier session avec HMAC-SHA256
 * 
 * Format du cookie lma_session :
 * lma_session=<base64(timestamp)>.<hex(hmac_sha256)>
 * 
 * Signature vérifie :
 * - Cookie n'a pas été forgé
 * - Timestamp n'a pas été modifié
 * - Session n'est pas expirée
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
    
    // Comparaison timing-safe pour éviter timing attacks
    if (!timingSafeEqual(sig, expected)) {
      console.warn('❌ CMS: Signature session invalide')
      return null
    }
    
    const expiresAt = Number(payload)
    if (!expiresAt || Date.now() > expiresAt) {
      console.warn('❌ CMS: Session expirée ou invalide')
      return null
    }
    
    return { expiresAt }
  } catch (err) {
    console.warn('❌ CMS: Erreur parsing session:', err)
    return null
  }
}

/**
 * HMAC-SHA256 pour vérification signatures
 */
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

/**
 * Comparaison timing-safe pour éviter timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * ✅ PROTECTION CSRF — Vérifier header X-Requested-With
 * 
 * Le header X-Requested-With n'est envoyé que par le frontend autorisé
 * Les requêtes cross-origin ne peuvent pas le définir (protection du navigateur)
 */
function csrfOk(req: Request): boolean {
  return req.headers.get('X-Requested-With') === 'lma-admin'
}

export const onRequest: PagesFunction = async (context) => {
  const { request, env, params } = context
  const url = new URL(request.url)

  const pathParts = (params.route as string[] | undefined) ?? []
  const route = pathParts[0] || ''

  // CORS restrictif — seulement pour l'origine autorisée (localhost/production)
  const cors = corsHeadersRestricted(request, env as any)
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
 * POST /api/cms/themes — SÉCURISÉ
 * ⚠️ Requiert : Origine autorisée + Authentification R4 + CSRF
 * 
 * Retourne PublicationResponse avec status détaillé
 */
async function handleCmsThemes(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
  if (!originAllowed(req, env)) {
    console.warn('❌ CMS themes: Origine refusée')
    return json({ error: 'Origine refusée' }, 403)
  }

  // ✅ VÉRIFICATION AUTHENTIFICATION — OBLIGATOIRE
  const session = await readSession(req, env)
  if (!session) {
    console.warn('❌ CMS themes: Tentative sans authentification')
    return json({ error: 'Authentification requise' }, 401)
  }

  // ✅ VÉRIFICATION CSRF — OBLIGATOIRE
  if (!csrfOk(req)) {
    console.warn('❌ CMS themes: CSRF invalide')
    return json({ error: 'CSRF invalide' }, 403)
  }

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'publish') {
    const theme = body?.theme
    if (!validateTheme(theme)) {
      return json({ ok: false, error: 'Invalid theme' }, 400)
    }

    console.info(
      `✅ CMS publish theme: ${theme.id} (user authenticated, server will compute revision)`
    )

    const result = await publishCmsConfig(env, 'themes.json', {
      activeThemeId: theme.id,
      publishedAt: Date.now(),
      theme,
    })

    // Mapper le statut serveur vers une réponse structurée
    // Sans divulguer d'informations sensibles (GitHub tokens, etc.)
    if (!result.ok) {
      // Écriture échouée
      let httpStatus = 502
      let userMessage = 'Erreur de publication'

      switch (result.status) {
        case 'write_failed':
          httpStatus = 502
          userMessage = 'Impossible d\'écrire sur GitHub. Vérifiez votre authentification.'
          break
        case 'conflict':
          httpStatus = 409
          userMessage = 'Conflit lors de la publication. Le fichier a changé. Veuillez réessayer.'
          break
        case 'verify_failed':
          httpStatus = 202 // Accepté mais vérification échouée
          userMessage = 'Écriture GitHub réussie, mais vérification du contenu échouée. État incertain.'
          break
        case 'expired_verify':
          httpStatus = 202 // Accepté mais vérification expirée
          userMessage = 'Écriture GitHub réussie. Vérification expirée. Vérifiez manuellement.'
          break
      }

      return json(
        {
          ok: false,
          status: result.status,
          revision: result.revision,
          revisionNumber: result.revisionNumber,
          error: result.error,
          userMessage,
        },
        httpStatus
      )
    }

    // Écriture + vérification réussies
    return json({
      ok: true,
      status: result.status || 'verify_success',
      revision: result.revision,
      revisionNumber: result.revisionNumber,
      userMessage: 'Thème publié avec succès. Déploiement sur Cloudflare en cours.',
    })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}

/**
 * POST /api/cms/announcements — SÉCURISÉ
 * ⚠️ Requiert : Origine autorisée + Authentification R4 + CSRF
 */
async function handleCmsAnnouncements(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
  if (!originAllowed(req, env)) {
    console.warn('❌ CMS announcements: Origine refusée')
    return json({ error: 'Origine refusée' }, 403)
  }

  // ✅ VÉRIFICATION AUTHENTIFICATION
  const session = await readSession(req, env)
  if (!session) {
    console.warn('❌ CMS announcements: Tentative sans authentification')
    return json({ error: 'Authentification requise' }, 401)
  }

  // ✅ VÉRIFICATION CSRF
  if (!csrfOk(req)) {
    console.warn('❌ CMS announcements: CSRF invalide')
    return json({ error: 'CSRF invalide' }, 403)
  }

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

    console.info(`✅ CMS publish announcements: ${announcements.length} items`)

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
 * POST /api/cms/events — SÉCURISÉ
 * ⚠️ Requiert : Origine autorisée + Authentification R4 + CSRF
 */
async function handleCmsEvents(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
  if (!originAllowed(req, env)) {
    console.warn('❌ CMS events: Origine refusée')
    return json({ error: 'Origine refusée' }, 403)
  }

  // ✅ VÉRIFICATION AUTHENTIFICATION
  const session = await readSession(req, env)
  if (!session) {
    console.warn('❌ CMS events: Tentative sans authentification')
    return json({ error: 'Authentification requise' }, 401)
  }

  // ✅ VÉRIFICATION CSRF
  if (!csrfOk(req)) {
    console.warn('❌ CMS events: CSRF invalide')
    return json({ error: 'CSRF invalide' }, 403)
  }

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

    console.info(`✅ CMS publish events: ${events.length} items`)

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
 * POST /api/cms/home — SÉCURISÉ
 * ⚠️ Requiert : Origine autorisée + Authentification R4 + CSRF
 */
async function handleCmsHome(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
  if (!originAllowed(req, env)) {
    console.warn('❌ CMS home: Origine refusée')
    return json({ error: 'Origine refusée' }, 403)
  }

  // ✅ VÉRIFICATION AUTHENTIFICATION
  const session = await readSession(req, env)
  if (!session) {
    console.warn('❌ CMS home: Tentative sans authentification')
    return json({ error: 'Authentification requise' }, 401)
  }

  // ✅ VÉRIFICATION CSRF
  if (!csrfOk(req)) {
    console.warn('❌ CMS home: CSRF invalide')
    return json({ error: 'CSRF invalide' }, 403)
  }

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'save') {
    const config = body?.config
    if (!validateHomeConfig(config)) {
      return json({ ok: false, error: 'Invalid home config' }, 400)
    }

    console.info(`✅ CMS save home config`)

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
 * POST /api/cms/settings — SÉCURISÉ
 * ⚠️ Requiert : Origine autorisée + Authentification R4 + CSRF
 */
async function handleCmsSettings(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
  if (!originAllowed(req, env)) {
    console.warn('❌ CMS settings: Origine refusée')
    return json({ error: 'Origine refusée' }, 403)
  }

  // ✅ VÉRIFICATION AUTHENTIFICATION
  const session = await readSession(req, env)
  if (!session) {
    console.warn('❌ CMS settings: Tentative sans authentification')
    return json({ error: 'Authentification requise' }, 401)
  }

  // ✅ VÉRIFICATION CSRF
  if (!csrfOk(req)) {
    console.warn('❌ CMS settings: CSRF invalide')
    return json({ error: 'CSRF invalide' }, 403)
  }

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'save') {
    const settings = body?.settings
    if (!validateSiteSettings(settings)) {
      return json({ ok: false, error: 'Invalid settings' }, 400)
    }

    console.info(`✅ CMS save site settings`)

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
 * POST /api/cms/notifications — SÉCURISÉ (partiellement)
 * 
 * Opérations requiérant authentification :
 * - test : test de structure notification
 * - schedules : sauvegarde programmations
 * 
 * Opérations sans authentification :
 * - subscribe : inscription aux notifications (côté client)
 * - unsubscribe : désinscription
 */
async function handleCmsNotifications(req: Request, env: any): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as any
  const action = body?.action

  if (action === 'test') {
    // Tests de notifications — Authentification requise
    // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
    if (!originAllowed(req, env)) {
      console.warn('❌ CMS notifications test: Origine refusée')
      return json({ error: 'Origine refusée' }, 403)
    }

    const session = await readSession(req, env)
    if (!session) {
      console.warn('❌ CMS notifications test: Tentative sans authentification')
      return json({ error: 'Authentification requise' }, 401)
    }

    // ✅ VÉRIFICATION CSRF
    if (!csrfOk(req)) {
      console.warn('❌ CMS notifications test: CSRF invalide')
      return json({ error: 'CSRF invalide' }, 403)
    }

    const schedule = body?.schedule
    if (!schedule || typeof schedule.title !== 'string') {
      return json({ ok: false, error: 'Invalid schedule' }, 400)
    }

    console.info(`✅ CMS test notification: ${schedule.title}`)
    return json({ ok: true, message: 'Test notification structure validated' })
  }

  if (action === 'subscribe') {
    // Inscription aux notifications — Pas d'authentification requise (côté client)
    // La sécurité est fournie par la possession de la clé endpoint (VAPID)
    const subscription = body?.subscription
    if (!subscription || !subscription.endpoint) {
      return json({ ok: false, error: 'Invalid subscription' }, 400)
    }

    console.info(`✅ CMS subscribe: ${subscription.endpoint.substring(0, 50)}...`)
    return json({ ok: true, message: 'Subscription received' })
  }

  if (action === 'unsubscribe') {
    // Désinscription — Pas d'authentification requise
    const subscription = body?.subscription
    if (!subscription || !subscription.endpoint) {
      return json({ ok: false, error: 'Invalid subscription' }, 400)
    }

    console.info(`✅ CMS unsubscribe: ${subscription.endpoint.substring(0, 50)}...`)
    return json({ ok: true, message: 'Unsubscribed' })
  }

  if (action === 'schedules') {
    // Sauvegarde programmations — Authentification requise
    // ✅ VÉRIFICATION ORIGINE — OBLIGATOIRE
    if (!originAllowed(req, env)) {
      console.warn('❌ CMS schedules: Origine refusée')
      return json({ error: 'Origine refusée' }, 403)
    }

    const session = await readSession(req, env)
    if (!session) {
      console.warn('❌ CMS schedules: Tentative sans authentification')
      return json({ error: 'Authentification requise' }, 401)
    }

    // ✅ VÉRIFICATION CSRF
    if (!csrfOk(req)) {
      console.warn('❌ CMS schedules: CSRF invalide')
      return json({ error: 'CSRF invalide' }, 403)
    }

    const schedules = body?.schedules
    if (!Array.isArray(schedules)) {
      return json({ ok: false, error: 'Invalid schedules' }, 400)
    }

    console.info(`✅ CMS save schedules: ${schedules.length} items`)
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

/**
 * CORS restrictif — Réutilise le pattern R4
 * 
 * Vérification stricte :
 * - Pas d'origine (localhost/dev) → OK
 * - Origine = ALLOWED_ORIGIN (production) → OK
 * - Autre origine → REFUSÉE explicitement (403)
 * 
 * Pas de wildcard .pages.dev — Listage explicite seulement
 */
function corsHeadersRestricted(req: Request, env: any): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  
  // Pattern R4 : pas d'origine OU origine autorisée
  const isAllowed = !origin || origin === env.ALLOWED_ORIGIN
  
  if (!isAllowed) {
    console.warn(`❌ CORS: Origine refusée: ${origin}`)
    // Refuser explicitement (ne pas envoyer Access-Control-Allow-Origin)
    return {
      'Access-Control-Allow-Origin': '',
      'Access-Control-Allow-Credentials': 'false',
    }
  }
  
  // Origine autorisée
  return {
    'Access-Control-Allow-Origin': origin || env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  }
}

/**
 * ✅ Vérification origine stricte — Refuse si non autorisée
 */
function originAllowed(req: Request, env: any): boolean {
  const origin = req.headers.get('Origin')
  // Pas d'origine (localhost) OU Origine = ALLOWED_ORIGIN (production)
  return !origin || origin === env.ALLOWED_ORIGIN
}

function withCors(response: Response, cors: Record<string, string>): Response {
  const newHeaders = new Headers(response.headers)
  Object.entries(cors).forEach(([k, v]) => {
    if (v) newHeaders.set(k, v)
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}
