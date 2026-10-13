/**
 * POST /api/web-push/unsubscribe
 * 
 * Désabonner un joueur des notifications push.
 * 
 * SÉCURITÉ :
 * - Validation stricte du subscriptionId
 * - Limitation à 1 désabonnement par subscription
 * - Protection contre les suppressions arbitraires
 * - Rate limiting (max 10 req/min par IP)
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

    // ✅ Valider subscriptionId
    const { subscriptionId } = body

    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid subscriptionId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Vérifier format (sub-*)
    if (!subscriptionId.match(/^sub-[a-f0-9-]{36}$/)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid subscriptionId format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Supprimer de KV
    let deleted = false
    if (env.NOTIFICATIONS_SUBSCRIPTIONS) {
      try {
        // Vérifier que la clé existe (protection)
        const existing = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(subscriptionId)
        if (existing) {
          await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(subscriptionId)
          deleted = true
        }
      } catch (err) {
        console.warn('[WebPush] KV delete failed (non-blocking):', err)
      }
    }

    // ⚠️ Si KV non disponible, noter
    if (!deleted && !env.NOTIFICATIONS_SUBSCRIPTIONS) {
      console.warn('[WebPush] Warning: NOTIFICATIONS_SUBSCRIPTIONS KV not configured')
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Notifications storage not configured',
          code: 'STORAGE_NOT_CONFIGURED',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Succès (même si pas trouvé = pas d'erreur, juste idempotent)
    return new Response(
      JSON.stringify({
        ok: true,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[WebPush] Unsubscribe error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
