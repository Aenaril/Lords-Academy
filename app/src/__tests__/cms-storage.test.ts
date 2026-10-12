/**
 * Tests du stockage CMS — exécutables, isolés, sans production
 *
 * Vérifie :
 * - KVCmsDocStore et DOCmsDocStore implémentent correctement get/put
 * - Les clés CMS sont stables (indépendantes de la session)
 * - La persistance round-trip (save → load) conserve les données
 * - Les helpers cms-storage.ts (thèmes, annonces, événements, notifs)
 *
 * Ces tests utilisent des bindings mockés en mémoire : aucune donnée réelle,
 * aucun secret Cloudflare, aucune publication en production.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  KVCmsDocStore,
  DOCmsDocStore,
  getCmsDocStore,
  type CmsDocStore,
} from '../../functions/storage'
import {
  loadThemeLibrary,
  saveThemeLibrary,
  loadAnnouncementsDraft,
  saveAnnouncementsDraft,
  loadEventsDraft,
  saveEventsDraft,
  loadNotificationSchedules,
  saveNotificationSchedules,
} from '../../functions/cms-storage'
import type { ThemeLibrary, Announcement, Event, EventNotificationSchedule } from '../cms/types'

// ───────────── Mocks de bindings Cloudflare ─────────────

/** Mock KV Namespace en mémoire */
class MockKV {
  private store = new Map<string, string>()
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  _size() {
    return this.store.size
  }
  _keys() {
    return [...this.store.keys()]
  }
}

/** Mock d'un stub Durable Object (load/save avec test-and-set révision) */
class MockDOStub {
  private data: { content: any; revision: string } | null = null
  async load() {
    return this.data
  }
  async save({ content, baseRevision }: { content: any; baseRevision?: string }) {
    const serverRevision = this.data?.revision
    if (baseRevision !== serverRevision) {
      return { ok: false, conflict: true, serverRevision }
    }
    const revision = crypto.randomUUID()
    this.data = { content, revision }
    return { ok: true, revision }
  }
  async delete() {
    this.data = null
    return { ok: true }
  }
}

/** Mock d'un namespace Durable Object (une instance par nom) */
class MockDONamespace {
  private stubs = new Map<string, MockDOStub>()
  idFromName(name: string) {
    return name // on utilise le nom comme id
  }
  get(id: string) {
    if (!this.stubs.has(id)) this.stubs.set(id, new MockDOStub())
    return this.stubs.get(id)!
  }
  _instanceCount() {
    return this.stubs.size
  }
}

// ───────────── Fixtures ─────────────

function sampleLibrary(): ThemeLibrary {
  return {
    themes: [
      {
        id: 'dark',
        name: 'Sombre',
        colors: {
          bgMain: '#0f0f12',
          bgCard: '#1a1a1e',
          bgSection: '#2a2a30',
          textPrimary: '#f2f2f2',
          textSecondary: '#b0b0b0',
          textMuted: '#808080',
          primary: '#ff6600',
          secondary: '#0066ff',
          accent: '#ffcc00',
          success: '#00cc00',
          error: '#cc0000',
          warning: '#ffcc00',
          borderColor: '#444444',
          buttonText: '#ffffff',
          linkColor: '#66ccff',
        },
        typography: {
          fontPrimary: 'System',
          fontHeadings: 'System',
          sizeBase: 16,
          sizeSmall: 14,
          sizeLarge: 18,
          sizeXL: 24,
        },
        spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
        borderRadius: 8,
        createdAt: 1000,
        modifiedAt: 1000,
        isPredefined: true,
      },
    ],
    activeThemeId: 'dark',
    publishedThemeId: 'dark',
  }
}

function sampleAnnouncement(id: string): Announcement {
  return {
    id,
    title: `Annonce ${id}`,
    description: 'desc',
    bgColor: '#1a1a1e',
    textColor: '#f2f2f2',
    buttonText: 'Voir',
    buttonLink: 'dragon-arena',
    linkType: 'tutorial',
    order: 0,
    enabled: true,
    createdAt: 1000,
    modifiedAt: 1000,
  }
}

// ───────────── Tests KV ─────────────

describe('KVCmsDocStore', () => {
  let kv: MockKV
  let store: CmsDocStore

  beforeEach(() => {
    kv = new MockKV()
    store = new KVCmsDocStore(kv)
  })

  it('returns null for missing document', async () => {
    const result = await store.getDoc('cms:themes:library')
    expect(result).toBeNull()
  })

  it('round-trips a document (save then load)', async () => {
    const lib = sampleLibrary()
    const put = await store.putDoc('cms:themes:library', lib)
    expect(put.ok).toBe(true)

    const loaded = await store.getDoc<ThemeLibrary>('cms:themes:library')
    expect(loaded).not.toBeNull()
    expect(loaded!.activeThemeId).toBe('dark')
    expect(loaded!.themes.length).toBe(1)
  })

  it('uses a stable key independent of session', async () => {
    await store.putDoc('cms:announcements:draft', [sampleAnnouncement('a1')])
    // La clé stockée doit être exactement la clé CMS stable
    expect(kv._keys()).toContain('cms:announcements:draft')
    // Aucune clé dérivée de session (admin-<timestamp>)
    expect(kv._keys().some((k) => k.startsWith('admin-'))).toBe(false)
  })
})

