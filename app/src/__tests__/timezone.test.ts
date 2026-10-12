/**
 * Tests du fuseau Europe/Brussels — gestion CEST/CET et conversions
 */

import { describe, it, expect } from 'vitest'
import {
  brusselsToUtc,
  utcToBrusselsParts,
  utcToDatetimeLocalValue,
  datetimeLocalValueToUtc,
  parseRelativeDelay,
  relativeReminderTime,
} from '../cms/timezone'

describe('timezone Europe/Brussels', () => {
  describe('brusselsToUtc (heure d\'été CEST = UTC+2)', () => {
    it('converts 24 oct 2026 20:00 Brussels to correct UTC', () => {
      // Fin octobre 2026 : encore heure d'été jusqu'au 25 oct. Le 24 → CEST (UTC+2)
      const utc = brusselsToUtc(2026, 10, 24, 20, 0)
      // 20:00 CEST = 18:00 UTC
      expect(new Date(utc).toISOString()).toBe('2026-10-24T18:00:00.000Z')
    })
  })

  describe('brusselsToUtc (heure d\'hiver CET = UTC+1)', () => {
    it('converts 15 jan 2026 20:00 Brussels to correct UTC', () => {
      const utc = brusselsToUtc(2026, 1, 15, 20, 0)
      // 20:00 CET = 19:00 UTC
      expect(new Date(utc).toISOString()).toBe('2026-01-15T19:00:00.000Z')
    })
  })

  describe('round-trip UTC → Brussels parts → UTC', () => {
    it('is stable for a summer date', () => {
      const original = brusselsToUtc(2026, 7, 1, 14, 30)
      const parts = utcToBrusselsParts(original)
      expect(parts.year).toBe(2026)
      expect(parts.month).toBe(7)
      expect(parts.day).toBe(1)
      expect(parts.hour).toBe(14)
      expect(parts.minute).toBe(30)
    })

    it('is stable for a winter date', () => {
      const original = brusselsToUtc(2026, 12, 25, 9, 15)
      const parts = utcToBrusselsParts(original)
      expect(parts.month).toBe(12)
      expect(parts.day).toBe(25)
      expect(parts.hour).toBe(9)
      expect(parts.minute).toBe(15)
    })
  })

  describe('datetime-local value conversions', () => {
    it('formats UTC to datetime-local value in Brussels time', () => {
      const utc = brusselsToUtc(2026, 10, 24, 20, 0)
      expect(utcToDatetimeLocalValue(utc)).toBe('2026-10-24T20:00')
    })

    it('parses datetime-local value as Brussels time', () => {
      const utc = datetimeLocalValueToUtc('2026-10-24T20:00')
      expect(new Date(utc!).toISOString()).toBe('2026-10-24T18:00:00.000Z')
    })

    it('returns empty string for undefined', () => {
      expect(utcToDatetimeLocalValue(undefined)).toBe('')
    })

    it('returns undefined for empty input', () => {
      expect(datetimeLocalValueToUtc('')).toBeUndefined()
    })
  })

  describe('relative delays', () => {
    it('parses -24h, -3h, -30m', () => {
      expect(parseRelativeDelay('-24h')).toBe(-24 * 3600000)
      expect(parseRelativeDelay('-3h')).toBe(-3 * 3600000)
      expect(parseRelativeDelay('-30m')).toBe(-30 * 60000)
    })

    it('parses -1d', () => {
      expect(parseRelativeDelay('-1d')).toBe(-86400000)
    })

    it('returns null for invalid format', () => {
      expect(parseRelativeDelay('nope')).toBeNull()
      expect(parseRelativeDelay('+3h')).toBeNull()
    })

    it('computes reminder time before event start', () => {
      // Événement 24 oct 2026 20:00 Brussels
      const eventStart = brusselsToUtc(2026, 10, 24, 20, 0)

      // H-24 → 23 oct 20:00 Brussels
      const h24 = relativeReminderTime(eventStart, '-24h')
      expect(utcToDatetimeLocalValue(h24!)).toBe('2026-10-23T20:00')

      // H-3 → 24 oct 17:00 Brussels
      const h3 = relativeReminderTime(eventStart, '-3h')
      expect(utcToDatetimeLocalValue(h3!)).toBe('2026-10-24T17:00')

      // H-30m → 24 oct 19:30 Brussels
      const h30m = relativeReminderTime(eventStart, '-30m')
      expect(utcToDatetimeLocalValue(h30m!)).toBe('2026-10-24T19:30')
    })

    it('reminder is always before event start', () => {
      const eventStart = brusselsToUtc(2026, 10, 24, 20, 0)
      for (const delay of ['-24h', '-3h', '-30m']) {
        const t = relativeReminderTime(eventStart, delay)!
        expect(t).toBeLessThan(eventStart)
      }
    })
  })
})
