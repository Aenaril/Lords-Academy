/**
 * Service de gestion des abonnements Web Push
 * 
 * Responsabilités :
 * - Validation des données d'abonnement
 * - Communication avec l'API serveur
 * - Gestion de l'état de permission
 * - Détection des navigateurs incompatibles
 */

export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export interface SubscriptionResponse {
  ok: boolean
  subscriptionId?: string
  revocationSecret?: string
  error?: string
  code?: string
}

/**
 * Vérifier si le navigateur supporte Web Push
 */
export function isPushNotificationSupported(): boolean {
  if (!('serviceWorker' in navigator)) {
    return false
  }
  if (!('PushManager' in window)) {
    return false
  }
  if (!('Notification' in window)) {
    return false
  }
  return true
}

/**
 * Obtenir l'état actuel de notification
 */
export async function getNotificationState(): Promise<'granted' | 'denied' | 'default'> {
  if (!isPushNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission
}

/**
 * Demander la permission de notification
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  if (!isPushNotificationSupported()) {
    throw new Error('Notifications non supportées')
  }

  const permission = await Notification.requestPermission()
  return permission as 'granted' | 'denied'
}

/**
 * S'abonner aux notifications push
 * 
 * Retourne subscriptionId (pour plus tard) ET revocationSecret
 * (à sauvegarder localement pour désabonner + réabonner)
 */
export async function subscribeToPushNotifications(
  vapidPublicKey: string,
): Promise<SubscriptionResponse> {
  if (!isPushNotificationSupported()) {
    return {
      ok: false,
      error: 'Notifications push non supportées',
      code: 'NOT_SUPPORTED',
    }
  }

  // ✅ Vérifier VAPID
  if (!vapidPublicKey || typeof vapidPublicKey !== 'string' || vapidPublicKey.length === 0) {
    return {
      ok: false,
      error: 'Clé VAPID publique manquante (configuration serveur requise)',
      code: 'VAPID_MISSING',
    }
  }

  try {
    // Enregistrer le Service Worker
    const registration = await navigator.serviceWorker.ready

    // S'abonner
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    })

    // Extraire les données
    const data = subscription.toJSON()
    if (!data.endpoint || !data.keys?.p256dh || !data.keys?.auth) {
      throw new Error('Données d\'abonnement incomplètes')
    }

    // ✅ SÉCURITÉ : Récupérer l'ancien secret si réabonnement (F5 recovery)
    const oldRevocationSecret = localStorage.getItem('lma-revocation-secret')

    // Envoyer au serveur
    const response = await fetch('/api/web-push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        // ✅ Inclure ancien secret comme preuve de possession (réabonnement)
        ...(oldRevocationSecret && { oldRevocationSecret }),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Serveur retour ${response.status}: ${error}`)
    }

    const result = (await response.json()) as SubscriptionResponse
    // ✅ S'assurer que subscriptionId + revocationSecret sont retournés
    if (!result.subscriptionId || !result.revocationSecret) {
      throw new Error('Serveur n\'a pas retourné les identifiants requis')
    }

    // ✅ SAUVEGARDER le nouveau revocationSecret en localStorage
    localStorage.setItem('lma-subscription-id', result.subscriptionId)
    localStorage.setItem('lma-revocation-secret', result.revocationSecret)

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `Erreur d'abonnement: ${message}`,
      code: 'SUBSCRIBE_ERROR',
    }
  }
}

/**
 * Se désabonner des notifications push
 * 
 * Récupère subscriptionId + revocationSecret depuis localStorage
 * Les envoie au serveur pour vérification
 * ✅ N'efface PAS localement avant confirmation serveur
 */
export async function unsubscribeFromPushNotifications(
  subscriptionId: string,
): Promise<SubscriptionResponse> {
  if (!isPushNotificationSupported()) {
    return {
      ok: false,
      error: 'Notifications push non supportées',
      code: 'NOT_SUPPORTED',
    }
  }

  try {
    // ✅ Récupérer le secret de révocation depuis localStorage
    const revocationSecret = localStorage.getItem('lma-revocation-secret')
    if (!revocationSecret) {
      return {
        ok: false,
        error: 'Secret de révocation manquant (stockage local corrompu)',
        code: 'REVOCATION_SECRET_MISSING',
      }
    }

    // ✅ Notifier le serveur AVANT de désabonner localement
    const response = await fetch('/api/web-push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId, revocationSecret }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Serveur retour ${response.status}: ${error}`)
    }

    const result = (await response.json()) as SubscriptionResponse
    
    // ✅ SEULEMENT si serveur valide : désabonner localement
    if (result.ok) {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()
      }
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `Erreur de désabonnement: ${message}`,
      code: 'UNSUBSCRIBE_ERROR',
    }
  }
}

/**
 * Vérifier l'état de l'abonnement actuel
 */
export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

/**
 * Convertir une clé VAPID Base64 en Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}
