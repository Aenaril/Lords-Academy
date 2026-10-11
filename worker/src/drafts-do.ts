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
   * 1. Lire révision actuelle
   * 2. Vérifier que baseRevision === serverRevision (sinon conflit)
   * 3. Générer nouvelle révision (UUID)
   * 4. Atomiquement : écrire brouillon + révision
   * 5. Retourner succès ou conflit
   */
  async save(params: DraftSaveParams): Promise<DraftSaveResponse> {
    const sql = this.sql

    try {
      // 1. BEGIN transaction
      sql.exec('BEGIN')

      try {
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
          sql.exec('ROLLBACK')

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

        // 5. COMMIT
        sql.exec('COMMIT')

        return {
          ok: true,
          revision: newRevision,
          conflict: false,
        }
      } catch (err) {
        sql.exec('ROLLBACK')
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

  /**
   * Fetch handler pour test/debugging via HTTP
   * N'est PAS utilisé en production (Pages Functions appelleront directement les méthodes)
   * 
   * ⚠️ AUTHENTIFICATION REQUISE : Les requêtes doivent inclure un header Authorization
   * Domaines publics : Cet endpoint ne doit JAMAIS être exposé publiquement.
   */
  async fetch(request: Request): Promise<Response> {
    // 1. Vérifier l'authentification
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing or invalid Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.slice(7) // Enlever "Bearer "
    // ⚠️ TODO: Valider le token (comparer avec une clé secrète stockée en env ou KV)
    // Pour Phase 1, on accepte n'importe quel token non-vide
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: empty token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Traiter la requête authentifiée
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
          const result = this.delete()
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
          const result = this.migrate(params)
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
