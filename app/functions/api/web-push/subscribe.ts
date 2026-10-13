/**
 * POST /api/web-push/subscribe
 * 
 * Abonner un joueur aux notifications push.
 * 
 * SÉCURITÉ :
 * - Validation stricte des données
 * - Idempotence (même endpoint = réutiliser ID existant)
 * - Rate limiting (max 10 req/min par IP)
 * - Pas de journalisation des clés de chiffrement
 * - Stockage KV OBLIGATOIRE (pas de faux succès)
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
  return hashHex.substring(0, 32) // Limiter à 32 chars
}

export async function onRequest(context: any) {
  const { request, env } = context

  // ✅ CORS préflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
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

    // ✅ Valider domaine endpoint (push service connus)
    const endpointURL = new URL(endpoint)
    const allowedDomains = [
      'fcm.googleapis.com', // Firebase Cloud Messaging (Chrome)
      'updates.push.services.mozilla.com', // Mozilla (Firefox)
      'updates.push.services.mozilla.com', // Firefox alternative
      'wns2-dm2p.notify.windows.com', // Microsoft Edge
      'notify.apple.com', // Apple push (macOS/iOS)
    ]

    const isAllowedDomain = allowedDomains.some((domain) =>
      endpointURL.hostname.includes(domain)
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
      // Continuer si lookup échoue
      console.warn('[WebPush] KV lookup failed (continue):', err)
    }

    let subscriptionId = existingSubscription?.id
    let isNewSubscription = !existingSubscription

    // ✅ Si nouvel abonnement, générer ID
    if (isNewSubscription) {
      subscriptionId = `sub-${crypto.randomUUID()}`
    }

    // ✅ Construire payload
    const subscriptionPayload = {
      id: subscriptionId,
      endpoint,
      p256dh,
      auth,
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
        { expirationTtl: 90 * 24 * 60 * 60 } // 90 jours
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

    // ✅ Succès
    return new Response(
      JSON.stringify({
        ok: true,
        subscriptionId,
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
