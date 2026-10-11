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
