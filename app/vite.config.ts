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
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.ts',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        modifyURLPrefix: {
          '': process.env.NODE_ENV === 'production' ? '/Lords-Academy/' : '',
        },
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,jpeg,jpg,webp,gif,woff,woff2,ttf,eot}'
        ],
        globIgnores: ['**/cms/*.json', 'sw.ts'],
        navigateFallbackDenylist: [/^\/api\//, /^\/cms\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/cms/') && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cms-config-cache',
              networkTimeoutSeconds: 2,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 2 * 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/lords-academy\.pages\.dev\/api\/tutorials\/published/,
            handler: 'NetworkOnly',  // ← Jamais de cache pour les listes publiées
            options: {
              cacheName: 'published-list-cache',
              // Pas de fallback cache
            }
          },
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
          {
            urlPattern: /^https:\/\/lords-academy\.pages\.dev\/content\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'content-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 7 * 24 * 60 * 60
              }
            }
          }
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: false,        // ← Attendre l'activation (important pour SW custom)
        clientsClaim: true
      },
      injectRegister: 'auto',
      registerType: 'autoUpdate'
    })
  ],
  server: {
    port: 5173,
    open: true
  }
})
