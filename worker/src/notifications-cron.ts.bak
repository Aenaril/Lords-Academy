/**
 * Cloudflare Worker — Cron Job pour Notifications Push
 * 
 * Programmation : Toutes les 5 minutes
 * Fonction : Vérifier les rappels à envoyer et envoyer les notifications
 * 
 * Rappels types :
 * - H-24 heures
 * - H-3 heures  
 * - H-30 minutes
 */

interface NotificationSchedule {
  id: string
  eventId: string
  eventName: string
  title: string
  message: string
  imageUrl?: string
  timing: 'relative' | 'absolute'
  relativeDelay?: string // '-24h', '-3h', '-30m'
  absoluteTime?: number
  nextSendTime?: number
  sentAt?: number
  status: 'pending' | 'sent' | 'failed'
}

interface PushSubscription {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

interface Env {
  NOTIFICATIONS_SUBSCRIPTIONS: KVNamespace
  NOTIFICATIONS_PENDING: KVNamespace
  NOTIFICATIONS_LOGS: KVNamespace
  VAPID_PRIVATE_KEY: string
  VAPID_PUBLIC_KEY: string
}

/**
 * Handler principal du Worker
 * S'exécute toutes les 5 minutes via cron trigger
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Endpoint pour tests/debug
    const url = new URL(request.url)

    if (url.pathname === '/test') {
      return await handleTestNotification(request, env)
    }

    return new Response('OK', { status: 200 })
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log('Cron job: Vérification des notifications à envoyer')

    try {
      await processNotificationSchedules(env)
    } catch (err) {
      console.error('Erreur lors du traitement des notifications:', err)
      await logError(env, err)
    }
  },
}

/**
 * Traiter les programmations de notifications
 */
async function processNotificationSchedules(env: Env): Promise<void> {
  const now = Date.now()

  // Énumérer les programmations en attente
  const list = await env.NOTIFICATIONS_PENDING.list({ prefix: 'event:' })

  for (const key of list.keys) {
    try {
      const scheduleData = await env.NOTIFICATIONS_PENDING.get(key.name, 'json')
      if (!scheduleData) continue

      const schedule = scheduleData as NotificationSchedule
      const sendTime = calculateSendTime(schedule, now)

      // Vérifier si c'est l'heure d'envoyer
      if (now >= sendTime && schedule.status === 'pending') {
        // Charger les subscriptions
        const subscriptions = await getSubscriptions(env)
        if (subscriptions.length === 0) {
          console.log(`Pas de subscriptions pour l'événement ${schedule.eventId}`)
          continue
        }

        // Envoyer les notifications
        const results = await sendNotifications(schedule, subscriptions, env)
        const successCount = results.filter((r) => r.success).length
        const failCount = results.filter((r) => !r.success).length

        console.log(
          `Envoi ${schedule.eventId}: ${successCount} réussi(s), ${failCount} échoué(s)`
        )

        // Marquer comme envoyé
        schedule.status = successCount > 0 ? 'sent' : 'failed'
        schedule.sentAt = now
        await env.NOTIFICATIONS_PENDING.put(key.name, JSON.stringify(schedule))

        // Logger
        await logNotificationSent(env, schedule, successCount, failCount)
      }
    } catch (err) {
      console.error(`Erreur traitement ${key.name}:`, err)
    }
  }
}

/**
 * Calculer l'heure d'envoi d'une programmation
 */
function calculateSendTime(schedule: NotificationSchedule, now: number): number {
  if (schedule.timing === 'absolute' && schedule.absoluteTime) {
    return schedule.absoluteTime
  }

  if (schedule.timing === 'relative' && schedule.relativeDelay) {
    // Récupérer l'heure d'événement depuis la clé
    // Format: event:{eventId}@{startTime}
    const startTimeStr = new URL(`http://localhost${schedule.relativeDelay}`).hostname
    // Fallback: utiliser une valeur stockée
    const eventStartTime = schedule.nextSendTime || now // À améliorer

    const delay = parseRelativeDelay(schedule.relativeDelay)
    return eventStartTime - Math.abs(delay)
  }

  return now + 999999999 // Très loin dans le futur (ne pas envoyer)
}

/**
 * Parser un délai relatif ('-24h', '-3h', '-30m')
 */
function parseRelativeDelay(delay: string): number {
  const match = delay.match(/^-(\d+)([hm])$/)
  if (!match) return 0

  const [_, value, unit] = match
  const numValue = parseInt(value, 10)

  if (unit === 'h') {
    return numValue * 60 * 60 * 1000 // heures en ms
  } else if (unit === 'm') {
    return numValue * 60 * 1000 // minutes en ms
  }

  return 0
}

/**
 * Récupérer toutes les subscriptions
 */
async function getSubscriptions(env: Env): Promise<PushSubscription[]> {
  const list = await env.NOTIFICATIONS_SUBSCRIPTIONS.list()
  const subscriptions: PushSubscription[] = []

  for (const key of list.keys) {
    try {
      const data = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(key.name, 'json')
      if (data) {
        subscriptions.push(data)
      }
    } catch (err) {
      console.error(`Erreur lors de la récupération de ${key.name}:`, err)
    }
  }

  return subscriptions
}

/**
 * Envoyer les notifications push
 */
async function sendNotifications(
  schedule: NotificationSchedule,
  subscriptions: PushSubscription[],
  env: Env
): Promise<Array<{ endpoint: string; success: boolean; error?: string }>> {
  const results: Array<{ endpoint: string; success: boolean; error?: string }> = []

  const payload = JSON.stringify({
    title: schedule.title,
    body: schedule.message,
    icon: schedule.imageUrl || '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `event-${schedule.eventId}`,
    requireInteraction: false,
    data: {
      eventId: schedule.eventId,
      url: `/tutorials/${schedule.eventId}`,
    },
  })

  for (const subscription of subscriptions) {
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'TTL': '86400', // 24h
        },
        body: payload, // Simplifié — en produit, utiliser cryptographie ECDH/AES
      })

      if (response.ok) {
        results.push({ endpoint: subscription.endpoint, success: true })
      } else {
        results.push({
          endpoint: subscription.endpoint,
          success: false,
          error: `HTTP ${response.status}`,
        })

        // Supprimer subscription invalide
        if (response.status === 410) {
          await env.NOTIFICATIONS_SUBSCRIPTIONS.delete(
            `subscription-${subscription.endpoint}`
          )
        }
      }
    } catch (err) {
      results.push({
        endpoint: subscription.endpoint,
        success: false,
        error: String(err),
      })
    }
  }

  return results
}

