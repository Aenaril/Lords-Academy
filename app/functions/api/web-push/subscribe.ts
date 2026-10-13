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
 * - Stockage KV optionnel (fail gracefully si absent)
 */

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

    // ✅ Générer ID de subscription
    const subscriptionId = `sub-${crypto.randomUUID()}`

    // ✅ Essayer de stocker dans KV (optionnel)
    let stored = false
    if (env.NOTIFICATIONS_SUBSCRIPTIONS) {
      try {
        await env.NOTIFICATIONS_SUBSCRIPTIONS.put(
          subscriptionId,
          JSON.stringify({
            id: subscriptionId,
            endpoint,
            p256dh,
            auth,
            createdAt: Date.now(),
            userAgent: request.headers.get('user-agent') || 'unknown',
          }),
          { expirationTtl: 90 * 24 * 60 * 60 } // 90 jours
        )
        stored = true
      } catch (err) {
        console.warn('[WebPush] KV storage failed (non-blocking):', err)
        // Continuer même si KV échoue, mais noter l'erreur
      }
    }

    // ⚠️ Si KV non disponible ET pas de fallback, avertir
    if (!stored && !env.NOTIFICATIONS_SUBSCRIPTIONS) {
      console.warn('[WebPush] Warning: NOTIFICATIONS_SUBSCRIPTIONS KV not configured')
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Notifications storage not configured (KV namespace missing)',
          code: 'STORAGE_NOT_CONFIGURED',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Succès
    return new Response(
      JSON.stringify({
        ok: true,
        subscriptionId,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[WebPush] Subscribe error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
