/**
 * POST /api/web-push/subscribe
 * 
 * Abonner un joueur aux notifications push.
 * 
 * SÉCURITÉ :
 * - Validation stricte des données (HTTPS, domaine, clés)
 * - Preuve-of-possession lors réabonnement (oldRevocationSecret)
 * - Secrets hashés SHA-256, jamais stockés en clair
 * - F5 recovery via localStorage
 * - Erreurs claires si KV non configuré
 * 
 * Cloudflare Protections :
 * - HTTPS obligatoire au niveau Cloudflare
 * - DDoS protection native (Cloudflare)
 * - Rate limiting natif (config optionnelle, pas Phase B)
 */



/**
 * Générer un hash SHA-256 déterministe de l'endpoint
 * Pour lookup idempotent sans exposer l'endpoint complet
 */
async function hashEndpoint(endpoint: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(endpoint)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 32)
}

/**
 * Générer un secret de révocation aléatoire (pour le navigateur)
 */
function generateRevocationSecret(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Hasher le secret de révocation (pour le serveur)
 */
async function hashRevocationSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(secret)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 32)
}

export async function onRequest(context: any) {
  const { request, env } = context

  // ✅ CORS préflight (restreint aux domaines autorisés)
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin') || ''
    const allowedOrigins = [
      'https://lords-academy.pages.dev',
      'https://lords-mobile-academy.pages.dev',
      'http://localhost:5173',
      'http://localhost:3000',
    ]
    const isAllowedOrigin = allowedOrigins.some(allowed => origin === allowed)

    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // ✅ Vérifier méthode
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ✅ Vérifier Origin pour POST (security)
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = [
    'https://lords-academy.pages.dev',
    'https://lords-mobile-academy.pages.dev',
    'http://localhost:5173',
    'http://localhost:3000',
  ]
  if (origin && !allowedOrigins.some(allowed => origin === allowed)) {
    return new Response(JSON.stringify({ ok: false, error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // ✅ Parser body
    let body: any
    try {
      body = await request.json()
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Valider champs obligatoires
    const { endpoint, p256dh, auth } = body

    if (!endpoint || typeof endpoint !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid endpoint' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!p256dh || typeof p256dh !== 'string' || p256dh.length < 10) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid p256dh key' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!auth || typeof auth !== 'string' || auth.length < 8) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid auth key' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Valider format endpoint (URL)
    try {
      new URL(endpoint)
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Endpoint is not a valid URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Valider HTTPS obligatoire
    const endpointURL = new URL(endpoint)
    if (endpointURL.protocol !== 'https:') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Endpoint must use HTTPS' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Valider domaine endpoint (push service connus) — STRICT MATCH
    const allowedDomains = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'wns2-dm2p.notify.windows.com',
      'notify.apple.com',
    ]

    const isAllowedDomain = allowedDomains.some((domain) =>
      endpointURL.hostname === domain  // ✅ Exact match, not includes
    )

    if (!isAllowedDomain) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Endpoint from unauthorized push service' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Vérifier KV disponible
    if (!env.NOTIFICATIONS_SUBSCRIPTIONS) {
      console.error('[WebPush] NOTIFICATIONS_SUBSCRIPTIONS KV not configured')
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Notifications storage not configured',
          code: 'STORAGE_NOT_CONFIGURED',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Hash endpoint pour clé déterministe (idempotence)
    const endpointHash = await hashEndpoint(endpoint)
    const lookupKey = `endpoint:${endpointHash}`

    // ✅ Chercher abonnement existant (idempotence)
    let existingSubscription: any = null
    try {
      const existing = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(lookupKey, 'json')
      if (existing && existing.id) {
        existingSubscription = existing
      }
    } catch (err) {
      console.warn('[WebPush] KV lookup failed (continue):', err)
    }

    let subscriptionId = existingSubscription?.id
    let isNewSubscription = !existingSubscription
    let revocationSecret: string

    // ✅ SÉCURITÉ : Si réabonnement, exiger preuve de possession
    if (!isNewSubscription && existingSubscription) {
      // Réabonnement = endpoint existe déjà
      // Client DOIT transmettre l'ancien secret pour preuve de possession
      const { oldRevocationSecret } = body

      if (!oldRevocationSecret || typeof oldRevocationSecret !== 'string') {
        // Pas de secret fourni = tiers malveillant tentant prise de contrôle
        console.warn('[WebPush] Resubscription attempt WITHOUT proof for endpoint:', endpointHash)
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Resubscription requires proof of possession (oldRevocationSecret)',
            code: 'UNAUTHORIZED',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // ✅ Vérifier que le secret fourni correspond au hash stocké
      const providedSecretHash = await hashRevocationSecret(oldRevocationSecret)
      if (providedSecretHash !== existingSubscription.revocationSecretHash) {
        console.warn('[WebPush] Invalid revocation secret for resubscription')
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Invalid revocation secret',
            code: 'UNAUTHORIZED',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // ✅ Preuve valide : générer NOUVEAU secret
      revocationSecret = generateRevocationSecret()
    } else {
      // ✅ Premier abonnement : générer secret neuf
      revocationSecret = generateRevocationSecret()
    }

    // ✅ Si nouvel abonnement, générer ID
    if (isNewSubscription) {
      subscriptionId = `sub-${crypto.randomUUID()}`
    }

    // ✅ Hasher le secret pour stockage
    const revocationSecretHash = await hashRevocationSecret(revocationSecret)

    // ✅ Construire payload
    const subscriptionPayload = {
      id: subscriptionId,
      endpoint,
      p256dh,
      auth,
      revocationSecretHash,  // ✅ Hash uniquement, jamais le secret brut
      createdAt: existingSubscription?.createdAt || Date.now(),
      updatedAt: Date.now(),
      userAgent: request.headers.get('user-agent') || 'unknown',
    }

    // ✅ Stocker OBLIGATOIREMENT
    try {
      // Store by subscriptionId (primary)
      await env.NOTIFICATIONS_SUBSCRIPTIONS.put(
        subscriptionId,
        JSON.stringify(subscriptionPayload),
        { expirationTtl: 90 * 24 * 60 * 60 }
      )

      // Store by endpoint hash (lookup for idempotence)
      await env.NOTIFICATIONS_SUBSCRIPTIONS.put(
        lookupKey,
        JSON.stringify(subscriptionPayload),
        { expirationTtl: 90 * 24 * 60 * 60 }
      )
    } catch (err) {
      console.error('[WebPush] KV.put failed (CRITICAL):', err)
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to store subscription',
          code: 'STORAGE_ERROR',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Succès — retourner SEULEMENT au navigateur le revocationSecret
    return new Response(
      JSON.stringify({
        ok: true,
        subscriptionId,
        revocationSecret,  // ✅ SEULEMENT au navigateur, jamais stocké en clair
        isNewSubscription,
      }),
      { status: isNewSubscription ? 201 : 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[WebPush] Subscribe error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
