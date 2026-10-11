import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      manifest: {
        name: 'Lords Mobile Academy',
        short_name: 'LMA',
        description: 'Maîtrisez les tactiques de Lords Mobile — Tutoriels complets d\'administration R4',
        theme_color: '#C41E3A',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['education', 'games'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,jpeg,jpg,webp,gif,woff,woff2,ttf,eot}'
        ],
        // Exclure les routes API de tout type de cache
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Contenu publié (tutoriels) : toujours vérifier le réseau
          // NetworkFirst = essayer réseau d'abord, fallback au cache si offline
          {
            urlPattern: /^https:\/\/lords-academy\.pages\.dev\/api\/published/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'published-content-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 // 1 heure max en cache
              }
            }
          },
          // Images publiques : cache long terme (30 jours)
          {
            urlPattern: /^https:\/\/lords-academy\.pages\.dev\/images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          },
          // Fichiers statiques de contenu (JSON, etc.) : StaleWhileRevalidate
          {
            urlPattern: /^https:\/\/lords-academy\.pages\.dev\/content\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'content-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 jours
              }
            }
          }
        ],
        // Nettoyer les anciens caches
        cleanupOutdatedCaches: true,
        // Activations plus agressives
        skipWaiting: true,        // ← Mise à jour immédiate du SW
        clientsClaim: true        // ← Reprendre les clients immédiatement
      },
      // Injecter le Service Worker avec détection de mise à jour explicite
      injectRegister: 'auto',
      // Activer registerPlugin pour les mises à jour
      registerType: 'autoUpdate'
    })
  ],
  server: {
    port: 5173,
    open: true
  }
})
