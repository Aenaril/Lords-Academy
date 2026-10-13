/**
 * Extension du Service Worker pour gérer les événements push
 * 
 * Ce fichier étend les capacités du SW généré par Workbox
 * pour afficher les notifications push reçues.
 * 
 * Phase B : mise en place, pas d'envoi réel
 * Phase C : intégration avec le Cron scheduler
 */

// ✅ Gérer les événements push entrants
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW Push] Empty push event (no data)')
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
    // Fallback : afficher une notification générique
    event.waitUntil(
      self.registration.showNotification('Lords Mobile Academy', {
        body: 'Nouvelle notification',
        icon: '/images/logo-192.png',
        tag: 'lma-notification',
      })
    )
  }
})

// ✅ Gérer les clics sur notifications
self.addEventListener('notificationclick', (event) => {
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

  console.log('[SW Push] Notification clicked, navigated to:', url)
})

// ✅ Gérer les fermetures de notifications
self.addEventListener('notificationclose', (event) => {
  console.log('[SW Push] Notification closed:', event.notification.tag)
})

// ✅ Gérer les erreurs de push
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[SW Push] Push event with no data received')
  }
})
