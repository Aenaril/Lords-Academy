/**
 * Couche de persistance CMS côté serveur
 *
 * Stocke les données CMS non publiées (brouillons, configurations, bibliothèques)
 * via l'abstraction de stockage déployée (Durable Objects par défaut, KV en
 * fallback) — voir getCmsDocStore() dans storage.ts.
 *
 * IMPORTANT :
 * - Le CMS administre UN seul site. Les données sont partagées par tous les
 *   administrateurs R4 autorisés (collection globale), via des clés stables.
 * - On n'utilise JAMAIS d'identifiant dérivé de la session (expiresAt), qui
 *   changerait à chaque renouvellement et perdrait les données.
 * - Aucun nouveau service Cloudflare : réutilisation des bindings existants.
 */

import type {
  ThemeLibrary,
  Announcement,
  Event,
  EventNotificationSchedule,
  SiteSettings,
} from '../src/cms/types'
import { getCmsDocStore, type CmsDocStore } from './storage'

/**
 * Obtenir le store CMS depuis l'environnement (DO ou KV selon config déployée)
 */
export function cmsStore(env: any): CmsDocStore {
  return getCmsDocStore(env)
}

// ───────────────────────────── Thèmes ─────────────────────────────

export async function loadThemeLibrary(store: CmsDocStore): Promise<ThemeLibrary | null> {
  return store.getDoc<ThemeLibrary>('cms:themes:library')
}

export async function saveThemeLibrary(
  store: CmsDocStore,
  library: ThemeLibrary
): Promise<{ ok: boolean; error?: string }> {
  return store.putDoc('cms:themes:library', library)
}

// ─────────────────────────── Annonces ───────────────────────────

export async function loadAnnouncementsDraft(store: CmsDocStore): Promise<Announcement[]> {
  return (await store.getDoc<Announcement[]>('cms:announcements:draft')) ?? []
}

export async function saveAnnouncementsDraft(
  store: CmsDocStore,
  announcements: Announcement[]
): Promise<{ ok: boolean; error?: string }> {
  return store.putDoc('cms:announcements:draft', announcements)
}

// ─────────────────────────── Événements ───────────────────────────

export async function loadEventsDraft(store: CmsDocStore): Promise<Event[]> {
  return (await store.getDoc<Event[]>('cms:events:draft')) ?? []
}

export async function saveEventsDraft(
  store: CmsDocStore,
  events: Event[]
): Promise<{ ok: boolean; error?: string }> {
  return store.putDoc('cms:events:draft', events)
}

// ───────────────────────── Notifications ─────────────────────────

export async function loadNotificationSchedules(
  store: CmsDocStore
): Promise<EventNotificationSchedule[]> {
  return (await store.getDoc<EventNotificationSchedule[]>('cms:notifications:schedules')) ?? []
}

export async function saveNotificationSchedules(
  store: CmsDocStore,
  schedules: EventNotificationSchedule[]
): Promise<{ ok: boolean; error?: string }> {
  return store.putDoc('cms:notifications:schedules', schedules)
}

// ─────────────────────────── Paramètres ───────────────────────────

export async function loadSiteSettings(store: CmsDocStore): Promise<SiteSettings | null> {
  return store.getDoc<SiteSettings>('cms:settings:draft')
}

export async function saveSiteSettings(
  store: CmsDocStore,
  settings: SiteSettings
): Promise<{ ok: boolean; error?: string }> {
  return store.putDoc('cms:settings:draft', settings)
}
