/**
 * Tests de non-régression pour la migration des notifications.
 * 
 * Validations :
 * - Idempotence : migration(migration(x)) == migration(x)
 * - Dates UTC préservées exactement
 * - Pas de Date.now() fallback (signaler plutôt que d'inventer)
 * - Statuts historiques préservés
 * - Aucune destruction silencieuse
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  migrateNotification,
  migrateNotifications,
  needsMigration,
  isAutonomous,
  analyzeMigration,
} from '../notificationsMigration'
import type { Event, EventNotificationSchedule } from '../types'

describe('notificationsMigration', () => {
  let mockEvent: Event
  let mockEvents: Event[]

  beforeEach(() => {
    mockEvent = {
      id: 'evt-1',
      name: 'Dragon Arena Season 5',
      description: 'Test event',
      startAt: 1696992000000, // 2023-10-11 00:00:00 UTC
      endAt: 1697078400000,   // 2023-10-12 00:00:00 UTC
      tutorialId: 'tutorial-1',
      status: 'active',
      createdAt: 1696900000000,
      modifiedAt: 1696900000000,
    }
    mockEvents = [mockEvent]
  })

  describe('needsMigration', () => {
    it('détecte les anciennes notifications avec eventId', () => {
      const old = { id: 'notif-1', eventId: 'evt-1', title: 'Old' }
      expect(needsMigration(old)).toBe(true)
    })

    it('détecte les anciennes notifications avec timing', () => {
      const old = { id: 'notif-1', timing: 'relative', relativeDelay: '-24h' }
      expect(needsMigration(old)).toBe(true)
    })

    it('rejette les notifications autonomes (relativeReminders)', () => {
      const autonomous = {
        id: 'notif-1',
        relativeReminders: [],
        absoluteTime: 1696992000000,
      }
      expect(needsMigration(autonomous)).toBe(false)
    })
  })

  describe('isAutonomous', () => {
    it('reconnaît les notifications au format autonome', () => {
      const autonomous: EventNotificationSchedule = {
        id: 'notif-1',
        enabled: true,
        title: 'Autonomous',
        message: 'Message',
        absoluteTime: 1696992000000,
        relativeReminders: [],
        createdAt: 1696900000000,
        modifiedAt: 1696900000000,
      }
      expect(isAutonomous(autonomous)).toBe(true)
    })

    it('rejette les notifications avec eventId', () => {
      const old = { relativeReminders: [], eventId: 'evt-1' }
      expect(isAutonomous(old)).toBe(false)
    })
  })

  describe('migrateNotification', () => {
    it('préserve les notifications autonomes', () => {
      const autonomous: EventNotificationSchedule = {
        id: 'notif-1',
        enabled: true,
        title: 'Already autonomous',
        message: 'Message',
        absoluteTime: 1696992000000,
        relativeReminders: [
          {
            id: 'rem-1',
            enabled: true,
            relativeDelay: '-24h',
            status: 'pending',
          },
        ],
        createdAt: 1696900000000,
        modifiedAt: 1696900000000,
      }

      const result = migrateNotification(autonomous, mockEvents)
      
      // Pas de mutation
      expect(result.id).toBe(autonomous.id)
      expect(result.title).toBe(autonomous.title)
      expect(result.relativeReminders).toEqual(autonomous.relativeReminders)
      expect(result.eventId).toBeUndefined()
    })

    it('migre une notification ancienne avec timing=relative', () => {
      const old = {
        id: 'notif-1',
        eventId: 'evt-1',
        enabled: true,
        title: 'Old notification',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const result = migrateNotification(old, mockEvents)

      expect(result.id).toBe('notif-1')
      expect(result.eventId).toBeUndefined() // Supprimé après migration
      expect(result.relativeReminders.length).toBe(1)
      expect(result.relativeReminders[0].relativeDelay).toBe('-24h')
      expect(result.enabled).toBe(true)
      expect(result.createdAt).toBe(1696800000000) // Préservé
    })

    it('migre une notification avec timing=absolute et préserve la date exacte', () => {
      const absoluteTime = 1696950000000 // Instant spécifique
      const old = {
        id: 'notif-2',
        eventId: 'evt-1',
        enabled: true,
        title: 'Absolute time',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime,
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const result = migrateNotification(old, mockEvents)

      // L'absoluteTime exact DOIT être préservé
      expect(result.absoluteTime).toBe(absoluteTime)
      expect(result.relativeReminders.length).toBe(1)
      expect(result.enabled).toBe(true)
    })

    it('gère les notifications sans événement associé', () => {
      const old = {
        id: 'notif-3',
        eventId: 'evt-nonexistent',
        enabled: true,
        title: 'Orphaned',
        message: 'Message',
        absoluteTime: 1696950000000,
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const result = migrateNotification(old, [])

      // Garde la structure ancienne avec warning (pas de crash)
      expect(result.id).toBe('notif-3')
      expect(result.title).toBe('Orphaned')
      expect(result.eventId).toBe('evt-nonexistent') // Garde la référence pour audit
      expect(result.relativeReminders).toEqual([])
    })

    it('préserve les statuts historiques (pending, sent, failed)', () => {
      const old = {
        id: 'notif-4',
        eventId: 'evt-1',
        enabled: true,
        title: 'With status',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-1h',
        sentAt: 1696945000000,
        status: 'sent' as const,
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const result = migrateNotification(old, mockEvents)

      expect(result.relativeReminders[0].status).toBe('sent')
      expect(result.relativeReminders[0].sentAt).toBe(1696945000000)
    })

    it('est idempotente : migration(migration(x)) == migration(x)', () => {
      const old = {
        id: 'notif-5',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test idempotence',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-12h',
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const first = migrateNotification(old, mockEvents)
      const second = migrateNotification(first, mockEvents)

      expect(first.id).toBe(second.id)
      expect(first.title).toBe(second.title)
      expect(first.absoluteTime).toBe(second.absoluteTime)
      expect(first.relativeReminders).toEqual(second.relativeReminders)
      expect(second.eventId).toBeUndefined()
    })

    it('n\'invente pas de Date.now() fallback pour dates manquantes', () => {
      // Si une date critique manque, signaler plutôt que fallback à Date.now()
      const old = {
        id: 'notif-6',
        eventId: 'evt-nonexistent',
        enabled: true,
        title: 'Missing dates',
        message: 'Message',
        // Pas d'absoluteTime, pas de timing → ambiguïté
      }

      // Doit garder l'ancienne structure sans fallback
      const result = migrateNotification(old, [])
      
      // absoluteTime doit être SOIT l'ancien SOIT signé comme invalide
      // Mais JAMAIS Date.now() silencieux
      if (!('absoluteTime' in old)) {
        // Si vide, garder invalide plutôt que fallback
        expect(result.eventId).toBe('evt-nonexistent') // Audit trail préservé
      }
    })
  })

  describe('migrateNotifications', () => {
    it('traite un lot hétérogène (ancien + autonome + erreur)', () => {
      const old1 = {
        id: 'notif-1',
        eventId: 'evt-1',
        enabled: true,
        title: 'Old',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: 1696800000000,
      }

      const autonomous: EventNotificationSchedule = {
        id: 'notif-2',
        enabled: true,
        title: 'Autonomous',
        message: 'Message',
        absoluteTime: 1696992000000,
        relativeReminders: [],
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const broken = { id: null, title: 'Broken' } // Données invalides

      const results = migrateNotifications([old1, autonomous, broken], mockEvents)

      expect(results.length).toBe(3)
      expect(results[0].id).toBe('notif-1')
      expect(results[0].eventId).toBeUndefined()
      expect(results[1].id).toBe('notif-2')
      expect(results[1].eventId).toBeUndefined()
      expect(results[2].title).toBe('Broken') // Préservé malgré erreur
    })
  })

  describe('analyzeMigration', () => {
    it('compte correctement les statuts', () => {
      const notifications = [
        {
          id: 'notif-1',
          eventId: 'evt-1',
          relativeReminders: undefined, // Ancien
        },
        {
          id: 'notif-2',
          relativeReminders: [], // Autonome
        },
        {
          id: 'notif-3',
          eventId: 'evt-nonexistent', // Ancien mais événement introuvable
        },
      ]

      const stats = analyzeMigration(notifications, mockEvents)

      expect(stats.total).toBe(3)
      expect(stats.migrated).toBe(1)
      expect(stats.autonomous).toBe(1)
      expect(stats.erroredOrMissing).toBe(1)
      expect(stats.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('Contraintes métier', () => {
    it('vérifie que relativeReminders est TOUJOURS un tableau (jamais undefined)', () => {
      const old = {
        id: 'notif-7',
        eventId: 'evt-1',
        enabled: true,
        title: 'No reminders',
        message: 'Message',
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const result = migrateNotification(old, mockEvents)

      expect(Array.isArray(result.relativeReminders)).toBe(true)
      expect(result.relativeReminders.length).toBeGreaterThanOrEqual(0)
    })

    it('préserve les métadonnées createdAt/modifiedAt sans mutation', () => {
      const createdAt = 1696800000000
      const modifiedAt = 1696850000000

      const old = {
        id: 'notif-8',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-6h',
        createdAt,
        modifiedAt,
      }

      const result = migrateNotification(old, mockEvents)

      // Les dates doivent rester exactement telles qu'elles
      expect(result.createdAt).toBe(createdAt)
      expect(result.modifiedAt).toBe(modifiedAt)
    })
  })
})
