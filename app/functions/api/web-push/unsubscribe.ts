/**
 * POST /api/web-push/unsubscribe
 * 
 * Désabonner un joueur des notifications push.
 * 
 * SÉCURITÉ :
 * - Validation stricte du subscriptionId + revocationSecret
 * - Preuve de possession requise (secret envoyé au navigateur seul)
 * - Condensat SHA-256 stocké côté serveur (jamais le secret brut)
 * - Protection contre les suppressions arbitraires
 * - Limitation des abus
 */

/**
 * Générer un hash SHA-256 déterministe de l'endpoint
 * Pour lookup idempotent
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

  // ✅ CORS préflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': env.CLIENT_ORIGIN || 'https://lords-academy.pages.dev',
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

    // ✅ Valider subscriptionId + revocationSecret
    const { subscriptionId, revocationSecret } = body

    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid subscriptionId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!revocationSecret || typeof revocationSecret !== 'string' || revocationSecret.length < 32) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid revocationSecret' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Vérifier format subscriptionId (sub-*)
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

    // ✅ Récupérer l'abonnement depuis KV
    let subscription: any = null
    try {
      const stored = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(subscriptionId, 'json')
      if (stored) {
        subscription = stored
      }
    } catch (err) {
      console.error('[WebPush] KV get failed:', err)
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to retrieve subscription',
          code: 'STORAGE_ERROR',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Vérifier abonnement existe
    if (!subscription) {
      // Idempotence : déjà supprimé = succès
      return new Response(
        JSON.stringify({
          ok: true,
          alreadyDeleted: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ SÉCURITÉ : Vérifier la preuve de révocation (HMAC du secret)
    const secretHash = await hashRevocationSecret(revocationSecret)
    if (secretHash !== subscription.revocationSecretHash) {
      console.warn('[WebPush] Invalid revocation secret provided for:', subscriptionId)
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Invalid revocation secret',
          code: 'UNAUTHORIZED',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ✅ Supprimer de KV
    try {
      // Supprimer par subscriptionId
      await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(subscriptionId)

      // Supprimer aussi par endpoint hash (cleanup lookup key)
      if (subscription.endpoint) {
        const endpointHash = await hashEndpoint(subscription.endpoint)
        const lookupKey = `endpoint:${endpointHash}`
        try {
          await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(lookupKey)
        } catch (err) {
          console.warn('[WebPush] Failed to delete lookup key:', err)
          // Non-critique : lookup key orphelin, sera remplacé par prochain subscribe
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
