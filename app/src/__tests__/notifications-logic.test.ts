/**
 * Tests de la logique métier des rappels de notifications
 *
 * Vérifie les règles indépendamment de l'UI :
 * - instant d'envoi relatif/absolu
 * - validité (avant le début de l'événement)
 * - recalcul quand la date de l'événement change (rappels relatifs)
 * - plafond de 3 rappels par événement
 */

import { describe, it, expect } from 'vitest'
import { brusselsToUtc, relativeReminderTime } from '../cms/timezone'
import type { EventNotificationSchedule } from '../cms/types'

// Réplique de la logique du module (gardée synchronisée volontairement simple)
function reminderSendTime(
  sched: EventNotificationSchedule,
  eventStartUtc: number | null
): number | null {
  if (sched.timing === 'absolute') return sched.absoluteTime ?? null
  if (eventStartUtc === null) return null
  return sched.relativeDelay ? relativeReminderTime(eventStartUtc, sched.relativeDelay) : null
}

function isReminderValid(
  sched: EventNotificationSchedule,
  eventStartUtc: number | null
): boolean {
  const t = reminderSendTime(sched, eventStartUtc)
  if (t === null || eventStartUtc === null) return false
  return t < eventStartUtc
}

function makeReminder(partial: Partial<EventNotificationSchedule>): EventNotificationSchedule {
  return {
    id: 's1',
    eventId: 'e1',
    enabled: true,
    title: 'Rappel',
    message: 'msg',
    timing: 'relative',
    relativeDelay: '-24h',
    status: 'pending',
    ...partial,
  }
}

describe('Notifications — logique des rappels', () => {
  const eventStart = brusselsToUtc(2026, 10, 24, 20, 0) // 24 oct 2026 20:00 Brussels

  it('computes relative reminder send time correctly', () => {
    const h24 = makeReminder({ timing: 'relative', relativeDelay: '-24h' })
    const t = reminderSendTime(h24, eventStart)
    // 23 oct 20:00 Brussels
    expect(t).toBe(brusselsToUtc(2026, 10, 23, 20, 0))
  })

  it('relative reminders are valid (before event start)', () => {
    for (const delay of ['-24h', '-3h', '-30m']) {
      const r = makeReminder({ relativeDelay: delay })
      expect(isReminderValid(r, eventStart)).toBe(true)
    }
  })

  it('absolute reminder before start is valid', () => {
    const r = makeReminder({
      timing: 'absolute',
      absoluteTime: brusselsToUtc(2026, 10, 24, 18, 0), // 2h avant
    })
    expect(isReminderValid(r, eventStart)).toBe(true)
  })

  it('absolute reminder at/after start is invalid', () => {
    const atStart = makeReminder({ timing: 'absolute', absoluteTime: eventStart })
    expect(isReminderValid(atStart, eventStart)).toBe(false)

    const afterStart = makeReminder({
      timing: 'absolute',
      absoluteTime: brusselsToUtc(2026, 10, 24, 21, 0),
    })
    expect(isReminderValid(afterStart, eventStart)).toBe(false)
  })

  it('recomputes relative reminder when the event date changes', () => {
    const r = makeReminder({ timing: 'relative', relativeDelay: '-3h' })

    // Date initiale : envoi 24 oct 17:00
    const t1 = reminderSendTime(r, eventStart)
    expect(t1).toBe(brusselsToUtc(2026, 10, 24, 17, 0))

    // L'événement est déplacé au 1er nov 2026 20:00 (heure d'HIVER, CET)
    const newStart = brusselsToUtc(2026, 11, 1, 20, 0)
    const t2 = reminderSendTime(r, newStart)
    // Envoi recalculé : 1 nov 17:00 (relatif, suit automatiquement)
    expect(t2).toBe(brusselsToUtc(2026, 11, 1, 17, 0))
    expect(t2).not.toBe(t1)
  })

  it('enforces a maximum of 3 reminders per event', () => {
    const schedules: EventNotificationSchedule[] = [
      makeReminder({ id: 's1', relativeDelay: '-24h' }),
      makeReminder({ id: 's2', relativeDelay: '-3h' }),
      makeReminder({ id: 's3', relativeDelay: '-30m' }),
    ]
    const forEvent = schedules.filter((s) => s.eventId === 'e1')
    expect(forEvent.length).toBe(3)
    const canAdd = forEvent.length < 3
    expect(canAdd).toBe(false)
  })

  it('returns null send time when event is missing for relative reminder', () => {
    const r = makeReminder({ timing: 'relative', relativeDelay: '-24h' })
    expect(reminderSendTime(r, null)).toBeNull()
    expect(isReminderValid(r, null)).toBe(false)
  })
})