/**
 * Handler test notification (pour debug)
 */
async function handleTestNotification(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = (await request.json()) as any
    const testSchedule: NotificationSchedule = {
      id: `test-${Date.now()}`,
      eventId: 'test-event',
      eventName: 'Test Event',
      title: body.title || 'Test Notification',
      message: body.message || 'Ceci est une notification de test',
      timing: 'absolute',
      absoluteTime: Date.now(),
      status: 'pending',
    }

    const subscriptions = await getSubscriptions(env)
    if (subscriptions.length === 0) {
      return new Response(JSON.stringify({ error: 'No subscriptions' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const results = await sendNotifications(testSchedule, subscriptions, env)
    const successCount = results.filter((r) => r.success).length

    return new Response(
      JSON.stringify({ ok: true, sent: successCount, total: results.length, results }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Logger une notification envoyée
 */
async function logNotificationSent(
  env: Env,
  schedule: NotificationSchedule,
  successCount: number,
  failCount: number
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const logKey = `logs:${date}`

  try {
    const existing = (await env.NOTIFICATIONS_LOGS.get(logKey, 'json')) || []
    existing.push({
      timestamp: Date.now(),
      scheduleId: schedule.id,
      eventId: schedule.eventId,
      successCount,
      failCount,
    })

    await env.NOTIFICATIONS_LOGS.put(logKey, JSON.stringify(existing))
  } catch (err) {
    console.error('Erreur logging:', err)
  }
}

/**
 * Logger une erreur
 */
async function logError(env: Env, err: any): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const logKey = `errors:${date}`

  try {
    const existing = (await env.NOTIFICATIONS_LOGS.get(logKey, 'json')) || []
    existing.push({
      timestamp: Date.now(),
      error: String(err),
    })

    await env.NOTIFICATIONS_LOGS.put(logKey, JSON.stringify(existing))
  } catch (err) {
    console.error('Erreur lors du logging:', err)
  }
}

