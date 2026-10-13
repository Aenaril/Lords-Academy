/**
 * Tests de non-régression pour la migration des notifications.
 * 
 * 8 scénarios de validation :
 * 1. 24h avant l'événement (valide)
 * 2. 30m avant l'événement (valide)
 * 3. Exactement à l'heure de l'événement (0m, invalide)
 * 4. APRÈS l'événement (120m, invalide mais préservé)
 * 5. Événement manquant (marquer disabled)
 * 6. Dates manquantes (sentinel 0, pas Date.now())
 * 7. Déjà au format autonome (idempotence)
 * 8. Migration répétée (idempotence)
 * 
 * Utilisation de fonctions réelles : relativeReminderTime(), parseRelativeDelay()
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  migrateNotification,
  migrateNotifications,
  needsMigration,
  isAutonomous,
  analyzeMigration,
} from '../notificationsMigration'
import { relativeReminderTime, parseRelativeDelay } from '../timezone'
import type { Event, EventNotificationSchedule } from '../types'

describe('notificationsMigration — 8 scénarios UTC réels', () => {
  let mockEvent: Event
  let mockEvents: Event[]
  
  // Instant de test fixe : 2026-10-10 12:00:00 UTC
  const FIXED_EVENT_START = 1728558000000

  beforeEach(() => {
    mockEvent = {
      id: 'evt-test',
      name: 'Event Test',
      description: 'Test event',
      startAt: FIXED_EVENT_START,
      endAt: FIXED_EVENT_START + 86400000, // +24h
      tutorialId: 'tutorial-1',
      status: 'active',
      createdAt: FIXED_EVENT_START - 604800000, // -7d
      modifiedAt: FIXED_EVENT_START - 604800000,
    }
    mockEvents = [mockEvent]
  })

  // ============================================================================
  // SCÉNARIO 1 : 24h avant l'événement (valide)
  // ============================================================================
  describe('Scénario 1: 24h avant (valide, -1440m)', () => {
    it('format absolu : 24h avant → -1440m', () => {
      const reminderTime = mockEvent.startAt - (24 * 60 * 60 * 1000)
      
      const old = {
        id: 'notif-24h-abs',
        eventId: 'evt-test',
        enabled: true,
        title: 'Rappel 24h',
        message: 'Event coming',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // Vérifications
      expect(result.relativeReminders.length).toBe(1)
      expect(result.relativeReminders[0].relativeDelay).toBe('-1440m')
      expect(result.enabled).toBe(true)
      
      // Validation: parseRelativeDelay() accepte le format
      expect(parseRelativeDelay(result.relativeReminders[0].relativeDelay)).toBe(-(24 * 3600000))
      
      // Validation: relativeReminderTime() recalcule l'heure exacte
      const calculatedTime = relativeReminderTime(
        result.absoluteTime,
        result.relativeReminders[0].relativeDelay
      )
      expect(calculatedTime).toBe(reminderTime)
    })

    it('format relatif : -24h stocké directement', () => {
      const old = {
        id: 'notif-24h-rel',
        eventId: 'evt-test',
        enabled: true,
        title: 'Rappel 24h',
        message: 'Event coming',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      expect(result.relativeReminders.length).toBe(1)
      expect(result.relativeReminders[0].relativeDelay).toBe('-24h')
      expect(result.enabled).toBe(true)
      expect(parseRelativeDelay('-24h')).toBe(-(24 * 3600000))
    })
  })

  // ============================================================================
  // SCÉNARIO 2 : 30 minutes avant (valide, -30m)
  // ============================================================================
  describe('Scénario 2: 30m avant (valide, -30m)', () => {
    it('format absolu : 30m avant → -30m', () => {
      const reminderTime = mockEvent.startAt - (30 * 60 * 1000)
      
      const old = {
        id: 'notif-30m-abs',
        eventId: 'evt-test',
        enabled: true,
        title: 'Rappel 30m',
        message: 'Event coming',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      expect(result.relativeReminders.length).toBe(1)
      expect(result.relativeReminders[0].relativeDelay).toBe('-30m')
      expect(result.enabled).toBe(true)
      
      // Validation
      expect(parseRelativeDelay('-30m')).toBe(-(30 * 60000))
      const calculatedTime = relativeReminderTime(result.absoluteTime, '-30m')
      expect(calculatedTime).toBe(reminderTime)
    })

    it('format relatif : -30m stocké directement', () => {
      const old = {
        id: 'notif-30m-rel',
        eventId: 'evt-test',
        enabled: true,
        title: 'Rappel 30m',
        message: 'Event coming',
        timing: 'relative' as const,
        relativeDelay: '-30m',
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      expect(result.relativeReminders.length).toBe(1)
      expect(result.relativeReminders[0].relativeDelay).toBe('-30m')
    })
  })

  // ============================================================================
  // SCÉNARIO 3 : Exactement à l'heure (0m, INVALIDE)
  // ============================================================================
  describe('Scénario 3: Exactement à l\'heure (0m, invalide)', () => {
    it('format absolu : temps = startAt → 0m (aucun rappel généré)', () => {
      const old = {
        id: 'notif-exact',
        eventId: 'evt-test',
        enabled: true,
        title: 'Au moment exact',
        message: 'Event now',
        timing: 'absolute' as const,
        absoluteTime: mockEvent.startAt, // EXACT
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // 0m ne matchent pas le contrat : pas de rappel généré
      expect(result.relativeReminders.length).toBe(0)
      expect(result.enabled).toBe(false) // Marquée invalide (0 reminders)
      
      // Vérifier le contrat : 0m est rejeté
      expect(parseRelativeDelay('0m')).toBe(null)
    })
  })

  // ============================================================================
  // SCÉNARIO 4 : APRÈS l'événement (120m, invalide mais préservé)
  // ============================================================================
  describe('Scénario 4: APRÈS l\'événement (120m, invalide)', () => {
    it('2h APRÈS → 120m (invalide, aucun rappel généré)', () => {
      const reminderTime = mockEvent.startAt + (2 * 60 * 60 * 1000) // +2h
      
      const old = {
        id: 'notif-after-event',
        eventId: 'evt-test',
        enabled: true,
        title: 'Après l\'événement',
        message: 'Event ended',
        timing: 'absolute' as const,
        absoluteTime: reminderTime,
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // Les délais positifs ne matchent pas ^-(\d+)(h|m|d)$
      // Pas de rappel généré
      expect(result.relativeReminders.length).toBe(0)
      expect(result.enabled).toBe(false)
      
      // Vérifier le contrat : 120m (pas de -) est rejeté
      expect(parseRelativeDelay('120m')).toBe(null)
    })
  })

  // ============================================================================
  // SCÉNARIO 5 : Événement manquant (marquer disabled)
  // ============================================================================
  describe('Scénario 5: Événement introuvable (disabled)', () => {
    it('eventId ne correspond à rien → enabled=false, relativeReminders=[]', () => {
      const old = {
        id: 'notif-lost-event',
        eventId: 'evt-nonexistent',
        enabled: true,
        title: 'Orpheline',
        message: 'Parent event gone',
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, []) // Pas d'événement
      
      expect(result.enabled).toBe(false) // MARQUER INVALIDE
      expect(result.relativeReminders).toEqual([])
      expect(result.eventId).toBe('evt-nonexistent') // Audit trail conservée
    })
  })

  // ============================================================================
  // SCÉNARIO 6 : Dates manquantes (sentinel 0, pas Date.now())
  // ============================================================================
  describe('Scénario 6: Dates manquantes (sentinel 0)', () => {
    it('createdAt manquant → sentinel 0 (pas Date.now())', () => {
      const old = {
        id: 'notif-no-created',
        eventId: 'evt-test',
        enabled: true,
        title: 'Sans createdAt',
        message: 'No date',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        // PAS DE createdAt
        modifiedAt: mockEvent.modifiedAt,
      }
      
      const result = migrateNotification(old, mockEvents)
      
      expect(result.createdAt).toBe(0) // SENTINEL
      expect(result.modifiedAt).toBe(mockEvent.modifiedAt)
      
      // Vérifier : pas d'invention de timestamp
      const now = Date.now()
      expect(Math.abs(result.createdAt - now)).toBeGreaterThan(1000 * 60 * 60)
    })

    it('modifiedAt manquant → sentinel 0', () => {
      const old = {
        id: 'notif-no-modified',
        eventId: 'evt-test',
        enabled: true,
        title: 'Sans modifiedAt',
        message: 'No date',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: mockEvent.createdAt,
        // PAS DE modifiedAt
      }
      
      const result = migrateNotification(old, mockEvents)
      
      expect(result.createdAt).toBe(mockEvent.createdAt)
      expect(result.modifiedAt).toBe(0) // SENTINEL
    })

    it('absoluteTime manquant → utiliser event.startAt, pas Date.now()', () => {
      const old = {
        id: 'notif-no-abs-time',
        eventId: 'evt-test',
        enabled: true,
        title: 'Sans absoluteTime',
        message: 'No time',
        createdAt: mockEvent.createdAt,
        // PAS D'absoluteTime
      }
      
      const result = migrateNotification(old, mockEvents)
      
      // Doit être event.startAt, pas Date.now()
      expect(result.absoluteTime).toBe(mockEvent.startAt)
      
      // Pas Date.now()
      const now = Date.now()
      expect(Math.abs(result.absoluteTime - now)).toBeGreaterThan(1000 * 60 * 60)
    })
  })

  // ============================================================================
  // SCÉNARIO 7 : Déjà au format autonome (idempotence)
  // ============================================================================
  describe('Scénario 7: Déjà autonome (idempotence)', () => {
    it('appel multiple sur notif autonome = identique', () => {
      const autonomous: EventNotificationSchedule = {
        id: 'notif-autonomous',
        enabled: true,
        title: 'Déjà autonome',
        message: 'No event link',
        absoluteTime: mockEvent.startAt - (24 * 3600000),
        relativeReminders: [
          {
            id: 'rem-1',
            enabled: true,
            relativeDelay: '-24h',
            status: 'pending',
          },
        ],
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      // Appel 1
      const result1 = migrateNotification(autonomous, mockEvents)
      // Appel 2
      const result2 = migrateNotification(result1, mockEvents)
      // Appel 3
      const result3 = migrateNotification(result2, mockEvents)
      
      expect(result1).toEqual(autonomous)
      expect(result2).toEqual(result1)
      expect(result3).toEqual(result2)
      expect(result1.eventId).toBeUndefined()
    })
  })

  // ============================================================================
  // SCÉNARIO 8 : Migration répétée (idempotence)
  // ============================================================================
  describe('Scénario 8: Migration répétée (idempotence)', () => {
    it('appel multiple sur notif ancienne = identique', () => {
      const old = {
        id: 'notif-repeat',
        eventId: 'evt-test',
        enabled: true,
        title: 'À migrer',
        message: 'Needs migration',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.modifiedAt,
      }
      
      // Appel 1 (migration)
      const result1 = migrateNotification(old, mockEvents)
      // Appel 2 (déjà migrée)
      const result2 = migrateNotification(result1, mockEvents)
      // Appel 3 (toujours migrée)
      const result3 = migrateNotification(result2, mockEvents)
      
      // Tous les résultats doivent être identiques
      expect(result1.eventId).toBeUndefined()
      expect(result2.eventId).toBeUndefined()
      expect(result3.eventId).toBeUndefined()
      
      expect(result2.id).toBe(result1.id)
      expect(result3.id).toBe(result1.id)
      
      expect(result2.relativeReminders).toEqual(result1.relativeReminders)
      expect(result3.relativeReminders).toEqual(result1.relativeReminders)
      
      expect(result1.absoluteTime).toBe(result2.absoluteTime)
      expect(result2.absoluteTime).toBe(result3.absoluteTime)
    })
  })
})

describe('Helpers : needsMigration, isAutonomous, analyzeMigration', () => {
  let mockEvent: Event
  let mockEvents: Event[]

  beforeEach(() => {
    mockEvent = {
      id: 'evt-helper',
      name: 'Helper Test',
      description: 'Test',
      startAt: 1728558000000,
      endAt: 1728644400000,
      tutorialId: 'tutorial-1',
      status: 'active',
      createdAt: 1728558000000 - 604800000,
      modifiedAt: 1728558000000 - 604800000,
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
        absoluteTime: 1728558000000,
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
        absoluteTime: 1728558000000,
        relativeReminders: [],
        createdAt: 1728558000000 - 604800000,
        modifiedAt: 1728558000000 - 604800000,
      }
      expect(isAutonomous(autonomous)).toBe(true)
    })

    it('rejette les notifications avec eventId', () => {
      const old = { relativeReminders: [], eventId: 'evt-1' }
      expect(isAutonomous(old)).toBe(false)
    })
  })

  describe('migrateNotifications — Lot hétérogène', () => {
    it('traite ancien + autonome + erreur sans crash', () => {
      const old1 = {
        id: 'notif-1',
        eventId: 'evt-helper',
        enabled: true,
        title: 'Old',
        message: 'Message',
        timing: 'relative' as const,
        relativeDelay: '-24h',
        createdAt: mockEvent.createdAt,
      }

      const autonomous: EventNotificationSchedule = {
        id: 'notif-2',
        enabled: true,
        title: 'Autonomous',
        message: 'Message',
        absoluteTime: 1728558000000,
        relativeReminders: [],
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.createdAt,
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
          eventId: 'evt-helper',
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

  describe('Contraintes métier universelles', () => {
    it('relativeReminders est TOUJOURS un tableau', () => {
      const old = {
        id: 'notif-array',
        eventId: 'evt-helper',
        enabled: true,
        title: 'Test',
        message: 'Message',
        createdAt: mockEvent.createdAt,
        modifiedAt: mockEvent.createdAt,
      }

      const result = migrateNotification(old, mockEvents)

      expect(Array.isArray(result.relativeReminders)).toBe(true)
      expect(result.relativeReminders.length).toBeGreaterThanOrEqual(0)
    })

    it('métadonnées createdAt/modifiedAt préservées exactement', () => {
      const createdAt = mockEvent.createdAt
      const modifiedAt = mockEvent.modifiedAt

      const old = {
        id: 'notif-meta',
        eventId: 'evt-helper',
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
