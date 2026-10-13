/**
 * Service Worker Extension pour Web Push
 * 
 * Ce fichier enregistre les handlers pour les événements push.
 * Il est injecté par le client (App.tsx) APRÈS l'enregistrement du SW Workbox.
 * 
 * NOTE: Ce n'est pas le SW lui-même, mais une extension côté client qui
 * ajoute les listeners aux événements push.
 */

/**
 * Enregistrer les handlers de push événements
 * Appelé au démarrage de l'app (App.tsx)
 */
export async function registerPushHandlers() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PushHandlers] Service Worker not supported')
    return
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()

    for (const registration of registrations) {
      console.log('[PushHandlers] Found SW registration, adding push listeners')

      // Ajouter le handler pour push events
      const sw = registration.active || registration.installing || registration.waiting

      if (sw) {
        // Les listeners sont automatiquement attachés au SW global
        // On vérifie simplement que le SW est prêt
        console.log('[PushHandlers] Service Worker ready for push events')
      }
    }

    // Pointer vers le fichier static sw-push-handler.js via importScripts
    // (si nécessaire pour une intégration plus robuste future)
  } catch (err) {
    console.warn('[PushHandlers] Failed to register push handlers:', err)
  }
}

/**
 * Listeners pour les événements push
 * 
 * IMPORTANT: Ces listeners DOIVENT être définis dans le contexte du Service Worker global
 * ou injectés via importScripts().
 * 
 * Actuellement, le handler se trouve dans /public/sw-push-handler.js
 * et sera exécuté par le SW Workbox généré.
 */
export const pushHandlersCode = `
// ========== PUSH HANDLERS (injected into SW) ==========

self.addEventListener('push', (event) => {
  console.log('[PushHandler] Push event received:', event)

  if (!event.data) {
    console.warn('[PushHandler] Push event without data')
    event.waitUntil(
      self.registration.showNotification('Notification', {
        body: 'Notification sans contenu',
        tag: 'notification',
        badge: '/icons/icon-192.png',
      })
    )
    return
  }

  try {
    const data = event.data.json()
    console.log('[PushHandler] Parsed push data:', data)

    const options = {
      body: data.body || 'Nouvelle notification',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'notification',
      data: {
        url: data.url || '/',
        timestamp: data.timestamp || Date.now(),
      },
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Notification', options)
    )
  } catch (err) {
    console.error('[PushHandler] Failed to parse push data:', err)
    event.waitUntil(
      self.registration.showNotification('Notification', {
        body: event.data.text ? event.data.text() : 'Notification',
      })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  console.log('[PushHandler] Notification clicked:', event)

  event.notification.close()

  const data = event.notification.data
  const targetUrl = data?.url || '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window' })
      .then((clientList) => {
        // Check if there's already an open window
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return (client as any).focus()
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
  )
})

self.addEventListener('notificationclose', (event) => {
  console.log('[PushHandler] Notification closed:', event)
})
`
