/**
 * Test CmsConfigLoader — Vérifie le chargement et le filtrage des configs CMS
 */

import { describe, it, expect } from 'vitest'
import { getActiveAnnouncements } from '../cms/CmsConfigLoader'

describe('CmsConfigLoader', () => {
  describe('getActiveAnnouncements', () => {
    it('should return active announcements (from cache or loaded configs)', () => {
      // Cette fonction charge depuis CmsConfigLoader qui charge depuis /cms/announcements.json
      // Si le fichier n'existe pas en test, il devrait retourner []
      // Si le fichier existe, il devrait le charger

      const active = getActiveAnnouncements()

      // Vérifier le type
      expect(Array.isArray(active)).toBe(true)

      // Vérifier que chaque annonce est valide
      for (const ann of active) {
        if (ann.id) {
          // Si une annonce est retournée, elle doit avoir les champs requis
          expect(typeof ann.id).toBe('string')
          expect(typeof ann.title).toBe('string')
          expect(typeof ann.enabled).toBe('boolean')

          // Vérifier la logique de visibilité (si présente)
          if (ann.enabled) {
            const now = Date.now()

            // Si visibilityStartAt est défini et dans le futur, l'annonce ne devrait pas être active
            if (ann.visibilityStartAt !== undefined) {
              expect(now).toBeGreaterThanOrEqual(ann.visibilityStartAt)
            }

            // Si visibilityEndAt est défini et dans le passé, l'annonce ne devrait pas être active
            if (ann.visibilityEndAt !== undefined) {
              expect(now).toBeLessThanOrEqual(ann.visibilityEndAt)
            }
          }
        }
      }

      console.log(`✅ Loaded ${active.length} active announcements`)
    })

    it('should filter out disabled announcements', () => {
      const active = getActiveAnnouncements()

      // Toutes les annonces retournées doivent avoir enabled === true
      for (const ann of active) {
        expect(ann.enabled).toBe(true)
      }
    })

    it('should filter out announcements outside visibility window', () => {
      const active = getActiveAnnouncements()
      const now = Date.now()

      for (const ann of active) {
        // Si l'annonce est active, elle doit être dans la fenêtre de visibilité
        if (ann.visibilityStartAt !== undefined) {
          expect(now).toBeGreaterThanOrEqual(ann.visibilityStartAt)
        }
        if (ann.visibilityEndAt !== undefined) {
          expect(now).toBeLessThanOrEqual(ann.visibilityEndAt)
        }
      }
    })
  })
})
