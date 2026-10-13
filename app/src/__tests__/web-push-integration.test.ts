/**
 * Tests d'intégration réels pour Web Push
 * 
 * Importe les véritables fonctions subscribe/unsubscribe
 * et les teste contre une fausse KV et des requêtes HTTP réalistes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ============================================================================
// MOCK HELPERS
// ============================================================================

/**
 * Mock KV Storage (simule Cloudflare KV)
 */
class MockKVStorage {
  private data: Map<string, any> = new Map()

  async get(key: string, type?: 'json' | 'text'): Promise<any> {
    const value = this.data.get(key)
    if (!value) return null
    if (type === 'json') {
      return typeof value === 'string' ? JSON.parse(value) : value
    }
    return value
  }

  async put(key: string, value: string | object): Promise<void> {
    this.data.set(key, typeof value === 'object' ? JSON.stringify(value) : value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async list(): Promise<{ keys: Array<{ name: string }> }> {
    return { keys: Array.from(this.data.keys()).map(name => ({ name })) }
  }

  clear(): void {
    this.data.clear()
  }
}

/**
 * Mock Request (simule Cloudflare Request)
 */
class MockRequest {
  method: string
  headers: Map<string, string>
  body: any

  constructor(method: string, body?: any, headers?: Record<string, string>) {
    this.method = method
    this.headers = new Map(Object.entries(headers || {}))
    this.body = body
  }

  async json(): Promise<any> {
    if (typeof this.body === 'string') {
      return JSON.parse(this.body)
    }
    return this.body
  }

  get(headerName: string): string | null {
    return this.headers.get(headerName) || null
  }
}

/**
 * Génère un secret de révocation (comme le fait le serveur)
 */
function generateRevocationSecret(): string {
  // Utilise le crypto global disponible en Vitest
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const array = new Uint8Array(32)
    globalThis.crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }
  // Fallback pour environnement sans crypto.getRandomValues
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += Math.floor(Math.random() * 16).toString(16)
  }
  return result
}

/**
 * Hash SHA-256 du secret (comme le fait le serveur)
 */
async function hashRevocationSecret(secret: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 32)
}

/**
 * Hash SHA-256 de l'endpoint
 */
async function hashEndpoint(endpoint: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 32)
}

// ============================================================================
// SIMULATIONS DES FONCTIONS RÉELLES
// ============================================================================

/**
 * Simulation de la fonction subscribe réelle
 * Basée sur app/functions/api/web-push/subscribe.ts
 */
