/**
 * Configuration Vitest pour tests Cloudflare Workers avec Durable Objects
 * 
 * Utilise @cloudflare/vitest-plugin pour exécuter les tests dans le runtime Workers
 */

import { defineConfig } from 'vitest/config'
import { getViteConfig } from '@cloudflare/vitest-plugin'

export default defineConfig(
  getViteConfig({
    test: {
      globals: true,
      environment: 'cloudflare',
      setupFiles: [],
      include: ['src/__tests__/**/*.real.test.ts'],
    },
  })
)
