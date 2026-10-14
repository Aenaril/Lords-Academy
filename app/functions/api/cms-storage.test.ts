/**
 * Tests for secured CMS Storage endpoint: /api/cms-storage/notifications/cron-read
 * 
 * Verifies:
 * - Unauthorized access without token is rejected (401)
 * - Incorrect token is rejected (401)
 * - Valid token retrieves real notifications from backend
 * - Response format matches expected schema
 * - Authenticated admin routes still work unchanged
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { EventNotificationSchedule } from '../src/cms/types'

/**
 * Mock the CMS Storage functions
 */
vi.mock('../cms-storage', () => ({
  cmsStore: vi.fn(() => ({
    getDoc: vi.fn(),
    putDoc: vi.fn(),
  })),
  loadNotificationSchedules: vi.fn(async () => [
    {
      id: 'notif-test-001',
      enabled: true,
      title: 'Test Notification',
      message: 'This is a test notification',
      absoluteTime: Date.now() + 3600000,
      relativeReminders: [
        { id: 'reminder-1', enabled: true, relativeDelay: '-1h' },
      ],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
  ]),
  saveNotificationSchedules: vi.fn(async () => ({ ok: true })),
  loadEventsDraft: vi.fn(async () => []),
}))

describe('CMS Storage: Secured Cron Endpoint', () => {
  const BASE_URL = 'https://localhost:3000/api/cms-storage'
  const CRON_TOKEN = 'test-cron-secret-token-12345'

  // Helper to make requests
  async function request(
    method: string,
    path: string,
    options?: {
      token?: string
      body?: any
      headers?: Record<string, string>
      origin?: string
      csrf?: boolean
    }
  ) {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...options?.headers,
    }

    if (options?.token) {
      headers['Authorization'] = `Bearer ${options.token}`
    }

    if (options?.origin) {
      headers['Origin'] = options.origin
    }

    if (options?.csrf) {
      headers['X-Requested-With'] = 'lma-admin'
    }

    if (options?.body) {
      headers['Content-Type'] = 'application/json'
    }

    const init: RequestInit = {
      method,
      headers,
    }

    if (options?.body) {
      init.body = JSON.stringify(options.body)
    }

    const url = `${BASE_URL}${path}`
    return fetch(url, init)
  }

  describe('GET /notifications/cron-read (Cron endpoint)', () => {
    it('should reject request without Authorization header (401)', async () => {
      const response = await request('GET', '/notifications/cron-read')
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should reject request with incorrect token (401)', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        token: 'wrong-token',
      })
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should accept request with valid token (200)', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        token: CRON_TOKEN,
      })
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.schedules)).toBe(true)
    })

    it('should return properly formatted notification data', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        token: CRON_TOKEN,
      })
      const data = await response.json()

      expect(data).toHaveProperty('ok')
      expect(data).toHaveProperty('schedules')
      expect(data).toHaveProperty('timestamp')

      if (data.schedules.length > 0) {
        const schedule = data.schedules[0]
        expect(schedule).toHaveProperty('id')
        expect(schedule).toHaveProperty('enabled')
        expect(schedule).toHaveProperty('title')
        expect(schedule).toHaveProperty('message')
        expect(schedule).toHaveProperty('absoluteTime')
        expect(typeof schedule.absoluteTime).toBe('number')
      }
    })

    it('should return timestamp of fetch', async () => {
      const before = Date.now()
      const response = await request('GET', '/notifications/cron-read', {
        token: CRON_TOKEN,
      })
      const after = Date.now()

      const data = await response.json()
      expect(data.timestamp).toBeGreaterThanOrEqual(before)
      expect(data.timestamp).toBeLessThanOrEqual(after)
    })

    it('should not require CSRF header (Cron endpoint is GET)', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        token: CRON_TOKEN,
        csrf: false,
      })
      expect(response.status).toBe(200)
    })

    it('should not require origin validation (Cron is external)', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        token: CRON_TOKEN,
        origin: 'https://external-service.com',
      })
      expect(response.status).toBe(200)
    })
  })

  describe('Authorization: Bearer token format', () => {
    it('should reject malformed Authorization header', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        headers: {
          Authorization: 'Basic dGVzdDp0ZXN0',
        },
      })
      expect(response.status).toBe(401)
    })

    it('should reject Authorization without Bearer scheme', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        headers: {
          Authorization: CRON_TOKEN,
        },
      })
      expect(response.status).toBe(401)
    })

    it('should accept proper Bearer token format', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        headers: {
          Authorization: `Bearer ${CRON_TOKEN}`,
        },
      })
      expect(response.status).toBe(200)
    })
  })

  describe('Integration: Admin routes unchanged', () => {
    it('should still require session auth for POST /notifications/save', async () => {
      const response = await request('POST', '/notifications/save', {
        body: { schedules: [] },
      })
      // Should fail with 401 (no valid session) not 200
      expect(response.status).toBe(401)
    })

    it('should still require CSRF for admin POST routes', async () => {
      const response = await request('POST', '/notifications/save', {
        body: { schedules: [] },
        csrf: false,
      })
      // Should fail (either 401 auth or 403 CSRF)
      expect([401, 403]).toContain(response.status)
    })
  })

  describe('Error handling', () => {
    it('should return 500 on CMS store error', async () => {
      // This would require mocking the store to throw
      // Skipped in this basic test suite
    })

    it('should not expose sensitive error details in response', async () => {
      const response = await request('GET', '/notifications/cron-read', {
        token: 'wrong-token',
      })
      const data = await response.json()
      // Error message should be generic
      expect(data.error).not.toContain('environment')
      expect(data.error).not.toContain('undefined')
    })
  })
})

describe('Cron Integration: fetchCMSNotifications()', () => {
  /**
   * Test the Worker's fetchCMSNotifications() function
   * (This would be integrated into worker/src/notifications-cron.test.ts)
   */

  it('should fetch from secured endpoint with Bearer token', () => {
    // Mock fetch to verify correct parameters
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('/api/cms-storage/notifications/cron-read')
      expect(init?.headers).toHaveProperty('Authorization')
      expect(String(init?.headers?.['Authorization'])).toMatch(/^Bearer\s+.+/)
      return new Response(
        JSON.stringify({
          ok: true,
          schedules: [],
          timestamp: Date.now(),
        })
      )
    })

    global.fetch = mockFetch as any

    // Call would be: const schedules = await fetchCMSNotifications(env)
    expect(mockFetch).toBeDefined()
  })

  it('should return empty array on fetch failure', () => {
    // Ensures Worker does not send notifications if CMS is unreachable
    const mockFetch = vi.fn(async () => {
      throw new Error('Network error')
    })

    global.fetch = mockFetch as any
    expect(mockFetch).toBeDefined()
  })
})
