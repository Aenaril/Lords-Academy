/**
 * Test simple Phase 1 — Vérification fonctionnelle de base
 * 
 * Scénario :
 * 1. Créer un brouillon (tutorialId = "test-tuto-1")
 * 2. Charger le brouillon (vérifier contenu + révision)
 * 3. Tenter une mise à jour avec ancienne révision (doit recevoir 409)
 * 4. Mettre à jour avec bonne révision
 * 5. Supprimer le brouillon
 * 6. Vérifier que le brouillon est supprimé (undefined)
 */

import { describe, it, expect } from 'vitest'
import { DraftsDoClass, DraftSaveParams, DraftData } from '../drafts-do'

/**
 * Mock simple de DurableObjectState pour testing local
 */
class MockDurableObjectState {
  private data: Map<string, any> = new Map()
  private tables: Map<string, any[]> = new Map()

  id = {
    toString: () => 'test-tuto-1',
    name: 'test-tuto-1',
  }

  storage = {
    sql: {
      exec: (query: string, ...bindings: any[]) => {
        // Parser très simple pour les queries SQL
        if (query.includes('CREATE TABLE')) {
          this.tables.set('drafts', [])
          return { next: () => ({ done: true }), toArray: () => [] }
        }

        if (query.includes('INSERT INTO drafts')) {
          const [tutorialId, content, revision, createdAt, updatedAt] = bindings
          this.tables.set('drafts', [
            ...(this.tables.get('drafts') || []),
            { tutorialId, content, revision, createdAt, updatedAt },
          ])
          return { next: () => ({ done: true }), toArray: () => [] }
        }

        if (query.includes('SELECT revision FROM drafts WHERE tutorialId')) {
          const [tutorialId] = bindings
          const row = this.tables.get('drafts')?.find((r: any) => r.tutorialId === tutorialId)
          if (!row) return { next: () => ({ done: true }), toArray: () => [] }
          return {
            next: () => ({ done: false, value: { revision: row.revision } }),
            toArray: () => [row],
          }
        }

        if (query.includes('SELECT content, revision, createdAt, updatedAt FROM drafts')) {
          const [tutorialId] = bindings
          const row = this.tables.get('drafts')?.find((r: any) => r.tutorialId === tutorialId)
          if (!row) return { next: () => ({ done: true }), toArray: () => [] }
          return {
            next: () => ({
              done: false,
              value: {
                content: row.content,
                revision: row.revision,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              },
            }),
            toArray: () => [row],
          }
        }

        if (query.includes('UPDATE drafts SET content')) {
          const [content, revision, updatedAt, tutorialId] = bindings
          const rows = this.tables.get('drafts') || []
          const idx = rows.findIndex((r: any) => r.tutorialId === tutorialId)
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], content, revision, updatedAt }
          }
          return { next: () => ({ done: true }), toArray: () => [] }
        }

        if (query.includes('DELETE FROM drafts')) {
          const [tutorialId] = bindings
          const rows = this.tables.get('drafts') || []
          const filtered = rows.filter((r: any) => r.tutorialId !== tutorialId)
          this.tables.set('drafts', filtered)
          return { next: () => ({ done: true }), toArray: () => [] }
        }

        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return { next: () => ({ done: true }), toArray: () => [] }
        }

        return { next: () => ({ done: true }), toArray: () => [] }
      },
    },
    kv: {},
  }

  blockConcurrencyWhile(p: Promise<any>) {
    return p
  }
}

