/**
 * Extension du Service Worker pour gérer les événements push
 * 
 * IMPORTANT: Ce fichier est EN ATTENTE d'intégration avec Workbox.
 * Actuellement, Workbox génère son propre SW avec skipWaiting:true,
 * ce qui peut écraser ce code.
 * 
 * Phase B: Handlers enregistrés, pas d'envoi réel
 * Phase C: Intégration Cron + envois push via pushforge
 */

// ========== PUSH EVENT HANDLER ==========
self.addEventListener('push', (event) => {
  console.log('[SW Push] Push event received:', event)

  if (!event.data) {
    console.warn('[SW Push] Push event with no data')
    return
  }

  try {
    const data = event.data.json()

    const options = {
      body: data.body || 'Nouvelle notification',
      icon: data.icon || '/images/logo-192.png',
      badge: data.badge || '/images/badge-96.png',
      tag: data.tag || 'lma-notification',
      requireInteraction: data.requireInteraction ?? false,
      data: {
        url: data.url || '/',
        tutorialId: data.tutorialId || null,
        scheduleId: data.scheduleId || null,
      },
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Lords Mobile Academy', options)
    )

    console.log('[SW Push] Notification displayed:', data.title)
  } catch (err) {
    console.error('[SW Push] Error handling push event:', err)
    // Fallback
    event.waitUntil(
      self.registration.showNotification('Lords Mobile Academy', {
        body: 'Nouvelle notification',
        icon: '/images/logo-192.png',
        tag: 'lma-notification',
      })
    )
  }
})

// ========== NOTIFICATION CLICK HANDLER ==========
self.addEventListener('notificationclick', (event) => {
  console.log('[SW Push] Notification clicked:', event.notification.tag)

  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Chercher une fenêtre existante
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        }
        // Sinon ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )

  console.log('[SW Push] Navigated to:', url)
})

// ========== NOTIFICATION CLOSE HANDLER ==========
self.addEventListener('notificationclose', (event) => {
  console.log('[SW Push] Notification closed:', event.notification.tag)
})

console.log('[SW Push] Push handlers registered in Service Worker')
