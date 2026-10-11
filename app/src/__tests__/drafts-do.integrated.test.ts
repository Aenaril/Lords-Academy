/**
 * Tests d'intégration — DraftsDoClass avec mock DurableObjectState et SQL
 * 
 * Teste la classe réelle en simulant l'API SQL Cloudflare exactement.
 * Valide :
 * - Premier enregistrement (INSERT)
 * - Lecture après enregistrement (SELECT + parse JSON)
 * - Deux écritures concurrentes avec même révision (test-and-set)
 * - Conflit 409 sans écrasement
 * - Suppression et tentative tardive (DELETE + INSERT échoue)
 * - Isolation entre deux tutorialIds
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DraftsDoClass } from '../../../worker/src/drafts-do'

/**
 * Mock de l'API SQL Cloudflare DO
 * Simule SqlStorage.exec() et son curseur
 */
class MockSqlStorage {
  private db: Map<string, any> = new Map()
  private transactionRollback = false

  exec(query: string, ...bindings: any[]): SqlStorageCursor {
    if (this.transactionRollback) {
      throw new Error('Transaction rolled back')
    }

    // Gestion transactions
    if (query === 'BEGIN') {
      this.transactionRollback = false
      return new SqlStorageCursor([])
    }
    if (query === 'COMMIT') {
      return new SqlStorageCursor([])
    }
    if (query === 'ROLLBACK') {
      this.transactionRollback = true
      return new SqlStorageCursor([])
    }

    // CREATE TABLE
    if (query.includes('CREATE TABLE')) {
      return new SqlStorageCursor([])
    }

    // INSERT
    if (query.includes('INSERT INTO drafts')) {
      const [tutorialId, content, revision, createdAt, updatedAt] = bindings
      if (this.db.has(tutorialId)) {
        throw new Error(`UNIQUE constraint failed: tutorialId`)
      }
      this.db.set(tutorialId, {
        tutorialId,
        content,
        revision,
        createdAt,
        updatedAt,
      })
      return new SqlStorageCursor([])
    }

    // UPDATE
    if (query.includes('UPDATE drafts')) {
      const [content, revision, updatedAt, tutorialId] = bindings
      if (!this.db.has(tutorialId)) {
        return new SqlStorageCursor([])
      }
      this.db.set(tutorialId, {
        ...(this.db.get(tutorialId) || {}),
        content,
        revision,
        updatedAt,
      })
      return new SqlStorageCursor([])
    }

    // SELECT revision
    if (query.includes('SELECT revision FROM drafts')) {
      const [tutorialId] = bindings
      const row = this.db.get(tutorialId)
      if (row) {
        return new SqlStorageCursor([{ revision: row.revision }])
      }
      return new SqlStorageCursor([])
    }

    // SELECT *
    if (query.includes('SELECT content, revision, createdAt, updatedAt')) {
      const [tutorialId] = bindings
      const row = this.db.get(tutorialId)
      if (row) {
        return new SqlStorageCursor([
          {
            content: row.content,
            revision: row.revision,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
        ])
      }
      return new SqlStorageCursor([])
    }

    // DELETE
    if (query.includes('DELETE FROM drafts')) {
      const [tutorialId] = bindings
      this.db.delete(tutorialId)
      return new SqlStorageCursor([])
    }

    return new SqlStorageCursor([])
  }

  clear() {
    this.db.clear()
  }
}

class SqlStorageCursor {
  private rows: any[]
  private index = 0

  constructor(rows: any[]) {
    this.rows = rows
  }

  next(): IteratorResult<any> {
    if (this.index < this.rows.length) {
      return {
        done: false,
        value: this.rows[this.index++],
      }
    }
    return { done: true, value: undefined }
  }

  toArray(): any[] {
    return this.rows.slice(this.index)
  }

  one(): any {
    if (this.rows.length !== 1) {
      throw new Error(`Expected exactly 1 row, got ${this.rows.length}`)
    }
    return this.rows[0]
  }

