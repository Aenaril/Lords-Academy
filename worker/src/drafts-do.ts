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
export class DraftsDoClass implements DurableObject {
  private state: DurableObjectState
  private env: any
  private tutorialId: string
  private initialized = false

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
    this.tutorialId = state.id.toString()
  }

  /**
   * Initialiser la base de données SQLite
   */
  private async getDb(): Promise<any> {
    if (!this.initialized) {
      const db = (this.state.storage as any).sql
      if (db && db.exec) {
        await db.exec(`
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
      }
      this.initialized = true
    }

    return (this.state.storage as any).sql
  }

  /**
   * SAVE — Sauvegarde atomique avec test-and-set de révision
   * 
   * Flux :
   * 1. Lire révision actuelle
   * 2. Vérifier que baseRevision === serverRevision (sinon conflit)
   * 3. Générer nouvelle révision (UUID)
   * 4. Atomiquement : écrire brouillon + révision
   * 5. Retourner succès ou conflit
   */
  async save(params: DraftSaveParams): Promise<DraftSaveResponse> {
    const db = await this.getDb()

    try {
      // 1. Commencer transaction
      await db.exec('BEGIN')

      try {
        // 1a. Lire révision actuelle
        const current: any = await db
          .prepare(`SELECT revision FROM drafts WHERE tutorialId = ? LIMIT 1`)
          .bind(this.tutorialId)
          .first()

        const serverRevision = current?.revision

        // 2. Vérifier match de baseRevision
        if (params.baseRevision !== serverRevision) {
          // Conflit !
          await db.exec('ROLLBACK')

          return {
            ok: false,
            conflict: true,
            serverRevision, // Retourner révision serveur pour retry
            message:
              'Draft has been modified elsewhere. Please reload and retry.',
          }
        }

        // 3. Générer nouvelle révision (UUID v4)
        const newRevision = crypto.randomUUID()
        const now = Date.now()

        // 4. Écrire atomiquement
        if (serverRevision) {
          // UPDATE
          await db
            .prepare(
              `UPDATE drafts 
             SET content = ?, revision = ?, updatedAt = ? 
             WHERE tutorialId = ?`
            )
            .bind(JSON.stringify(params.content), newRevision, now, this.tutorialId)
            .run()
        } else {
          // INSERT
          await db
            .prepare(
              `INSERT INTO drafts (tutorialId, content, revision, createdAt, updatedAt) 
             VALUES (?, ?, ?, ?, ?)`
            )
            .bind(
              this.tutorialId,
              JSON.stringify(params.content),
              newRevision,
              now,
              now
            )
            .run()
        }

        // 5. Commit
        await db.exec('COMMIT')

        return {
          ok: true,
          revision: newRevision,
          conflict: false,
        }
      } catch (err) {
        await db.exec('ROLLBACK')
        throw err
      }
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
    const db = await this.getDb()

    try {
      const row: any = await db
        .prepare(
          `SELECT content, revision, createdAt, updatedAt FROM drafts WHERE tutorialId = ? LIMIT 1`
        )
        .bind(this.tutorialId)
        .first()

      if (!row) return undefined

      return {
        content: JSON.parse(row.content),
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
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
  async delete(): Promise<{ ok: boolean; error?: string }> {
    const db = await this.getDb()

    try {
      await db
        .prepare(`DELETE FROM drafts WHERE tutorialId = ?`)
        .bind(this.tutorialId)
        .run()

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
  async migrate(params: DraftMigrateParams): Promise<{
    ok: boolean
    error?: string
  }> {
    const db = await this.getDb()

    try {
      // Valider checksum
      const storedChecksum = await this.computeChecksum(params.content)
      if (storedChecksum !== params.checksum) {
        return {
          ok: false,
          error: `Checksum mismatch: expected ${params.checksum}, got ${storedChecksum}`,
        }
      }

      // Vérifier que aucun brouillon existe
      const existing: any = await db
        .prepare(`SELECT revision FROM drafts WHERE tutorialId = ? LIMIT 1`)
        .bind(this.tutorialId)
        .first()

      if (existing) {
        return {
          ok: false,
          error: `Draft already exists for ${this.tutorialId}`,
        }
      }

      // Insérer le brouillon migré
      await db
        .prepare(
          `INSERT INTO drafts (tutorialId, content, revision, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          this.tutorialId,
          JSON.stringify(params.content),
          params.revision,
          params.updatedAt,
          params.updatedAt
        )
        .run()

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
   * Calculer SHA256 checksum pour validation
   */
  private async computeChecksum(data: any): Promise<string> {
    const jsonString = JSON.stringify(data)
    const encoder = new TextEncoder()
    const buffer = encoder.encode(jsonString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Fetch handler pour test/debugging
   * N'est PAS utilisé en production (les Pages Functions appelleront directement les méthodes)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    switch (path) {
      case '/load':
        {
          const draft = await this.load()
          return new Response(JSON.stringify(draft ?? null), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

      case '/save':
        {
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 })
          }
          const params = (await request.json()) as DraftSaveParams
          const result = await this.save(params)
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.conflict ? 409 : 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

      case '/delete':
        {
          if (request.method !== 'DELETE') {
            return new Response('Method not allowed', { status: 405 })
          }
          const result = await this.delete()
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

      case '/migrate':
        {
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 })
          }
          const params = (await request.json()) as DraftMigrateParams
          const result = await this.migrate(params)
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

      default:
        return new Response('Not found', { status: 404 })
    }
  }
}