describe('DraftsDoClass — Phase 1 Simple Test', () => {
  it('1. Créer un brouillon', async () => {
    const state = new MockDurableObjectState() as any
    const draftsDoClass = new DraftsDoClass(state, {})

    const content = { title: 'Test Tutorial', modules: [] }
    const result = await draftsDoClass.save({ content })

    expect(result.ok).toBe(true)
    expect(result.revision).toBeDefined()
    expect(result.conflict).toBe(false)

    // Garder la révision pour les tests suivants
    const initialRevision = result.revision!
    expect(initialRevision).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)

    console.log(`✓ Brouillon créé avec révision: ${initialRevision}`)
  })

  it('2. Charger le brouillon', async () => {
    const state = new MockDurableObjectState() as any
    const draftsDoClass = new DraftsDoClass(state, {})

    // Créer d'abord
    const content = { title: 'Test Tutorial', modules: [] }
    const saveResult = await draftsDoClass.save({ content })
    const revision = saveResult.revision!

    // Charger
    const draft = await draftsDoClass.load()
    expect(draft).toBeDefined()
    expect(draft?.revision).toBe(revision)
    expect(draft?.content).toEqual(content)
    expect(draft?.createdAt).toBeDefined()
    expect(draft?.updatedAt).toBeDefined()

    console.log(`✓ Brouillon chargé : révision=${draft?.revision}`)
  })

  it('3. Refuser une mise à jour avec ancienne révision (409)', async () => {
    const state = new MockDurableObjectState() as any
    const draftsDoClass = new DraftsDoClass(state, {})

    // Créer
    const content1 = { title: 'Tutorial v1', modules: [] }
    const save1 = await draftsDoClass.save({ content: content1 })
    const revision1 = save1.revision!

    // Mettre à jour avec bonne révision
    const content2 = { title: 'Tutorial v2', modules: [{ name: 'Module 1' }] }
    const save2 = await draftsDoClass.save({ content: content2, baseRevision: revision1 })
    expect(save2.ok).toBe(true)
    const revision2 = save2.revision!

    // Essayer de mettre à jour avec ancienne révision (doit refuser)
    const content3 = { title: 'Tutorial v3 (conflict)', modules: [] }
    const save3 = await draftsDoClass.save({ content: content3, baseRevision: revision1 })

    expect(save3.ok).toBe(false)
    expect(save3.conflict).toBe(true)
    expect(save3.serverRevision).toBe(revision2)

    console.log(`✓ Conflit détecté : baseRevision=${revision1}, serverRevision=${revision2}`)
  })

  it('4. Mettre à jour avec bonne révision', async () => {
    const state = new MockDurableObjectState() as any
    const draftsDoClass = new DraftsDoClass(state, {})

    // Créer
    const content1 = { title: 'Tutorial v1', modules: [] }
    const save1 = await draftsDoClass.save({ content: content1 })
    const revision1 = save1.revision!

    // Mettre à jour
    const content2 = { title: 'Tutorial v2 (updated)', modules: [{ name: 'Advanced Tactics' }] }
    const save2 = await draftsDoClass.save({ content: content2, baseRevision: revision1 })

    expect(save2.ok).toBe(true)
    expect(save2.conflict).toBe(false)
    expect(save2.revision).not.toBe(revision1)

    // Vérifier le contenu
    const draft = await draftsDoClass.load()
    expect(draft?.content).toEqual(content2)
    expect(draft?.revision).toBe(save2.revision)

    console.log(`✓ Mise à jour réussie : ${revision1} → ${save2.revision}`)
  })

  it('5. Supprimer le brouillon', async () => {
    const state = new MockDurableObjectState() as any
    const draftsDoClass = new DraftsDoClass(state, {})

    // Créer
    const content = { title: 'Tutorial to delete', modules: [] }
    const saveResult = await draftsDoClass.save({ content })
    expect(saveResult.ok).toBe(true)

    // Charger pour confirmer
    let draft = await draftsDoClass.load()
    expect(draft).toBeDefined()

    // Supprimer
    const deleteResult = draftsDoClass.delete()
    expect(deleteResult.ok).toBe(true)

    // Vérifier suppression
    draft = await draftsDoClass.load()
    expect(draft).toBeUndefined()

    console.log(`✓ Brouillon supprimé`)
  })

  it('6. Après suppression, nouvelle révision sans conflit', async () => {
    const state = new MockDurableObjectState() as any
    const draftsDoClass = new DraftsDoClass(state, {})

    // Créer
    const content1 = { title: 'Tutorial v1', modules: [] }
    const save1 = await draftsDoClass.save({ content: content1 })
    const revision1 = save1.revision!

    // Supprimer
    const deleteResult = draftsDoClass.delete()
    expect(deleteResult.ok).toBe(true)

    // Créer une nouvelle version avec ancienne révision (pas de conflit, car suppression réinitialise)
    const content2 = { title: 'Tutorial v2 (after delete)', modules: [] }
    const save2 = await draftsDoClass.save({ content: content2, baseRevision: revision1 })

    // Le serveur n'a pas de révision, donc baseRevision (revision1) ne match pas undefined → conflit
    expect(save2.conflict).toBe(true)
    expect(save2.serverRevision).toBeUndefined()

    // Créer avec undefined (nouveau brouillon)
    const save3 = await draftsDoClass.save({ content: content2, baseRevision: undefined })
    expect(save3.ok).toBe(true)
    expect(save3.conflict).toBe(false)

    console.log(`✓ Après suppression, nouvelle création OK avec baseRevision=undefined`)
  })
})