// ───────────── Tests DO ─────────────

describe('DOCmsDocStore', () => {
  let ns: MockDONamespace
  let store: CmsDocStore

  beforeEach(() => {
    ns = new MockDONamespace()
    store = new DOCmsDocStore(ns)
  })

  it('returns null for missing document', async () => {
    const result = await store.getDoc('cms:events:draft')
    expect(result).toBeNull()
  })

  it('round-trips a document through the DO stub', async () => {
    const events: Event[] = [
      {
        id: 'e1',
        name: 'Event',
        description: 'd',
        startAt: 2000,
        tutorialId: 'dragon-arena',
        status: 'active',
        createdAt: 1000,
        modifiedAt: 1000,
      },
    ]
    const put = await store.putDoc('cms:events:draft', events)
    expect(put.ok).toBe(true)

    const loaded = await store.getDoc<Event[]>('cms:events:draft')
    expect(loaded).not.toBeNull()
    expect(loaded!.length).toBe(1)
    expect(loaded!['0'].id).toBe('e1')
  })

  it('overwrites existing document (last-write-wins)', async () => {
    await store.putDoc('cms:announcements:draft', [sampleAnnouncement('a1')])
    await store.putDoc('cms:announcements:draft', [
      sampleAnnouncement('a1'),
      sampleAnnouncement('a2'),
    ])
    const loaded = await store.getDoc<Announcement[]>('cms:announcements:draft')
    expect(loaded!.length).toBe(2)
  })

  it('creates one DO instance per stable key', async () => {
    await store.putDoc('cms:themes:library', sampleLibrary())
    await store.putDoc('cms:announcements:draft', [sampleAnnouncement('a1')])
    // Deux documents distincts → deux instances DO
    expect(ns._instanceCount()).toBe(2)
  })
})

// ───────────── Factory ─────────────

describe('getCmsDocStore factory', () => {
  it('selects KV when STORAGE_BACKEND=kv and DRAFTS present', () => {
    const store = getCmsDocStore({ STORAGE_BACKEND: 'kv', DRAFTS: new MockKV() })
    expect(store).toBeInstanceOf(KVCmsDocStore)
  })

  it('selects DO by default when DRAFTS_DO present', () => {
    const store = getCmsDocStore({ DRAFTS_DO: new MockDONamespace() })
    expect(store).toBeInstanceOf(DOCmsDocStore)
  })

  it('throws explicitly when kv requested but binding missing', () => {
    expect(() => getCmsDocStore({ STORAGE_BACKEND: 'kv' })).toThrow(/DRAFTS KV binding/)
  })

  it('throws explicitly when do default but binding missing', () => {
    expect(() => getCmsDocStore({})).toThrow(/DRAFTS_DO binding/)
  })
})

// ───────────── Helpers cms-storage.ts ─────────────

describe('cms-storage helpers (round-trip)', () => {
  let store: CmsDocStore

  beforeEach(() => {
    store = new KVCmsDocStore(new MockKV())
  })

  it('themes: save and load library', async () => {
    await saveThemeLibrary(store, sampleLibrary())
    const lib = await loadThemeLibrary(store)
    expect(lib?.themes.length).toBe(1)
  })

  it('announcements: default empty array when absent', async () => {
    const anns = await loadAnnouncementsDraft(store)
    expect(anns).toEqual([])
  })

  it('announcements: save and load', async () => {
    await saveAnnouncementsDraft(store, [sampleAnnouncement('a1'), sampleAnnouncement('a2')])
    const anns = await loadAnnouncementsDraft(store)
    expect(anns.length).toBe(2)
    expect(anns[0].id).toBe('a1')
  })

  it('events: default empty array when absent', async () => {
    const events = await loadEventsDraft(store)
    expect(events).toEqual([])
  })

  it('events: save and load', async () => {
    const events: Event[] = [
      {
        id: 'e1',
        name: 'Event',
        description: 'd',
        startAt: 2000,
        tutorialId: 'dragon-arena',
        status: 'active',
        createdAt: 1000,
        modifiedAt: 1000,
      },
    ]
    await saveEventsDraft(store, events)
    const loaded = await loadEventsDraft(store)
    expect(loaded.length).toBe(1)
  })

  it('notifications: default empty array when absent', async () => {
    const scheds = await loadNotificationSchedules(store)
    expect(scheds).toEqual([])
  })

  it('notifications: save and load', async () => {
    const schedules: EventNotificationSchedule[] = [
      {
        id: 's1',
        eventId: 'e1',
        enabled: true,
        title: 'Rappel',
        message: 'msg',
        timing: 'relative',
        relativeDelay: '-24h',
        status: 'pending',
      },
    ]
    await saveNotificationSchedules(store, schedules)
    const loaded = await loadNotificationSchedules(store)
    expect(loaded.length).toBe(1)
    expect(loaded[0].relativeDelay).toBe('-24h')
  })
})
