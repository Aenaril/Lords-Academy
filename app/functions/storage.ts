/**
 * Couche d'abstraction pour le stockage des brouillons
 * 
 * Supporte deux backends :
 * 1. KV (défaut, existant) - pour compatibilité
 * 2. Durable Objects (activable) - pour atomicité future
 * 
 * Sélection via variable d'environnement : STORAGE_BACKEND = "kv" | "do"
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
    const doId = this.doNamespace.idFromString(tutorialId)
    const stub = this.doNamespace.get(doId)
    return await stub.load()
  }

  async save(
    tutorialId: string,
    content: any,
    baseRevision?: string
  ): Promise<DraftResponse & { revision?: string }> {
    const doId = this.doNamespace.idFromString(tutorialId)
    const stub = this.doNamespace.get(doId)
    return await stub.save({ content, baseRevision })
  }

  async delete(tutorialId: string): Promise<{ ok: boolean; error?: string }> {
    const doId = this.doNamespace.idFromString(tutorialId)
    const stub = this.doNamespace.get(doId)
    return stub.delete()
  }
}

/**
 * Factory pour obtenir le backend de stockage actif
 */
export function getStorageBackend(env: any): StorageBackend {
  // Sélection par variable d'environnement
  // Par défaut : KV (sécurité et compatibilité)
  const backend = (env.STORAGE_BACKEND ?? 'kv').toLowerCase()

  if (backend === 'do' && env.DRAFTS_DO) {
    console.log('📦 Utilisation du stockage : Durable Objects')
    return new DOStorage(env.DRAFTS_DO)
  }

  console.log('📦 Utilisation du stockage : KV (par défaut)')
  return new KVStorage(env.DRAFTS)
}
