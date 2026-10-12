/**
 * Couche d'abstraction pour le stockage des brouillons
 * 
 * Supporte deux backends :
 * 1. Durable Objects (défaut) - pour atomicité et performance
 * 2. KV (fallback) - pour compatibilité, activable via STORAGE_BACKEND=kv
 * 
 * Sélection via variable d'environnement : STORAGE_BACKEND = "do" | "kv"
 * Si absent : Durable Objects (défaut)
 */

export interface DraftData {
  content: any
  revision: string
  updatedAt: number
  lastEditedLabel?: string
}

export interface DraftResponse {
  ok: boolean
  conflict?: boolean
  serverRevision?: string
  error?: string
  message?: string
}

/**
 * Interface d'abstraction pour le stockage
 */
export interface StorageBackend {
  // Charger un brouillon
  get(tutorialId: string): Promise<DraftData | null>

  // Sauvegarder un brouillon avec détection de conflit
  save(
    tutorialId: string,
    content: any,
    baseRevision?: string
  ): Promise<DraftResponse & { revision?: string }>

  // Supprimer un brouillon
  delete(tutorialId: string): Promise<{ ok: boolean; error?: string }>
}

/**
 * Implémentation KV (stockage actuel)
 */
export class KVStorage implements StorageBackend {
  constructor(private kv: any) {}

