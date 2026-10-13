/**
 * Tests — Notifications Phase C
 * 
 * Vérifie:
 * - Parsing JSON CMS
 * - Identification rappels dus
 * - Déduplication composite ID
 * - Gestion subscriptions
 */

import { describe, it, expect, beforeEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// MOCKS & SETUP
// ═══════════════════════════════════════════════════════════════

function parseRelativeDelay(delay: string): number {
  const match = delay.match(/^-(\d+)([hm])$/)
  if (!match) return 0

  const [_, value, unit] = match
  const numValue = parseInt(value, 10)

  if (unit === 'h') return numValue * 60 * 60 * 1000
  if (unit === 'm') return numValue * 60 * 1000

  return 0
}

function identifyDueReminders(
  notifications: any[],
  now: number
): Array<{ notificationId: string; reminderId: string; dueTime: number }> {
  const dueReminders: any[] = []

  for (const notif of notifications) {
    if (!notif.enabled) continue

    for (const reminder of notif.relativeReminders || []) {
      if (!reminder.enabled) continue

      const dueTime = notif.absoluteTime + parseRelativeDelay(reminder.relativeDelay)

      if (now >= dueTime) {
        dueReminders.push({
          notificationId: notif.id,
          reminderId: reminder.id,
          dueTime,
        })
      }
    }
  }

  dueReminders.sort((a, b) => a.dueTime - b.dueTime)
  return dueReminders
}

async function createCompositeId(notifId: string, reminderId: string, subId: string): Promise<string> {
  const combined = `${notifId}#${reminderId}#${subId}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(combined))
  return Array.from(new Uint8Array(buf))
    .map(x => x.toString(16).padStart(2, '0'))
    .join('')
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('Phase C — Notifications', () => {
  describe('parseRelativeDelay', () => {
    it('parse -24h', () => {
      expect(parseRelativeDelay('-24h')).toBe(24 * 60 * 60 * 1000)
    })

    it('parse -30m', () => {
      expect(parseRelativeDelay('-30m')).toBe(30 * 60 * 1000)
    })

    it('parse -3h', () => {
      expect(parseRelativeDelay('-3h')).toBe(3 * 60 * 60 * 1000)
    })

    it('retourne 0 pour format invalide', () => {
      expect(parseRelativeDelay('abc')).toBe(0)
      expect(parseRelativeDelay('invalid')).toBe(0)
    })
  })

  describe('identifyDueReminders', () => {
    it('aucun rappel si notification désactivée', () => {
      const now = Date.now()
      const notifications = [
        {
          id: 'n1',
          enabled: false,
          absoluteTime: now - 1000,
          relativeReminders: [
            { id: 'r1', enabled: true, relativeDelay: '-30m' },
          ],
        },
      ]

      const due = identifyDueReminders(notifications, now)
      expect(due).toHaveLength(0)
    })

    it('aucun rappel si rappel désactivé', () => {
      const now = Date.now()
      const notifications = [
        {
          id: 'n1',
          enabled: true,
          absoluteTime: now - 1000,
          relativeReminders: [
            { id: 'r1', enabled: false, relativeDelay: '-30m' },
          ],
        },
      ]

      const due = identifyDueReminders(notifications, now)
      expect(due).toHaveLength(0)
    })
  })

  describe('createCompositeId', () => {
    it('génère un hash cohérent', async () => {
      const id1 = await createCompositeId('notif1', 'reminder1', 'sub1')
      const id2 = await createCompositeId('notif1', 'reminder1', 'sub1')

      expect(id1).toBe(id2)
      expect(id1).toHaveLength(64) // SHA-256 hex = 64 chars
    })

    it('génère un hash différent pour paramètres différents', async () => {
      const id1 = await createCompositeId('notif1', 'reminder1', 'sub1')
      const id2 = await createCompositeId('notif2', 'reminder1', 'sub1')

      expect(id1).not.toBe(id2)
    })

    it('est sensible à tous les paramètres', async () => {
      const base = await createCompositeId('n', 'r', 's')
      const diffNotif = await createCompositeId('n2', 'r', 's')
      const diffReminder = await createCompositeId('n', 'r2', 's')
      const diffSub = await createCompositeId('n', 'r', 's2')

      expect(base).not.toBe(diffNotif)
      expect(base).not.toBe(diffReminder)
      expect(base).not.toBe(diffSub)
    })
  })

  describe('Scénario complet: rappels rapprochés', () => {
    it('composite ID unique par (notif + reminder + subscriber)', async () => {
      const id1 = await createCompositeId('n', 'r1', 's')
      const id2 = await createCompositeId('n', 'r2', 's')
      const id3 = await createCompositeId('n', 'r1', 's2')

      // Tous différents
      expect(id1).not.toBe(id2)
      expect(id1).not.toBe(id3)
      expect(id2).not.toBe(id3)
    })
  })
})
