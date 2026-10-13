/**
 * POST /api/web-push/unsubscribe
 * 
 * Désabonner un joueur des notifications push.
 * 
 * SÉCURITÉ :
 * - Validation stricte du subscriptionId
 * - Limitation à 1 désabonnement par subscription
 * - Protection contre les suppressions arbitraires
 * - Stockage KV OBLIGATOIRE (pas de faux succès)
 */

/**
 * Générer un hash SHA-256 déterministe de l'endpoint
 * Pour cleanup lookup key lors du désabonnement
 */
async function hashEndpoint(endpoint: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(endpoint)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 32)
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

    // ✅ Supprimer de KV
    try {
      // Vérifier que la clé existe (protection contre suppressions arbitraires)
      const existing = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(subscriptionId)
      if (!existing) {
        // ✅ Idempotence : déjà supprimé = succès
        return new Response(
          JSON.stringify({
            ok: true,
            alreadyDeleted: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Supprimer par subscriptionId
      await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(subscriptionId)

      // Trouver et supprimer aussi par endpoint hash (cleanup lookup key)
      // Parse existing to get endpoint
      const subscription = JSON.parse(existing)
      if (subscription.endpoint) {
        const endpointHash = await hashEndpoint(subscription.endpoint)
        const lookupKey = `endpoint:${endpointHash}`
        try {
          await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(lookupKey)
        } catch (err) {
          console.warn('[WebPush] Failed to delete lookup key:', err)
          // Non-critique, continuer
        }
      }
    } catch (err) {
      console.error('[WebPush] KV delete failed (CRITICAL):', err)
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to delete subscription',
          code: 'STORAGE_ERROR',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Succès
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