  async get(tutorialId: string): Promise<DraftData | null> {
    const raw = await this.kv.get(`draft:${tutorialId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async save(
    tutorialId: string,
    content: any,
    baseRevision?: string
  ): Promise<DraftResponse & { revision?: string }> {
    // Vérifier les conflits
    if (baseRevision) {
      const existing = await this.kv.get(`draft:${tutorialId}`)
      if (existing) {
        const existingData = JSON.parse(existing)
        const serverRevision = existingData.revision
        if (baseRevision !== serverRevision) {
          return {
            ok: false,
            conflict: true,
            serverRevision,
            message:
              'Le brouillon a été modifié par un autre administrateur. Rechargez avant de réessayer.',
          }
        }
      }
    }

    // Générer une nouvelle révision et sauvegarder
    const revision = crypto.randomUUID()
    await this.kv.put(
      `draft:${tutorialId}`,
      JSON.stringify({
        content,
        revision,
        updatedAt: Date.now(),
        lastEditedLabel: 'R4',
      })
    )

    return { ok: true, revision }
  }

  async delete(tutorialId: string): Promise<{ ok: boolean; error?: string }> {
    await this.kv.delete(`draft:${tutorialId}`)
    return { ok: true }
  }
}

/**
 * Implémentation Durable Objects (futur, pas activé par défaut)
 */
export class DOStorage implements StorageBackend {
  constructor(private doNamespace: any) {}

  async get(tutorialId: string): Promise<DraftData | null> {
    const doId = this.doNamespace.idFromName(tutorialId)
    const stub = this.doNamespace.get(doId)
    return await stub.load()
  }

  async save(
    tutorialId: string,
    content: any,
    baseRevision?: string
  ): Promise<DraftResponse & { revision?: string }> {
    const doId = this.doNamespace.idFromName(tutorialId)
    const stub = this.doNamespace.get(doId)
    return await stub.save({ content, baseRevision })
  }

  async delete(tutorialId: string): Promise<{ ok: boolean; error?: string }> {
    const doId = this.doNamespace.idFromName(tutorialId)
    const stub = this.doNamespace.get(doId)
    return stub.delete()
  }
}

/**
 * Factory pour obtenir le backend de stockage actif
 * 
 * Stratégie :
 * - STORAGE_BACKEND=kv explicite → KV (fallback)
 * - Tous les autres cas → Durable Objects (défaut)
 * 
 * Durable Objects est obligatoire sauf si KV est explicitement demandé.
 * Erreur EXPLICITE si DO demandé mais binding absent.
 */
export function getStorageBackend(env: any, tutorialId?: string): StorageBackend {
  // Vérifier la variable d'environnement
  const backend = (env.STORAGE_BACKEND ?? 'do').toLowerCase()

  // Cas 1 : KV explicitement demandé via STORAGE_BACKEND=kv
  if (backend === 'kv') {
    if (!env.DRAFTS) {
      throw new Error(
        'STORAGE_BACKEND=kv configured but DRAFTS KV binding not found. ' +
        'Configure the binding in Cloudflare Dashboard → Pages Settings → Functions → Bindings'
      )
    }
    const idLabel = tutorialId ? ` [${tutorialId}]` : ''
    console.log(`📦${idLabel} Utilisation : KV (fallback explicite)`)
    return new KVStorage(env.DRAFTS)
  }

  // Cas 2 : Durable Objects (défaut)
  if (backend === 'do') {
    if (!env.DRAFTS_DO) {
      throw new Error(
        'STORAGE_BACKEND=do (default) configured but DRAFTS_DO binding not found. ' +
        'Configure the binding in Cloudflare Dashboard → Pages Settings → Functions → Bindings. ' +
        'To use KV fallback, set STORAGE_BACKEND=kv.'
      )
    }
    const idLabel = tutorialId ? ` [${tutorialId}]` : ''
    console.log(`📦${idLabel} Utilisation : Durable Objects (défaut)`)
    return new DOStorage(env.DRAFTS_DO)
  }

  // Cas 3 : Valeur inconnue
  throw new Error(
    `Unknown STORAGE_BACKEND value: "${backend}". ` +
    'Expected: "do" (default) or "kv" (fallback).'
  )
}

// ═══════════════════════════════════════════════════════════════
// STOCKAGE CMS — Documents de configuration partagés (mono-site)
// ═══════════════════════════════════════════════════════════════

/**
 * Clés CMS stables (identité partagée pour un site unique)
 *
 * Le CMS administre UN seul site. Tous les administrateurs R4 autorisés
 * partagent le même espace de données. On n'utilise donc PAS d'identifiant
 * dérivé de la session (qui change à chaque renouvellement).
 *
 * Préfixe `cms:` pour isoler des brouillons de tutoriels (`draft:`).
 */
export type CmsDocKey =
  | 'cms:themes:library'
  | 'cms:announcements:draft'
  | 'cms:events:draft'
  | 'cms:notifications:schedules'
  | 'cms:settings:draft'

/**
 * Interface de stockage de documents CMS (clé-valeur simple)
 *
 * Contrairement aux brouillons de tutoriels, les documents CMS n'utilisent
 * pas de détection de conflit par révision : écriture directe (last-write-wins)
 * adaptée à un panneau d'administration mono-site.
 */
export interface CmsDocStore {
  getDoc<T = any>(key: CmsDocKey): Promise<T | null>
  putDoc<T = any>(key: CmsDocKey, value: T): Promise<{ ok: boolean; error?: string }>
}

/**
 * Implémentation KV du stockage de documents CMS
 */
export class KVCmsDocStore implements CmsDocStore {
  constructor(private kv: any) {}

  async getDoc<T = any>(key: CmsDocKey): Promise<T | null> {
    const raw = await this.kv.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async putDoc<T = any>(key: CmsDocKey, value: T): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.kv.put(key, JSON.stringify(value))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }
}

/**
 * Implémentation Durable Objects du stockage de documents CMS
 *
 * Chaque document CMS vit dans sa propre instance DO, nommée par sa clé
 * stable (idFromName). On réutilise les méthodes load/save/delete du stub
 * DO déjà déployé pour les brouillons de tutoriels : save({ content })
 * sans baseRevision = écriture directe (last-write-wins).
 */
export class DOCmsDocStore implements CmsDocStore {
  constructor(private doNamespace: any) {}

  async getDoc<T = any>(key: CmsDocKey): Promise<T | null> {
    const doId = this.doNamespace.idFromName(key)
    const stub = this.doNamespace.get(doId)
    const data = await stub.load()
    // Le stub renvoie { content, revision, ... } ou null
    if (!data) return null
    return (data.content ?? null) as T | null
  }

  async putDoc<T = any>(key: CmsDocKey, value: T): Promise<{ ok: boolean; error?: string }> {
    const doId = this.doNamespace.idFromName(key)
    const stub = this.doNamespace.get(doId)
    // Lire la révision courante pour satisfaire le test-and-set du stub,
    // puis écrire : écriture directe sans gestion de conflit côté CMS.
    const current = await stub.load().catch(() => null)
    const baseRevision = current?.revision
    const result = await stub.save({ content: value, baseRevision })
    if (result?.ok) return { ok: true }
    // En cas de conflit improbable (deux admins simultanés), réessayer une fois
    // avec la révision serveur renvoyée.
    if (result?.conflict && result?.serverRevision !== undefined) {
      const retry = await stub.save({ content: value, baseRevision: result.serverRevision })
      if (retry?.ok) return { ok: true }
      return { ok: false, error: 'conflict' }
    }
    return { ok: false, error: result?.error ?? 'save failed' }
  }
}

/**
 * Factory pour obtenir le stockage de documents CMS actif
 *
 * Respecte la même stratégie que getStorageBackend() :
 * - STORAGE_BACKEND=kv → KV (nécessite binding DRAFTS)
 * - sinon (défaut) → Durable Objects (nécessite binding DRAFTS_DO)
 *
 * Réutilise les bindings déjà déployés : aucun nouveau service Cloudflare.
 */
export function getCmsDocStore(env: any): CmsDocStore {
  const backend = (env.STORAGE_BACKEND ?? 'do').toLowerCase()

  if (backend === 'kv') {
    if (!env.DRAFTS) {
      throw new Error(
        'STORAGE_BACKEND=kv configured but DRAFTS KV binding not found. ' +
        'Configure the binding in Cloudflare Dashboard → Pages Settings → Functions → Bindings'
      )
    }
    return new KVCmsDocStore(env.DRAFTS)
  }

  if (backend === 'do') {
    if (!env.DRAFTS_DO) {
      throw new Error(
        'STORAGE_BACKEND=do (default) configured but DRAFTS_DO binding not found. ' +
        'Configure the binding in Cloudflare Dashboard → Pages Settings → Functions → Bindings. ' +
        'To use KV fallback, set STORAGE_BACKEND=kv.'
      )
    }
    return new DOCmsDocStore(env.DRAFTS_DO)
  }

  throw new Error(
    `Unknown STORAGE_BACKEND value: "${backend}". Expected: "do" (default) or "kv" (fallback).`
  )
}
