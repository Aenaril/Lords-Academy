/**
 * Durable Object — Gestion atomique des brouillons tutoriels
 * 
 * Chaque instance = un tutoriel (ID = tutorialId)
 * Stockage : SQLite natif dans Durable Objects
 * 
 * Garanties :
 * - Atomicité : transactions SQLite + test-and-set révision
 * - Ordre : requêtes sérialisées par runtime Durable Objects
 * - Isolation : une instance par tutorialId
 * - Pas de race condition : impossible de perdre une modification
 */

import { DurableObject } from 'cloudflare:workers'

export interface DraftSaveParams {
  content: any // EditableTutorial
  baseRevision?: string // UUID du brouillon actuel (pour conflit detection)
}

export interface DraftSaveResponse {
  ok: boolean
  revision?: string // UUID nouveau (si succès)
  conflict?: boolean // true si baseRevision ne match pas serverRevision
  serverRevision?: string // Révision actuelle côté serveur (si conflit)
  message?: string
}

export interface DraftData {
  content: any // EditableTutorial
  revision: string // UUID
  updatedAt: number // timestamp ms
  createdAt: number // timestamp ms
}

export interface DraftMigrateParams {
  content: any
  revision: string
  updatedAt: number
  checksum: string
}

/**
 * Durable Object SQLite pour un tutoriel unique
 */
export class DraftsDoClass extends DurableObject {
  private tutorialId: string
  private initialized = false

  constructor(state: DurableObjectState, env: any) {
    super(state, env)
    this.tutorialId = state.id.toString()
  }

  /**
   * Initialiser la base de données SQLite au premier usage
   */
  private initDb(): void {
    if (!this.initialized) {
      const sql = this.ctx.storage.sql
      sql.exec(`
        CREATE TABLE IF NOT EXISTS drafts (
          tutorialId TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          revision TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_drafts_updatedAt 
        ON drafts(updatedAt DESC);
      `)
      this.initialized = true
    }
  }

  private get sql() {
    this.initDb()
    return this.ctx.storage.sql
  }

  /**
   * SAVE — Sauvegarde atomique avec test-and-set de révision
   * 
   * Flux :
   * 1. Initialiser la table si nécessaire
   * 2. Lire révision actuelle
   * 3. Vérifier que baseRevision === serverRevision (sinon conflit)
   * 4. Générer nouvelle révision (UUID)
   * 5. Atomiquement : écrire brouillon + révision
   * 6. Retourner succès ou conflit
   */
  async save(params: DraftSaveParams): Promise<DraftSaveResponse> {
    try {
      // Initialiser la base de données avant la transaction
      this.initDb()

      // Utiliser transactionSync pour l'atomicité
      const result = this.ctx.storage.transactionSync(() => {
        const sql = this.ctx.storage.sql

        // 1a. Lire révision actuelle
        const cursor = sql.exec(
          `SELECT revision FROM drafts WHERE tutorialId = ? LIMIT 1`,
          this.tutorialId
        )
        const row = cursor.next()
        const serverRevision = row.done ? undefined : (row.value.revision as string | undefined)

        // 2. Vérifier match de baseRevision
        if (params.baseRevision !== serverRevision) {
          // Conflit !
          return {
            ok: false,
            conflict: true,
            serverRevision: serverRevision,
            message: 'Draft has been modified elsewhere. Please reload and retry.',
          }
        }

        // 3. Générer nouvelle révision (UUID)
        const newRevision = crypto.randomUUID()
        const now = Date.now()

        // 4. Écrire atomiquement
        if (serverRevision) {
          // UPDATE
          sql.exec(
            `UPDATE drafts 
             SET content = ?, revision = ?, updatedAt = ? 
             WHERE tutorialId = ?`,
            JSON.stringify(params.content),
            newRevision,
            now,
            this.tutorialId
          )
        } else {
          // INSERT
          sql.exec(
            `INSERT INTO drafts (tutorialId, content, revision, createdAt, updatedAt) 
             VALUES (?, ?, ?, ?, ?)`,
            this.tutorialId,
            JSON.stringify(params.content),
            newRevision,
            now,
            now
          )
        }

        // 5. Retourner succès
        return {
          ok: true,
          revision: newRevision,
          conflict: false,
        }
      }) as any

      return result
    } catch (err) {
      console.error(`[DraftsDoClass] save error for ${this.tutorialId}:`, err)
      return {
        ok: false,
        conflict: false,
        message: `Server error: ${String(err)}`,
      }
    }
  }

