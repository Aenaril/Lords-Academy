/**
 * Couche de persistance CMS côté serveur
 * 
 * Stocke les données CMS non publiées (brouillons, configurations, bibliotheques)
 * dans KV Namespace pour persistance entre sessions/appareils.
 * 
 * Structure KV:
 * - cms:theme:library:{admin-id} → ThemeLibrary complète (thèmes perso + prédéfinis)
 * - cms:announcements:draft:{admin-id} → Brouillons d'annonces
 * - cms:events:draft:{admin-id} → Brouillons d'événements
 * - cms:notifications:schedules:{admin-id} → Programmations notifications
 * - cms:settings:draft:{admin-id} → Configuration du site
 */

import type { ThemeLibrary, Announcement, Event, EventNotificationSchedule, SiteSettings } from '../src/cms/types'

export interface CmsStorageContext {
  kv: any
  adminId: string // ID unik de l'administrateur (issu de la session)
}

/**
 * Charger la bibliothèque de thèmes personnalisés
 */
export async function loadThemeLibrary(ctx: CmsStorageContext): Promise<ThemeLibrary | null> {
  const key = `cms:theme:library:${ctx.adminId}`
  const raw = await ctx.kv.get(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    console.warn(`❌ CMS: Failed to parse theme library for ${ctx.adminId}`)
    return null
  }
}

/**
 * Sauvegarder la bibliothèque de thèmes personnalisés
 */
export async function saveThemeLibrary(
  ctx: CmsStorageContext,
  library: ThemeLibrary
): Promise<{ ok: boolean; error?: string }> {
  const key = `cms:theme:library:${ctx.adminId}`

  try {
    await ctx.kv.put(key, JSON.stringify(library))
    console.info(`✅ CMS: Theme library saved for ${ctx.adminId}`)
    return { ok: true }
  } catch (err) {
    console.error(`❌ CMS: Failed to save theme library: ${err}`)
    return { ok: false, error: String(err) }
  }
}

/**
 * Charger les brouillons d'annonces
 */
export async function loadAnnouncementsDraft(ctx: CmsStorageContext): Promise<Announcement[]> {
  const key = `cms:announcements:draft:${ctx.adminId}`
  const raw = await ctx.kv.get(key)
  if (!raw) return []

  try {
    return JSON.parse(raw)
  } catch {
    console.warn(`❌ CMS: Failed to parse announcements draft for ${ctx.adminId}`)
    return []
  }
}

/**
 * Sauvegarder les brouillons d'annonces
 */
export async function saveAnnouncementsDraft(
  ctx: CmsStorageContext,
  announcements: Announcement[]
): Promise<{ ok: boolean; error?: string }> {
  const key = `cms:announcements:draft:${ctx.adminId}`

  try {
    await ctx.kv.put(key, JSON.stringify(announcements))
    console.info(`✅ CMS: Announcements draft saved for ${ctx.adminId}`)
    return { ok: true }
  } catch (err) {
    console.error(`❌ CMS: Failed to save announcements draft: ${err}`)
    return { ok: false, error: String(err) }
  }
}

/**
 * Charger les brouillons d'événements
 */
export async function loadEventsDraft(ctx: CmsStorageContext): Promise<Event[]> {
  const key = `cms:events:draft:${ctx.adminId}`
  const raw = await ctx.kv.get(key)
  if (!raw) return []

  try {
    return JSON.parse(raw)
  } catch {
    console.warn(`❌ CMS: Failed to parse events draft for ${ctx.adminId}`)
    return []
  }
}

/**
 * Sauvegarder les brouillons d'événements
 */
export async function saveEventsDraft(
  ctx: CmsStorageContext,
  events: Event[]
): Promise<{ ok: boolean; error?: string }> {
  const key = `cms:events:draft:${ctx.adminId}`

  try {
    await ctx.kv.put(key, JSON.stringify(events))
    console.info(`✅ CMS: Events draft saved for ${ctx.adminId}`)
    return { ok: true }
  } catch (err) {
    console.error(`❌ CMS: Failed to save events draft: ${err}`)
    return { ok: false, error: String(err) }
  }
}

/**
 * Charger les programmations de notifications
 */
export async function loadNotificationSchedules(
  ctx: CmsStorageContext
): Promise<EventNotificationSchedule[]> {
  const key = `cms:notifications:schedules:${ctx.adminId}`
  const raw = await ctx.kv.get(key)
  if (!raw) return []

  try {
    return JSON.parse(raw)
  } catch {
    console.warn(`❌ CMS: Failed to parse notification schedules for ${ctx.adminId}`)
    return []
  }
}

/**
 * Sauvegarder les programmations de notifications
 */
export async function saveNotificationSchedules(
  ctx: CmsStorageContext,
  schedules: EventNotificationSchedule[]
): Promise<{ ok: boolean; error?: string }> {
  const key = `cms:notifications:schedules:${ctx.adminId}`

  try {
    await ctx.kv.put(key, JSON.stringify(schedules))
    console.info(`✅ CMS: Notification schedules saved for ${ctx.adminId}`)
    return { ok: true }
  } catch (err) {
    console.error(`❌ CMS: Failed to save notification schedules: ${err}`)
    return { ok: false, error: String(err) }
  }
}

/**
 * Charger les paramètres du site
 */
export async function loadSiteSettings(ctx: CmsStorageContext): Promise<SiteSettings | null> {
  const key = `cms:settings:draft:${ctx.adminId}`
  const raw = await ctx.kv.get(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    console.warn(`❌ CMS: Failed to parse site settings for ${ctx.adminId}`)
    return null
  }
}

/**
 * Sauvegarder les paramètres du site
 */
export async function saveSiteSettings(
  ctx: CmsStorageContext,
  settings: SiteSettings
): Promise<{ ok: boolean; error?: string }> {
  const key = `cms:settings:draft:${ctx.adminId}`

  try {
    await ctx.kv.put(key, JSON.stringify(settings))
    console.info(`✅ CMS: Site settings saved for ${ctx.adminId}`)
    return { ok: true }
  } catch (err) {
    console.error(`❌ CMS: Failed to save site settings: ${err}`)
    return { ok: false, error: String(err) }
  }
}