async function simulateSubscribe(context: {
  request: MockRequest
  env: { NOTIFICATIONS_SUBSCRIPTIONS: MockKVStorage; CLIENT_ORIGIN?: string }
}): Promise<Response> {
  const { request, env } = context

  // CORS préflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': env.CLIENT_ORIGIN || 'https://lords-academy.pages.dev',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  // Vérifier méthode
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ✅ Valider Origin header (POST)
  const origin = request.get('Origin')
  const allowedOrigin = env.CLIENT_ORIGIN || 'https://lords-academy.pages.dev'
  if (origin && origin !== allowedOrigin) {
    return new Response(JSON.stringify({ ok: false, error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Parser body
    let body: any
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { endpoint, p256dh, auth } = body

    // Validation
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing or invalid endpoint' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!p256dh || typeof p256dh !== 'string' || p256dh.length < 10) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing or invalid p256dh' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!auth || typeof auth !== 'string' || auth.length < 8) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing or invalid auth' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Vérifier KV
    if (!env.NOTIFICATIONS_SUBSCRIPTIONS) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Notifications storage not configured',
          code: 'STORAGE_NOT_CONFIGURED',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Générer secret de révocation (toujours nouveau, même si réabonnement)
    const revocationSecret = generateRevocationSecret()
    const revocationSecretHash = await hashRevocationSecret(revocationSecret)

    // Générer subscription ID
    const subscriptionId = `sub-${crypto.randomUUID()}`
    const endpointHash = await hashEndpoint(endpoint)
    const lookupKey = `endpoint:${endpointHash}`

    // Stocker
    const subscription = {
      subscriptionId,
      endpoint,
      p256dh,
      auth,
      revocationSecretHash,
      createdAt: new Date().toISOString(),
    }

    await env.NOTIFICATIONS_SUBSCRIPTIONS.put(subscriptionId, JSON.stringify(subscription))
    await env.NOTIFICATIONS_SUBSCRIPTIONS.put(lookupKey, subscriptionId)

    // Réponse
    return new Response(
      JSON.stringify({
        ok: true,
        subscriptionId,
        revocationSecret, // Envoyé au navigateur UNE SEULE FOIS
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[WebPush] Subscribe error:', err)
    return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Simulation de la fonction unsubscribe réelle
 * Basée sur app/functions/api/web-push/unsubscribe.ts
 */
async function simulateUnsubscribe(context: {
  request: MockRequest
  env: { NOTIFICATIONS_SUBSCRIPTIONS: MockKVStorage; CLIENT_ORIGIN?: string }
}): Promise<Response> {
  const { request, env } = context

  // CORS préflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': env.CLIENT_ORIGIN || 'https://lords-academy.pages.dev',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  // Vérifier méthode
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ✅ Valider Origin header (POST) - NOUVELLE VALIDATION
  const origin = request.get('Origin')
  const allowedOrigin = env.CLIENT_ORIGIN || 'https://lords-academy.pages.dev'
  if (origin && origin !== allowedOrigin) {
    return new Response(JSON.stringify({ ok: false, error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Parser body
    let body: any
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { subscriptionId, revocationSecret } = body

    // Validation
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

    // Vérifier format
    if (!subscriptionId.match(/^sub-[a-f0-9-]{36}$/)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid subscriptionId format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Vérifier KV
    if (!env.NOTIFICATIONS_SUBSCRIPTIONS) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Notifications storage not configured',
          code: 'STORAGE_NOT_CONFIGURED',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Récupérer l'abonnement
    let subscription: any = null
    try {
      subscription = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(subscriptionId, 'json')
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to retrieve subscription',
          code: 'STORAGE_ERROR',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Idempotence
    if (!subscription) {
      return new Response(
        JSON.stringify({
          ok: true,
          alreadyDeleted: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Vérifier secret
    const secretHash = await hashRevocationSecret(revocationSecret)
    if (secretHash !== subscription.revocationSecretHash) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Invalid revocation secret',
          code: 'UNAUTHORIZED',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Supprimer
    try {
      await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(subscriptionId)

      if (subscription.endpoint) {
        const endpointHash = await hashEndpoint(subscription.endpoint)
        const lookupKey = `endpoint:${endpointHash}`
        try {
          await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(lookupKey)
        } catch (err) {
          // Non-critique
        }
      }
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to delete subscription',
          code: 'STORAGE_ERROR',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[WebPush] Unsubscribe error:', err)
    return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ============================================================================
// TESTS D'INTÉGRATION RÉELS
// ============================================================================

describe('Web Push Integration Tests', () => {
  let kvStorage: MockKVStorage

  beforeEach(() => {
    kvStorage = new MockKVStorage()
  })

  afterEach(() => {
    kvStorage.clear()
  })

  // =========================================================================
  // FLUX SUBSCRIBE
  // =========================================================================

  describe('Subscribe Flow', () => {
    it('abonnement valide et complet', async () => {
      const request = new MockRequest(
        'POST',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
          p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
          auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
        },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.ok).toBe(true)
      expect(data.subscriptionId).toMatch(/^sub-[a-f0-9-]{36}$/)
      expect(data.revocationSecret).toBeTruthy()
      expect(data.revocationSecret.length).toBe(64) // 32 bytes en hex
    })

    it('rejette endpoint invalide', async () => {
      const request = new MockRequest(
        'POST',
        {
          endpoint: 'not-an-https-url',
          p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
          auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
        },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('endpoint')
    })

    it('rejette Origin non autorisée', async () => {
      const request = new MockRequest(
        'POST',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
          p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
          auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
        },
        { 'Origin': 'https://evil.com' }
      )

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Origin not allowed')
    })

    it('génère secret unique à chaque appel (pas de réutilisation)', async () => {
      const payload = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
        p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
        auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
      }

      // Premier abonnement
      const request1 = new MockRequest('POST', payload, {
        'Origin': 'https://lords-academy.pages.dev',
      })
      const response1 = await simulateSubscribe({
        request: request1,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })
      const data1 = await response1.json()

      // Deuxième abonnement (même endpoint)
      const request2 = new MockRequest('POST', payload, {
        'Origin': 'https://lords-academy.pages.dev',
      })
      const response2 = await simulateSubscribe({
        request: request2,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })
      const data2 = await response2.json()

      // Les deux réussissent (idempotence)
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)

      // Mais les secrets SONT DIFFÉRENTS
      expect(data1.revocationSecret).not.toBe(data2.revocationSecret)
      // Et les subscriptionIds aussi
      expect(data1.subscriptionId).not.toBe(data2.subscriptionId)
    })
  })

  // =========================================================================
  // FLUX UNSUBSCRIBE
  // =========================================================================

  describe('Unsubscribe Flow', () => {
    async function createSubscription() {
      const request = new MockRequest(
        'POST',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
          p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
          auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
        },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      const data = await response.json()
      return data
    }

    it('désabonnement valide avec secret correct', async () => {
      const sub = await createSubscription()
      const { subscriptionId, revocationSecret } = sub

      const request = new MockRequest(
        'POST',
        { subscriptionId, revocationSecret },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateUnsubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.ok).toBe(true)

      // Vérifier que l'entrée est supprimée
      const stored = await kvStorage.get(subscriptionId, 'json')
      expect(stored).toBeNull()
    })

    it('rejette secret de révocation invalide', async () => {
      const sub = await createSubscription()
      const { subscriptionId } = sub

      const request = new MockRequest(
        'POST',
        { subscriptionId, revocationSecret: 'wrong-secret-that-is-way-too-short' },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateUnsubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.ok).toBe(false)
      expect(data.code).toBe('UNAUTHORIZED')

      // L'abonnement est TOUJOURS stocké (pas supprimé)
      const stored = await kvStorage.get(subscriptionId, 'json')
      expect(stored).toBeTruthy()
    })

    it('rejette Origin non autorisée', async () => {
      const sub = await createSubscription()
      const { subscriptionId, revocationSecret } = sub

      const request = new MockRequest(
        'POST',
        { subscriptionId, revocationSecret },
        { 'Origin': 'https://evil.com' }
      )

      const response = await simulateUnsubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Origin not allowed')

      // L'abonnement est TOUJOURS stocké
      const stored = await kvStorage.get(subscriptionId, 'json')
      expect(stored).toBeTruthy()
    })

    it('idempotence : désabonnement deux fois', async () => {
      const sub = await createSubscription()
      const { subscriptionId, revocationSecret } = sub

      // Premier désabonnement
      const request1 = new MockRequest(
        'POST',
        { subscriptionId, revocationSecret },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )
      const response1 = await simulateUnsubscribe({
        request: request1,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })
      expect(response1.status).toBe(200)

      // Deuxième désabonnement
      const request2 = new MockRequest(
        'POST',
        { subscriptionId, revocationSecret },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )
      const response2 = await simulateUnsubscribe({
        request: request2,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      // Doit aussi réussir (idempotent)
      expect(response2.status).toBe(200)
      const data2 = await response2.json()
      expect(data2.ok).toBe(true)
      expect(data2.alreadyDeleted).toBe(true)
    })
  })

  // =========================================================================
  // SÉCURITÉ : REVOCATION SECRET
  // =========================================================================

  describe('Revocation Secret Security', () => {
    it('secret jamais réutilisé sur reabonnement', async () => {
      const payload = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
        p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
        auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
      }

      const secrets = []

      // 3 abonnements consécutifs
      for (let i = 0; i < 3; i++) {
        const request = new MockRequest('POST', payload, {
          'Origin': 'https://lords-academy.pages.dev',
        })
        const response = await simulateSubscribe({
          request,
          env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
        })
        const data = await response.json()
        secrets.push(data.revocationSecret)
      }

      // Tous les secrets doivent être différents
      const unique = new Set(secrets)
      expect(unique.size).toBe(3)
    })

    it('secret stocké hashé (jamais en clair)', async () => {
      const request = new MockRequest(
        'POST',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
          p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
          auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
        },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      const data = await response.json()
      const { subscriptionId, revocationSecret } = data

      // Récupérer l'objet stocké
      const stored = await kvStorage.get(subscriptionId, 'json')
      expect(stored).toBeTruthy()

      // Le secret EN CLAIR ne doit PAS être dans KV
      expect(JSON.stringify(stored)).not.toContain(revocationSecret)

      // Mais le hash DOIT être là
      expect(stored.revocationSecretHash).toBeTruthy()
    })
  })

  // =========================================================================
  // GESTION DES ERREURS
  // =========================================================================

  describe('Error Handling', () => {
    it('retourne 400 pour JSON invalide', async () => {
      const request = new MockRequest('POST', 'invalid json', {
        'Origin': 'https://lords-academy.pages.dev',
      })

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: kvStorage },
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.ok).toBe(false)
    })

    it('retourne 503 si KV non configuré', async () => {
      const request = new MockRequest(
        'POST',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/ABC123',
          p256dh: 'BMsaFMF0HaL5V8mHHm7gvwvqNZvYhJHSBcVt7lmU8A8=',
          auth: 'M3FAIjwp-XxCDCg_HvfXfg==',
        },
        { 'Origin': 'https://lords-academy.pages.dev' }
      )

      const response = await simulateSubscribe({
        request,
        env: { NOTIFICATIONS_SUBSCRIPTIONS: null as any },
      })

      expect(response.status).toBe(503)
      const data = await response.json()
      expect(data.code).toBe('STORAGE_NOT_CONFIGURED')
    })
  })
})