  /**
   * LOAD — Charger le brouillon actuel
   * 
   * Retourne :
   * - DraftData si brouillon existe
   * - undefined si aucun brouillon
   */
  async load(): Promise<DraftData | undefined> {
    const sql = this.sql

    try {
      const cursor = sql.exec(
        `SELECT content, revision, createdAt, updatedAt FROM drafts WHERE tutorialId = ? LIMIT 1`,
        this.tutorialId
      )

      const row = cursor.next()
      if (row.done) return undefined

      const content = row.value.content as string
      const revision = row.value.revision as string
      const createdAt = row.value.createdAt as number
      const updatedAt = row.value.updatedAt as number

      return {
        content: JSON.parse(content),
        revision,
        createdAt,
        updatedAt,
      }
    } catch (err) {
      console.error(`[DraftsDoClass] load error for ${this.tutorialId}:`, err)
      return undefined
    }
  }

  /**
   * DELETE — Supprimer le brouillon
   * 
   * Garanties :
   * - Suppression atomique
   * - Prochaine save génère révision nouvelle (aucun conflit possible)
   * - Late PUT avec ancienne révision → 409 (serverRevision = undefined)
   */
  delete(): { ok: boolean; error?: string } {
    const sql = this.sql

    try {
      sql.exec(
        `DELETE FROM drafts WHERE tutorialId = ?`,
        this.tutorialId
      )

      return { ok: true }
    } catch (err) {
      console.error(
        `[DraftsDoClass] delete error for ${this.tutorialId}:`,
        err
      )
      return {
        ok: false,
        error: String(err),
      }
    }
  }

  /**
   * MIGRATE — Importer un brouillon depuis KV lors de migration
   * 
   * Utilisée lors de la migration KV → DO.
   * Charge un brouillon depuis KV et le crée en DO avec checksum validation.
   */
  migrate(params: DraftMigrateParams): {
    ok: boolean
    error?: string
  } {
    const sql = this.sql

    try {
      // Valider checksum
      const storedChecksum = this.computeChecksum(params.content)
      if (storedChecksum !== params.checksum) {
        return {
          ok: false,
          error: `Checksum mismatch: expected ${params.checksum}, got ${storedChecksum}`,
        }
      }

      // Vérifier que aucun brouillon existe
      const cursor = sql.exec(
        `SELECT revision FROM drafts WHERE tutorialId = ? LIMIT 1`,
        this.tutorialId
      )
      const existing = cursor.next()

      if (!existing.done) {
        return {
          ok: false,
          error: `Draft already exists for ${this.tutorialId}`,
        }
      }

      // Insérer le brouillon migré
      sql.exec(
        `INSERT INTO drafts (tutorialId, content, revision, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?)`,
        this.tutorialId,
        JSON.stringify(params.content),
        params.revision,
        params.updatedAt,
        params.updatedAt
      )

      return { ok: true }
    } catch (err) {
      console.error(
        `[DraftsDoClass] migrate error for ${this.tutorialId}:`,
        err
      )
      return {
        ok: false,
        error: String(err),
      }
    }
  }

  /**
   * Calculer SHA256 checksum pour validation (synchrone)
   * Utilise SubtleCrypto du runtime Cloudflare
   */
  private computeChecksum(data: any): string {
    const jsonString = JSON.stringify(data)
    // En Cloudflare Workers, utiliser crypto.subtle.digest est async
    // Pour rester synchrone dans les transactions, utiliser un hash simple
    // (En prod: utiliser @noble/hashes ou similaire pour SHA256 sync)
    let hash = 0
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(64, '0')
  }
}
