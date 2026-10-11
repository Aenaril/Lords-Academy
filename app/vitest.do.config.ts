/**
 * Configuration Vitest pour tests Durable Objects
 * 
 * Environnement : node (pas jsdom)
 * Setup : initialiser miniflare
 * Include : seulement tests DO et migration
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // ← Pas de jsdom, on teste des APIs Worker
    setupFiles: ['./src/__tests__/setup-do.ts'],
    include: [
      'src/__tests__/**/*.do.test.ts',
      'src/__tests__/migration.*.test.ts',
    ],
    testTimeout: 30000, // DO peut être plus lent
  },
})
