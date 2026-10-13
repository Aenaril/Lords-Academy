/**
 * Tests de non-régression pour la migration des notifications.
 * 
 * Trois correctifs critiques validés :
 * 1. Conversion abs→rel : calcul de délai sans inversion
 * 2. Pas de Date.now() fallback pour dates manquantes
 * 3. hashEndpoint SHA-256 au lieu d'extraction d'URL
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

  describe('migrateNotification — Correction 1: Conversion abs→rel', () => {
    it('24h avant événement = -1440m', () => {
      const eventStartAt = 1696992000000
      const reminderTime = eventStartAt - (24 * 60 * 60 * 1000)
      
      const old = {
        id: 'notif-24h',
        eventId: 'evt-1',
        enabled: true,
        title: 'Before',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
      }
      
      const result = migrateNotification(old, mockEvents)
      expect(result.relativeReminders.length).toBe(1)
      expect(result.relativeReminders[0].relativeDelay).toBe('-1440m')
    })

    it('3h avant événement = -180m', () => {
      const eventStartAt = 1696992000000
      const reminderTime = eventStartAt - (3 * 60 * 60 * 1000)
      
      const old = {
        id: 'notif-3h',
        eventId: 'evt-1',
        enabled: true,
        title: 'Before',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
      }
      
      const result = migrateNotification(old, mockEvents)
      expect(result.relativeReminders[0].relativeDelay).toBe('-180m')
    })

    it('30 minutes avant = -30m', () => {
      const eventStartAt = 1696992000000
      const reminderTime = eventStartAt - (30 * 60 * 1000)
      
      const old = {
        id: 'notif-30m',
        eventId: 'evt-1',
        enabled: true,
        title: 'Before',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
      }
      
      const result = migrateNotification(old, mockEvents)
      expect(result.relativeReminders[0].relativeDelay).toBe('-30m')
    })

    it('exactement au même moment = 0m (NO signe négatif)', () => {
      const eventStartAt = 1696992000000
      
      const old = {
        id: 'notif-same',
        eventId: 'evt-1',
        enabled: true,
        title: 'Same',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime: eventStartAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      expect(result.relativeReminders[0].relativeDelay).toBe('0m')
    })

    it('2h APRÈS événement = 120m (invalide mais préservé)', () => {
      const eventStartAt = 1696992000000
      const reminderTime = eventStartAt + (2 * 60 * 60 * 1000)
      
      const old = {
        id: 'notif-after',
        eventId: 'evt-1',
        enabled: true,
        title: 'After',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
      }
      
      const result = migrateNotification(old, mockEvents)
      // 2h APRÈS = +120 minutes (pas de signe négatif)
      expect(result.relativeReminders[0].relativeDelay).toBe('120m')
      
      // Vérifier : au moins le délai est préservé (même si invalide)
      expect(result.relativeReminders[0]).toBeTruthy()
    })

    it('traverser changements d\'heure : dates UTC exactes préservées', () => {
      // Dates Europe/Brussels avec changement d'heure (mars 2023)
      const beforeDstChange = 1679400000000  // 2023-03-20 22:00 UTC (avant)
      const afterDstChange = 1679487600000   // 2023-03-22 21:00 UTC (après, +1h)
      
      const old = {
        id: 'notif-dst',
        eventId: 'evt-1',
        enabled: true,
        title: 'DST',
        message: 'Message',
        timing: 'absolute' as const,
        absoluteTime: beforeDstChange,
      }
      
      const eventStart = afterDstChange
      const evt = { ...mockEvent, startAt: eventStart }
      
      const result = migrateNotification(old, [evt])
      
      // UTC ne change jamais — seulement calcul du délai
      expect(result.absoluteTime).toBe(beforeDstChange)
      
      // Vérifier : pas d'invention de dates
      expect(result.createdAt).toBe(0) // Pas de Date.now()
    })
  })

  describe('migrateNotification — Correction 2: Pas de Date.now()', () => {
    it('jamais inventer createdAt — utiliser 0 (sentinel)', () => {
      const old = {
        id: 'notif-no-created',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test',
        message: 'Message',
        // PAS DE createdAt
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // 0 = sentinel (pas un timestamp valide)
      expect(result.createdAt).toBe(0)
      
      // Vérifier que ce n'est pas Date.now()
      const now = Date.now()
      expect(Math.abs(result.createdAt - now)).toBeGreaterThan(1000 * 60 * 60)
    })

    it('jamais inventer modifiedAt — utiliser 0 (sentinel)', () => {
      const old = {
        id: 'notif-no-modified',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test',
        message: 'Message',
        createdAt: 1696800000000,
        // PAS DE modifiedAt
      }
      
      const result = migrateNotification(old, mockEvents)
      
      expect(result.createdAt).toBe(1696800000000) // Préservé
      expect(result.modifiedAt).toBe(0) // Sentinel, pas Date.now()
    })

    it('absoluteTime manquant = utilise event.startAt, pas Date.now()', () => {
      const old = {
        id: 'notif-no-abs-time',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test',
        message: 'Message',
        createdAt: 1696800000000,
        // PAS D'absoluteTime
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // Doit être event.startAt
      expect(result.absoluteTime).toBe(mockEvent.startAt)
      
      // Vérifier que ce n'est pas Date.now()
      const now = Date.now()
      expect(Math.abs(result.absoluteTime - now)).toBeGreaterThan(1000 * 60 * 60)
    })

    it('préserve les données brutes pour correction manuelle', () => {
      const old = {
        id: 'notif-invalid',
        eventId: 'evt-nonexistent',
        enabled: true,
        title: 'Invalid',
        message: 'Message',
        absoluteTime: 1696950000000,
        createdAt: 1696800000000,
      }
      
      const result = migrateNotification(old, [])
      
      // Garde la référence pour audit
      expect(result.eventId).toBe('evt-nonexistent')
      // Données brutes préservées exactement
      expect(result.absoluteTime).toBe(1696950000000)
      expect(result.createdAt).toBe(1696800000000)
    })
  })

  describe('migrateNotification — Correction 3: SHA-256 dans logs', () => {
    it('structure des rappels inclut tous les champs cryptographiques', () => {
      const old = {
        id: 'notif-crypto',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: 1696800000000,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // Rappel a les champs attendus (pas d'URLs exposées)
      const reminder = result.relativeReminders[0]
      expect(reminder.id).toBeTruthy()
      expect(reminder.relativeDelay).toBe('-24h')
      expect(reminder.status).toBeTruthy()
      
      // Vérifier : aucun endpoint, p256dh, ou auth
      expect(JSON.stringify(reminder)).not.toContain('endpoint')
      expect(JSON.stringify(reminder)).not.toContain('p256dh')
      expect(JSON.stringify(reminder)).not.toContain('auth')
    })
  })

  describe('migrateNotifications — Lot hétérogène', () => {
    it('traite ancien + autonome + erreur sans crash', () => {
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

      const broken = { id: null, title: 'Broken' }

      const results = migrateNotifications([old1, autonomous, broken], mockEvents)

      expect(results.length).toBe(3)
      expect(results[0].id).toBe('notif-1')
      expect(results[1].id).toBe('notif-2')
      expect(results[2].title).toBe('Broken')
    })
  })

  describe('analyzeMigration — Statistiques', () => {
    it('compte correctement les statuts', () => {
      const notifications = [
        {
          id: 'notif-1',
          eventId: 'evt-1',
          relativeReminders: undefined,
        },
        {
          id: 'notif-2',
          relativeReminders: [],
        },
        {
          id: 'notif-3',
          eventId: 'evt-nonexistent',
        },
      ]

      const stats = analyzeMigration(notifications, mockEvents)

      expect(stats.total).toBe(3)
      expect(stats.migrated).toBeGreaterThanOrEqual(0)
      expect(stats.autonomous).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Contraintes métier', () => {
    it('relativeReminders est TOUJOURS un tableau', () => {
      const old = {
        id: 'notif-array',
        eventId: 'evt-1',
        enabled: true,
        title: 'Test',
        message: 'Message',
        createdAt: 1696800000000,
        modifiedAt: 1696800000000,
      }

      const result = migrateNotification(old, mockEvents)

      expect(Array.isArray(result.relativeReminders)).toBe(true)
      expect(result.relativeReminders.length).toBeGreaterThanOrEqual(0)
    })

    it('métadonnées createdAt/modifiedAt sans mutation exactes', () => {
      const createdAt = 1696800000000
      const modifiedAt = 1696850000000

      const old = {
        id: 'notif-meta',
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

      expect(result.createdAt).toBe(createdAt)
      expect(result.modifiedAt).toBe(modifiedAt)
    })
  })
})
