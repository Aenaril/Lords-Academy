/**
 * Client frontend pour la persistance CMS serveur
 *
 * Appelle /api/cms-storage/[resource]/[action] avec session R4 + CSRF.
 * Les brouillons CMS sont stockés côté serveur (DO/KV) et partagés entre
 * administrateurs d'un même site, retrouvés après reconnexion / autre appareil.
 *
 * localStorage sert de cache local optionnel (réponse instantanée hors ligne),
 * jamais de source unique.
 */

import type {
  ThemeLibrary,
  Announcement,
  Event,
  EventNotificationSchedule,
  SiteSettings,
} from './types'

const BASE = '/api/cms-storage'

async function post<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'lma-admin',
    },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new CmsStorageError(res.status, text || res.statusText)
  }

  return (await res.json()) as T
}

export class CmsStorageError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'CmsStorageError'
  }
}

// ───────────── Thèmes ─────────────

export async function loadThemeLibrary(): Promise<ThemeLibrary | null> {
  const data = await post<{ ok: boolean; library: ThemeLibrary | null }>('/themes/load')
  return data.library
}

export async function saveThemeLibrary(library: ThemeLibrary): Promise<void> {
  await post('/themes/save', { library })
}

// ───────────── Annonces ─────────────

export async function loadAnnouncements(): Promise<Announcement[]> {
  const data = await post<{ ok: boolean; announcements: Announcement[] }>('/announcements/load')
  return data.announcements ?? []
}

export async function saveAnnouncements(announcements: Announcement[]): Promise<void> {
  await post('/announcements/save', { announcements })
}

// ───────────── Événements ─────────────

export async function loadEvents(): Promise<Event[]> {
  const data = await post<{ ok: boolean; events: Event[] }>('/events/load')
  return data.events ?? []
}

export async function saveEvents(events: Event[]): Promise<void> {
  await post('/events/save', { events })
}

// ───────────── Notifications ─────────────

export async function loadNotificationSchedules(): Promise<EventNotificationSchedule[]> {
  const data = await post<{ ok: boolean; schedules: EventNotificationSchedule[] }>(
    '/notifications/load'
  )
  return data.schedules ?? []
}

export async function saveNotificationSchedules(
  schedules: EventNotificationSchedule[]
): Promise<void> {
  await post('/notifications/save', { schedules })
}

// ───────────── Paramètres ─────────────

export async function loadSiteSettings(): Promise<SiteSettings | null> {
  const data = await post<{ ok: boolean; settings: SiteSettings | null }>('/settings/load')
  return data.settings
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await post('/settings/save', { settings })
}
