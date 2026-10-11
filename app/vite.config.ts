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
          }
          // Les fichiers JS/CSS/HTML : Workbox auto (stale-while-revalidate par défaut)
          // Les routes /api : jamais cachées (navigateFallbackDenylist)
        ],
        // Nettoyer les anciens caches
        cleanupOutdatedCaches: true,
        // Compatibilité maximale
        skipWaiting: false,
        clientsClaim: false
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
