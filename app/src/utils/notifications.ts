/**
 * Utilitaires notifications push
 * 
 * Gère l'enregistrement aux notifications et la souscription auprès du service worker
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

/**
 * Demander la permission et s'enregistrer aux notifications
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('Notifications non supportées')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission === 'denied') {
    return false
  }

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

/**
 * Vérifier si on peut utiliser les notifications
 */
export function canUseNotifications(): boolean {
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    Notification.permission === 'granted'
  )
}

/**
 * S'abonner aux notifications push (subscribe push service)
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push manager non disponible')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.pushManager) {
      console.warn('PushManager non disponible')
      return null
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    })

    // Sauvegarder l'abonnement localement
    localStorage.setItem('push:subscription', JSON.stringify(subscription.toJSON()))

    // Envoyer l'abonnement au serveur
    await registerSubscription(subscription)

    return subscription
  } catch (err) {
    console.error('Erreur abonnement push:', err)
    return null
  }
}

/**
 * Se désabonner des notifications push
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      await subscription.unsubscribe()
      localStorage.removeItem('push:subscription')

      // Notifier le serveur
      await unregisterSubscription(subscription)
      return true
    }

    return false
  } catch (err) {
    console.error('Erreur désabonnement push:', err)
    return false
  }
}

/**
 * Obtenir l'abonnement actuel
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker.ready
    return registration.pushManager.getSubscription()
  } catch (err) {
    console.error('Erreur récupération subscription:', err)
    return null
  }
}

/**
 * Enregistrer l'abonnement auprès du serveur
 */
async function registerSubscription(subscription: PushSubscription): Promise<void> {
  try {
    const response = await fetch('/api/cms/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe',
        subscription: subscription.toJSON(),
      }),
    })

    if (!response.ok) {
      console.error('Erreur enregistrement subscription:', response.status)
    }
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement:', err)
  }
}

/**
 * Désinscrire l'abonnement auprès du serveur
 */
async function unregisterSubscription(subscription: PushSubscription): Promise<void> {
  try {
    await fetch('/api/cms/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'unsubscribe',
        subscription: subscription.toJSON(),
      }),
    })
  } catch (err) {
    console.error('Erreur lors de la désinscription:', err)
  }
}

/**
 * Afficher une notification de test
 */
export function showTestNotification(title: string, options?: NotificationOptions): Notification {
  if (!('Notification' in window)) {
    throw new Error('Notifications non supportées')
  }

  return new Notification(title, {
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    ...options,
  })
}