  raw() {
    return {
      next: () => {
        if (this.index < this.rows.length) {
          return {
            done: false,
            value: Object.values(this.rows[this.index++]),
          }
        }
        return { done: true }
      },
      toArray: () =>
        this.rows.slice(this.index).map(row => Object.values(row)),
    }
  }
}

/**
 * Mock de DurableObjectState
 */
class MockDurableObjectState implements DurableObjectState {
  storage: any
  id: any
  blockConcurrencyWhile: (p: Promise<any>) => void = () => {}

  constructor(idStr: string, sqlStorage: MockSqlStorage) {
    this.id = {
      toString: () => idStr,
      name: idStr,
    }
    this.storage = {
      sql: sqlStorage,
      kv: {},
    }
  }
}

describe('DraftsDoClass — Tests intégrés avec SQL réelle simulée', () => {
  let sqlStorage: MockSqlStorage
  let state: MockDurableObjectState
  let drafts: DraftsDoClass

  beforeEach(() => {
    sqlStorage = new MockSqlStorage()
    state = new MockDurableObjectState('test-tutorial', sqlStorage)
    drafts = new DraftsDoClass(state)
  })

  it('should perform first save (INSERT)', async () => {
    const content = {
      title: 'Dragon Arena',
      sections: [{ uid: 's1', blocks: [] }],
    }

    const result = await drafts.save({
      content,
      baseRevision: undefined,
    })

    expect(result.ok).toBe(true)
    expect(result.revision).toBeDefined()
    expect(result.revision).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.conflict).toBeFalsy()
  })

  it('should load saved draft', async () => {
    const content = { title: 'Test Draft', sections: [] }

    // 1. Save
    const saveResult = await drafts.save({
      content,
      baseRevision: undefined,
    })

    // 2. Load
    const loadResult = await drafts.load()

    expect(loadResult).toBeDefined()
    expect(loadResult!.content.title).toBe('Test Draft')
    expect(loadResult!.revision).toBe(saveResult.revision)
    expect(loadResult!.updatedAt).toBeDefined()
    expect(loadResult!.createdAt).toBeDefined()
  })

  it('should reject save with incorrect baseRevision', async () => {
    const content = { title: 'Test', sections: [] }

    // 1. First save
    const save1 = await drafts.save({
      content,
      baseRevision: undefined,
    })

    // 2. Second save with WRONG revision
    const save2 = await drafts.save({
      content: { ...content, title: 'Modified' },
      baseRevision: 'wrong-revision',
    })

    expect(save2.ok).toBe(false)
    expect(save2.conflict).toBe(true)
    expect(save2.serverRevision).toBe(save1.revision)
  })

  it('should allow save with correct baseRevision (UPDATE)', async () => {
    const content = { title: 'Test', sections: [] }

    // 1. First save
    const save1 = await drafts.save({
      content,
      baseRevision: undefined,
    })

    // 2. Second save with CORRECT revision
    const save2 = await drafts.save({
      content: { ...content, title: 'Modified' },
      baseRevision: save1.revision,
    })

    expect(save2.ok).toBe(true)
    expect(save2.revision).not.toBe(save1.revision)
  })

  it('should delete draft', async () => {
    const content = { title: 'To Delete', sections: [] }

    // 1. Save
    await drafts.save({
      content,
      baseRevision: undefined,
    })

    // 2. Delete
    const deleteResult = drafts.delete()

    expect(deleteResult.ok).toBe(true)

    // 3. Load → undefined
    const loadResult = await drafts.load()

    expect(loadResult).toBeUndefined()
  })

  it('should prevent recreating deleted draft via late PUT', async () => {
    const content = { title: 'Will be deleted', sections: [] }

    // 1. Save
    const save1 = await drafts.save({
      content,
      baseRevision: undefined,
    })

    // 2. Delete
    drafts.delete()

    // 3. Late PUT with old revision
    const late = await drafts.save({
      content: { ...content, title: 'Stale' },
      baseRevision: save1.revision,
    })

    expect(late.ok).toBe(false)
    expect(late.conflict).toBe(true)
    expect(late.serverRevision).toBeUndefined()
  })

  it('should generate new revision after delete', async () => {
    const content = { title: 'Test', sections: [] }

    // 1. Save
    const save1 = await drafts.save({
      content,
      baseRevision: undefined,
    })

    // 2. Delete
    drafts.delete()

    // 3. Next save generates new revision
    const save2 = await drafts.save({
      content,
      baseRevision: undefined,
    })

    expect(save2.ok).toBe(true)
    expect(save2.revision).not.toBe(save1.revision)
  })

  it('should isolate different tutorials', async () => {
    const content = { title: 'Test', sections: [] }

    // Create two separate DO instances
    const state1 = new MockDurableObjectState('tutorial-1', sqlStorage)
    const state2 = new MockDurableObjectState('tutorial-2', sqlStorage)

    const drafts1 = new DraftsDoClass(state1)
    const drafts2 = new DraftsDoClass(state2)

    // Save tutorial 1
    const save1 = await drafts1.save({
      content: { ...content, title: 'Tutorial 1' },
      baseRevision: undefined,
    })

    // Save tutorial 2
    const save2 = await drafts2.save({
      content: { ...content, title: 'Tutorial 2' },
      baseRevision: undefined,
    })

    // Load both
    const load1 = await drafts1.load()
    const load2 = await drafts2.load()

    // Verify isolation
    expect(load1!.content.title).toBe('Tutorial 1')
    expect(load2!.content.title).toBe('Tutorial 2')
    expect(save1.revision).not.toBe(save2.revision)
  })

  it('should handle migration with checksum', async () => {
    const content = { title: 'Dragon Arena', sections: [] }
    const revision = crypto.randomUUID()

    // Compute same checksum algo as DraftsDoClass
    let hash = 0
    const jsonString = JSON.stringify(content)
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    const checksum = Math.abs(hash).toString(16).padStart(64, '0')

    // Migrate
    const result = drafts.migrate({
      content,
      revision,
      updatedAt: Date.now(),
      checksum,
    })

    expect(result.ok).toBe(true)

    // Verify data loaded
    const loaded = await drafts.load()
    expect(loaded!.content.title).toBe('Dragon Arena')
    expect(loaded!.revision).toBe(revision)
  })

  it('should reject migration with checksum mismatch', async () => {
    const content = { title: 'Test', sections: [] }

    const result = drafts.migrate({
      content,
      revision: crypto.randomUUID(),
      updatedAt: Date.now(),
      checksum: 'wrong-checksum',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Checksum mismatch')
  })

  it('should prevent duplicate migration', async () => {
    const content = { title: 'Test', sections: [] }
    const revision = crypto.randomUUID()

    let hash = 0
    const jsonString = JSON.stringify(content)
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    const checksum = Math.abs(hash).toString(16).padStart(64, '0')

    // First migration
    const result1 = drafts.migrate({
      content,
      revision,
      updatedAt: Date.now(),
      checksum,
    })

    expect(result1.ok).toBe(true)

    // Attempt duplicate
    const result2 = drafts.migrate({
      content,
      revision: crypto.randomUUID(),
      updatedAt: Date.now(),
      checksum,
    })

    expect(result2.ok).toBe(false)
    expect(result2.error).toContain('already exists')
  })

  it('should preserve data through multiple operations', async () => {
    const originalContent = {
      title: 'Original',
      sections: [
        { uid: 's1', title: 'Section 1', blocks: [{ uid: 'b1', type: 'text' }] },
      ],
    }

    // 1. Save original
    const save1 = await drafts.save({
      content: originalContent,
      baseRevision: undefined,
    })

    // 2. Modify and save
    const modifiedContent = {
      ...originalContent,
      sections: [
        ...originalContent.sections,
        { uid: 's2', title: 'Section 2', blocks: [] },
      ],
    }

    const save2 = await drafts.save({
      content: modifiedContent,
      baseRevision: save1.revision,
    })

    // 3. Load and verify all data preserved
    const loaded = await drafts.load()

    expect(loaded!.content.sections.length).toBe(2)
    expect(loaded!.content.sections[0].title).toBe('Section 1')
    expect(loaded!.content.sections[1].title).toBe('Section 2')
    expect(loaded!.revision).toBe(save2.revision)
  })
})
