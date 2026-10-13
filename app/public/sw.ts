/**
 * Service Worker Principal pour Lords Mobile Academy
 * 
 * Combine:
 * - Workbox precache + runtime caching (tutoriels, CMS, images)
 * - Web Push handlers (push, notificationclick, notificationclose)
 * - Offline support
 * 
 * Généré via Vite-PWA injectManifest strategy
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

// ========== WORKBOX INJECTION ==========
// Ce placeholder est remplacé par Workbox lors du build
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheExpiration } from 'workbox-expiration'

// Précache manifest injecté par Workbox
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ========== RUNTIME CACHING RULES ==========

// CMS configs (annonces, thèmes, etc.) : réseau d'abord, max 5 min cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/cms/') && url.pathname.endsWith('.json'),
  new NetworkFirst({
    cacheName: 'cms-config-cache',
    plugins: [
      new CacheExpiration({
        maxEntries: 10,
        maxAgeSeconds: 5 * 60,
      }),
    ],
  })
)

// Images publiques : cache long terme (30 jours)
registerRoute(
  ({ url }) => /\/images\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new CacheExpiration({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
)

// Contenu publié : réseau d'abord
registerRoute(
  ({ url }) => /\/api\/published/.test(url.href),
  new NetworkFirst({
    cacheName: 'published-content-cache',
    plugins: [
      new CacheExpiration({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60,
      }),
    ],
  })
)

// Navigation fallback : servir index.html pour routes non-API
const navigationRoute = new NavigationRoute(new CacheFirst({
  cacheName: 'pages-cache',
  plugins: [
    new CacheExpiration({
      maxEntries: 50,
    }),
  ],
}), {
  denylist: [/^\/api\//, /^\/cms\//],
})
registerRoute(navigationRoute)

// ========== WEB PUSH HANDLERS ==========

/**
 * Push Event — Reçoit les notifications push du serveur
 * 
 * En Phase B: Handlers présents mais aucun envoi réel
 * En Phase C: Cron scheduler enverra les notifications via pushforge
 */
self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW Push] Push event received:', event)

  if (!event.data) {
    console.warn('[SW Push] Push event with no data')
    return
  }

  try {
    const data = event.data.json()

    const options: NotificationOptions = {
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

/**
 * Notification Click — Utilisateur clique sur notification
 * 
 * Navigue vers l'URL spécifiée ou ouvre une nouvelle fenêtre
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
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

/**
 * Notification Close — Utilisateur ferme notification
 * 
 * Logging uniquement (peut être utilisé pour analytics en Phase C)
 */
self.addEventListener('notificationclose', (event: NotificationEvent) => {
  console.log('[SW Push] Notification closed:', event.notification.tag)
})

// ========== SERVICE WORKER LIFECYCLE ==========

// Activate event — Nettoyer les anciens caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('[SW] Activating service worker')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Garder seulement les caches nommés ci-dessus
          const validCaches = [
            'cms-config-cache',
            'published-content-cache',
            'images-cache',
            'content-cache',
            'pages-cache',
            'workbox-cache-v1',
          ]
          if (!validCaches.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})

console.log('[SW] Service Worker loaded (Workbox + Push handlers)')
