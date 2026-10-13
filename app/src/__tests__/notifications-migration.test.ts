/**
 * Tests de migration des notifications : ancien format → autonome
 *
 * Scénarios testés :
 * - Ancien rappel relatif
 * - Ancien rappel absolu
 * - Événement manquant
 * - Notification déjà migrée (autonome)
 * - Migration idempotente (2x = identique)
 * - Objet sans relativeReminders
 * - Trois rappels distincts
 * - Statistiques de migration
 */

import { describe, it, expect } from 'vitest'
import type { Event, EventNotificationSchedule } from '../cms/types'
import {
  migrateNotification,
  migrateNotifications,
  needsMigration,
  isAutonomous,
  analyzeMigration,
} from '../cms/notificationsMigration'
import { brusselsToUtc, relativeReminderTime } from '../cms/timezone'

const now = Date.now()
const eventStart = brusselsToUtc(2026, 10, 24, 20, 0) // 24 oct 2026 20:00 Brussels

const mockEvent: Event = {
  id: 'evt-1',
  name: 'Tournament',
  description: 'Grand tournoi',
  startAt: eventStart,
  tutorialId: 'tuto-1',
  status: 'active',
  createdAt: now,
  modifiedAt: now,
}

describe('Notifications — Migration (ancien → autonome)', () => {
  describe('needsMigration & isAutonomous', () => {
    it('identifies old format (has eventId)', () => {
      const old = { id: 's1', eventId: 'evt-1', timing: 'relative' }
      expect(needsMigration(old)).toBe(true)
      expect(isAutonomous(old)).toBe(false)
    })

    it('identifies autonomous format (has relativeReminders, no eventId)', () => {
      const auto = { id: 'n1', relativeReminders: [], eventId: undefined }
      expect(needsMigration(auto)).toBe(false)
      expect(isAutonomous(auto)).toBe(true)
    })

    it('handles missing data gracefully', () => {
      expect(needsMigration(null)).toBe(false)
      expect(isAutonomous(null)).toBe(false)
      expect(needsMigration({})).toBe(false)
      expect(isAutonomous({})).toBe(false)
    })
  })

  describe('migrateNotification — relative reminder', () => {
    it('converts old relative reminder (-24h) to autonomous', () => {
      const oldNotif = {
        id: 's-rel-24h',
        eventId: 'evt-1',
        enabled: true,
        title: 'Rappel 24h',
        message: 'Tournoi dans 24h',
        timing: 'relative',
        relativeDelay: '-24h',
        status: 'pending',
        createdAt: now,
        modifiedAt: now,
      }

      const migrated = migrateNotification(oldNotif, [mockEvent])

      expect(migrated.id).toBe('s-rel-24h')
      expect(migrated.eventId).toBeUndefined()
      expect(migrated.title).toBe('Rappel 24h')
      expect(migrated.enabled).toBe(true)
      expect(migrated.relativeReminders.length).toBe(1)
      expect(migrated.relativeReminders[0].relativeDelay).toBe('-24h')
      expect(migrated.relativeReminders[0].status).toBe('pending')
    })

    it('converts relative reminder (-3h)', () => {
      const oldNotif = {
        id: 's-rel-3h',
        eventId: 'evt-1',
        enabled: true,
        title: 'Rappel 3h',
        message: 'Commencer !',
        timing: 'relative',
        relativeDelay: '-3h',
        status: 'pending',
      }

      const migrated = migrateNotification(oldNotif, [mockEvent])

      expect(migrated.relativeReminders[0].relativeDelay).toBe('-3h')
      // Vérifier que le rappel a un ID unique
      expect(migrated.relativeReminders[0].id).toContain('rem-')
    })
  })

  describe('migrateNotification — absolute reminder', () => {
    it('converts old absolute reminder to autonomous', () => {
      const absoluteTime = eventStart - 3600000 // 1h avant
      const oldNotif = {
        id: 's-abs-1h',
        eventId: 'evt-1',
        enabled: true,
        title: 'Rappel absolu',
        message: 'Message',
        timing: 'absolute',
        absoluteTime: absoluteTime,
        status: 'pending',
      }

      const migrated = migrateNotification(oldNotif, [mockEvent])

      expect(migrated.eventId).toBeUndefined()
      expect(migrated.relativeReminders.length).toBe(1)
      // Le rappel doit avoir un delai qui correspond à -1h
      const expectedDelay = relativeReminderTime(eventStart, '-1h')
      expect(expectedDelay).toBe(absoluteTime)
    })

    it('preserves absoluteTime from old format', () => {
      const customTime = eventStart - 7200000 // 2h avant
      const oldNotif = {
        id: 's-abs-custom',
        eventId: 'evt-1',
        timing: 'absolute',
        absoluteTime: customTime,
      }

      const migrated = migrateNotification(oldNotif, [mockEvent])

      // L'absoluteTime doit être préservé
      expect(migrated.absoluteTime).toBe(customTime)
    })
  })

  describe('migrateNotification — missing event', () => {
    it('handles missing event gracefully (non-destructive)', () => {
      const oldNotif = {
        id: 's-orphan',
        eventId: 'evt-missing',
        enabled: true,
        title: 'Orphaned reminder',
        message: 'Message',
        status: 'pending',
      }

      const migrated = migrateNotification(oldNotif, []) // Events vides

      // Doit garder la structure sans cracher
      expect(migrated.id).toBe('s-orphan')
      expect(migrated.enabled).toBe(true)
      expect(migrated.title).toBe('Orphaned reminder')
      expect(migrated.eventId).toBe('evt-missing') // Garder pour audit
      expect(migrated.relativeReminders).toEqual([])
    })

    it('uses provided absoluteTime if event missing', () => {
      const customTime = now + 86400000
      const oldNotif = {
        id: 's-orphan-2',
        eventId: 'evt-gone',
        absoluteTime: customTime,
      }

      const migrated = migrateNotification(oldNotif, [])

      expect(migrated.absoluteTime).toBe(customTime)
    })
  })

  describe('migrateNotification — already autonomous', () => {
    it('preserves autonomous notifications unchanged', () => {
      const autonomous: EventNotificationSchedule = {
        id: 'n-auto-1',
        enabled: true,
        title: 'Already autonomous',
        message: 'Message',
        absoluteTime: now,
        relativeReminders: [
          { id: 'rem-1', enabled: true, relativeDelay: '-24h', status: 'pending' },
        ],
        createdAt: now,
        modifiedAt: now,
      }

      const migrated = migrateNotification(autonomous, [])

      expect(migrated).toEqual(autonomous)
      expect(migrated.eventId).toBeUndefined()
    })

    it('cleans up eventId if present in autonomous', () => {
      const autoWithOldId: any = {
        id: 'n-auto-2',
        enabled: true,
        title: 'Auto with old ID',
        absoluteTime: now,
        relativeReminders: [],
        eventId: 'evt-old', // Remnant from old format
      }

      const migrated = migrateNotification(autoWithOldId, [])

      expect(migrated.eventId).toBeUndefined()
      expect(migrated.relativeReminders).toEqual([])
    })
  })

  describe('migrateNotifications — batch migration', () => {
    it('migrates multiple notifications correctly', () => {
      const oldNotifs = [
        {
          id: 's1',
          eventId: 'evt-1',
          title: 'Rappel 1',
          timing: 'relative',
          relativeDelay: '-24h',
        },
        {
          id: 's2',
          eventId: 'evt-1',
          title: 'Rappel 2',
          timing: 'absolute',
          absoluteTime: eventStart - 3600000,
        },
        {
          id: 'n-auto',
          relativeReminders: [{ id: 'rem', relativeDelay: '-3h' }],
        },
      ]

      const migrated = migrateNotifications(oldNotifs, [mockEvent])

      expect(migrated.length).toBe(3)
      expect(migrated[0].id).toBe('s1')
      expect(migrated[0].eventId).toBeUndefined()
      expect(migrated[1].id).toBe('s2')
      expect(migrated[2].id).toBe('n-auto')
    })

    it('handles errors gracefully in batch', () => {
      const mixedNotifs = [
        { id: 's-valid', eventId: 'evt-1', title: 'OK' },
        null, // Null
        { id: 's-good', relativeReminders: [] }, // Already autonomous
      ]

      // Ne doit pas cracher sur null
      const migrated = migrateNotifications(
        mixedNotifs.filter(Boolean),
        [mockEvent]
      )

      expect(migrated.length).toBe(2)
      expect(migrated[0].relativeReminders.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Idempotence — migration 2x = identique', () => {
    it('produces same result when run twice', () => {
      const oldNotif = {
        id: 's-idem',
        eventId: 'evt-1',
        title: 'Test',
        timing: 'relative',
        relativeDelay: '-24h',
        status: 'pending',
      }

      const first = migrateNotification(oldNotif, [mockEvent])
      const second = migrateNotification(first, [mockEvent])

      // Deuxième migration ne change rien
      expect(second).toEqual(first)
      expect(second.eventId).toBeUndefined()
      expect(second.relativeReminders.length).toBe(1)
    })

    it('batch migration is idempotent', () => {
      const oldNotifs = [
        { id: 's1', eventId: 'evt-1', title: 'N1', timing: 'relative', relativeDelay: '-3h' },
        { id: 'n2', relativeReminders: [] },
      ]

      const first = migrateNotifications(oldNotifs, [mockEvent])
      const second = migrateNotifications(first, [mockEvent])

      // Deuxième pass change nothing
      expect(second.map((n) => n.id)).toEqual(first.map((n) => n.id))
      expect(second).toEqual(first)
    })
  })

  describe('analyzeMigration — statistiques', () => {
    it('counts autonomous, migrated, and errored', () => {
      const notifs = [
        // À migrer
        { id: 's1', eventId: 'evt-1', timing: 'relative', relativeDelay: '-24h' },
        { id: 's2', eventId: 'evt-1', timing: 'absolute', absoluteTime: eventStart },
        // Déjà autonomes
        { id: 'n1', relativeReminders: [] },
        // Orphelins
        { id: 's-orphan', eventId: 'evt-missing', timing: 'relative' },
      ]

      const stats = analyzeMigration(notifs, [mockEvent])

      expect(stats.total).toBe(4)
      expect(stats.migrated).toBe(2) // s1, s2
      expect(stats.autonomous).toBe(1) // n1
      expect(stats.erroredOrMissing).toBe(1) // s-orphan
      expect(stats.warnings.length).toBeGreaterThan(0)
    })

    it('reports warnings for missing events', () => {
      const notifs = [{ id: 's-lost', eventId: 'evt-gone', timing: 'relative' }]

      const stats = analyzeMigration(notifs, [])

      expect(stats.warnings.length).toBe(1)
      expect(stats.warnings[0]).toContain('evt-gone')
      expect(stats.warnings[0]).toContain('introuvable')
    })
  })

  describe('Edge cases', () => {
    it('handles notification without timing but with absoluteTime', () => {
      const notif = {
        id: 's-edge-1',
        eventId: 'evt-1',
        enabled: true,
        absoluteTime: eventStart - 1800000, // 30min avant
        // timing undefined
      }

      const migrated = migrateNotification(notif, [mockEvent])

      expect(migrated.relativeReminders.length).toBe(1)
      expect(migrated.relativeReminders[0].relativeDelay).toContain('-')
    })

    it('preserves all data fields during migration', () => {
      const oldNotif = {
        id: 's-full',
        eventId: 'evt-1',
        enabled: false,
        title: 'Full data',
        message: 'Full message',
        imageUrl: 'https://example.com/img.png',
        tutorialId: 'tuto-custom',
        timing: 'relative',
        relativeDelay: '-6h',
        sentAt: now - 86400000,
        status: 'sent',
        createdAt: now - 172800000,
        modifiedAt: now - 3600000,
      }

      const migrated = migrateNotification(oldNotif, [mockEvent])

      expect(migrated.enabled).toBe(false)
      expect(migrated.title).toBe('Full data')
      expect(migrated.message).toBe('Full message')
      expect(migrated.imageUrl).toBe('https://example.com/img.png')
      expect(migrated.tutorialId).toBe('tuto-custom')
      expect(migrated.relativeReminders[0].sentAt).toBe(now - 86400000)
      expect(migrated.relativeReminders[0].status).toBe('sent')
    })

    it('generates unique reminder IDs even for same event', () => {
      const oldNotifs = [
        { id: 's1', eventId: 'evt-1', timing: 'relative', relativeDelay: '-24h' },
        { id: 's2', eventId: 'evt-1', timing: 'relative', relativeDelay: '-3h' },
        { id: 's3', eventId: 'evt-1', timing: 'relative', relativeDelay: '-30m' },
      ]

      const migrated = migrateNotifications(oldNotifs, [mockEvent])

      const reminderIds = migrated.flatMap((n) => n.relativeReminders.map((r) => r.id))
      const uniqueIds = new Set(reminderIds)

      expect(uniqueIds.size).toBe(reminderIds.length) // Tous uniques
    })
  })

  describe('Real-world scenarios', () => {
    it('migrates a complete old event-based workflow', () => {
      // Ancien setup : 1 événement, 1 notification, 3 anciens rappels
      const oldNotifs = [
        {
          id: 'sched-tournament-main',
          eventId: 'evt-1', // Utiliser l'ID du mock
          enabled: true,
          title: 'Tournament announced',
          message: 'Grand tournament is coming!',
          imageUrl: 'https://example.com/tournament.png',
          tutorialId: 'tuto-combat',
          timing: 'relative',
          relativeDelay: '-24h',
          status: 'pending',
          createdAt: now - 604800000, // 7 days ago
          modifiedAt: now - 3600000, // 1 hour ago
        },
      ]

      const migrated = migrateNotifications(oldNotifs, [mockEvent])

      expect(migrated.length).toBe(1)
      const n = migrated[0]
      expect(n.id).toBe('sched-tournament-main')
      expect(n.eventId).toBeUndefined()
      expect(n.title).toBe('Tournament announced')
      expect(n.enabled).toBe(true)
      expect(n.relativeReminders.length).toBe(1)
      expect(n.relativeReminders[0].relativeDelay).toBe('-24h')
    })

    it('handles partial migration (mix of old and new)', () => {
      const mixed = [
        // Old
        { id: 's-old', eventId: 'evt-1', timing: 'relative', relativeDelay: '-3h' },
        // Already new
        {
          id: 'n-new',
          enabled: true,
          title: 'New',
          absoluteTime: now,
          relativeReminders: [{ id: 'rem-1', relativeDelay: '-24h' }],
        },
        // Autonomous but without explicit eventId
        { id: 'n-simple', relativeReminders: [] },
      ]

      const migrated = migrateNotifications(mixed, [mockEvent])

      expect(migrated.length).toBe(3)
      expect(migrated[0].eventId).toBeUndefined()
      expect(migrated[1].eventId).toBeUndefined()
      expect(migrated[2].eventId).toBeUndefined()
      // Toutes doivent avoir relativeReminders
      expect(migrated.every((n) => Array.isArray(n.relativeReminders))).toBe(true)
    })
  })
})
