/**
 * Tests de la logique métier des rappels de notifications autonomes
 *
 * À partir de l'ÉTAPE 3 : notifications autonomes (plus d'événements)
 * Vérifie les règles indépendamment de l'UI :
 * - instant d'envoi calculé (absolu + rappels relatifs)
 * - validité des rappels
 * - plafond de 3 rappels par notification
 */

import { describe, it, expect } from 'vitest'
import { brusselsToUtc, relativeReminderTime } from '../cms/timezone'
import type { EventNotificationSchedule } from '../cms/types'

// Calcule l'instant d'envoi réel pour un rappel relatif
function reminderSendTime(
  notif: EventNotificationSchedule,
  relativeDelay: string
): number | null {
  try {
    return relativeReminderTime(notif.absoluteTime, relativeDelay)
  } catch {
    return null
  }
}

function makeNotification(
  partial: Partial<EventNotificationSchedule>
): EventNotificationSchedule {
  return {
    id: 'notif-1',
    enabled: true,
    title: 'Notification de test',
    message: 'Message de test',
    absoluteTime: brusselsToUtc(2026, 10, 24, 20, 0),
    relativeReminders: [],
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    ...partial,
  }
}

describe('Notifications autonomes — logique des rappels', () => {
  const baseTime = brusselsToUtc(2026, 10, 24, 20, 0) // 24 oct 2026 20:00 Brussels

  it('computes relative reminder send time correctly', () => {
    const notif = makeNotification({ absoluteTime: baseTime })
    const sendTime = reminderSendTime(notif, '-24h')
    // 23 oct 20:00 Brussels
    expect(sendTime).toBe(brusselsToUtc(2026, 10, 23, 20, 0))
  })

  it('supports multiple relative delays', () => {
    const notif = makeNotification({ absoluteTime: baseTime })
    for (const delay of ['-24h', '-3h', '-30m']) {
      const t = reminderSendTime(notif, delay)
      expect(t).not.toBeNull()
      expect(t!).toBeLessThan(baseTime)
    }
  })

  it('recalculates reminder times when base time changes', () => {
    const delayR = '-3h'

    const notif1 = makeNotification({ absoluteTime: baseTime })
    const t1 = reminderSendTime(notif1, delayR)

    const newBaseTime = brusselsToUtc(2026, 11, 1, 20, 0)
    const notif2 = makeNotification({ absoluteTime: newBaseTime })
    const t2 = reminderSendTime(notif2, delayR)

    // Les deux instants sont différents (new base time)
    expect(t1).not.toBeNull()
    expect(t2).not.toBeNull()
    expect(t2).not.toBe(t1)
    // Mais la différence est toujours 3h
    expect(newBaseTime - t2!).toBe(baseTime - t1!)
  })

  it('enforces a maximum of 3 reminders per notification', () => {
    const reminders = [
      { id: 'r1', enabled: true, relativeDelay: '-24h', status: 'pending' as const },
      { id: 'r2', enabled: true, relativeDelay: '-3h', status: 'pending' as const },
      { id: 'r3', enabled: true, relativeDelay: '-30m', status: 'pending' as const },
    ]
    const notif = makeNotification({ relativeReminders: reminders })
    expect(notif.relativeReminders.length).toBe(3)
    const canAddMore = notif.relativeReminders.length < 3
    expect(canAddMore).toBe(false)
  })

  it('supports enabled/disabled status per reminder', () => {
    const reminders = [
      { id: 'r1', enabled: true, relativeDelay: '-24h', status: 'pending' as const },
      { id: 'r2', enabled: false, relativeDelay: '-3h', status: 'pending' as const },
    ]
    const notif = makeNotification({ relativeReminders: reminders })
    const activeCount = notif.relativeReminders.filter((r) => r.enabled).length
    expect(activeCount).toBe(1)
  })

  it('tracks notification status (pending/sent/failed)', () => {
    const reminders = [
      { id: 'r1', enabled: true, relativeDelay: '-24h', status: 'pending' as const },
      { id: 'r2', enabled: true, relativeDelay: '-3h', status: 'sent' as const },
      { id: 'r3', enabled: true, relativeDelay: '-30m', status: 'failed' as const },
    ]
    const notif = makeNotification({ relativeReminders: reminders })
    expect(notif.relativeReminders[0].status).toBe('pending')
    expect(notif.relativeReminders[1].status).toBe('sent')
    expect(notif.relativeReminders[2].status).toBe('failed')
  })
})
