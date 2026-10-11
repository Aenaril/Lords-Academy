/**
 * Tests unitaires — Logique atomique Durable Objects
 * 
 * Tests la logique de conflit et atomicité sans dépendre de miniflare.
 * Valide : test-and-set révision, isolation, gestion des conflits
 */

import { describe, it, expect } from 'vitest'

describe('Draft Save Logic — Atomicité & Conflits', () => {
  /**
   * Mock de la logique DO : simuler save atomique avec test-and-set
   */
  class MockDraftStore {
    private drafts = new Map<string, { content: any; revision: string; updatedAt: number }>()

    save(tutorialId: string, content: any, baseRevision?: string) {
      // Lire révision actuelle
      const current = this.drafts.get(tutorialId)
      const serverRevision = current?.revision

      // Test-and-set : vérifier match
      if (baseRevision !== serverRevision) {
        return {
          ok: false,
          conflict: true,
          serverRevision,
          message: 'Draft modified elsewhere',
        }
      }

      // Générer nouvelle révision
      const newRevision = crypto.randomUUID()

      // Écrire atomiquement
      this.drafts.set(tutorialId, {
        content,
        revision: newRevision,
        updatedAt: Date.now(),
      })

      return {
        ok: true,
        revision: newRevision,
        conflict: false,
      }
    }

    load(tutorialId: string) {
      return this.drafts.get(tutorialId)
    }

    delete(tutorialId: string) {
      this.drafts.delete(tutorialId)
      return { ok: true }
    }

    clear() {
      this.drafts.clear()
    }
  }

  it('should save and return UUID revision', () => {
    const store = new MockDraftStore()
    const content = { title: 'Dragon Arena', sections: [] }

    const result = store.save('dragon-arena', content, undefined)

    expect(result.ok).toBe(true)
    expect(result.revision).toBeDefined()
    expect(result.revision).toMatch(/^[0-9a-f-]{36}$/) // UUID format
  })

  it('should reject save with incorrect baseRevision', () => {
    const store = new MockDraftStore()
    const content = { title: 'Test', sections: [] }

    // Première save
    const save1 = store.save('tuto-1', content, undefined)
    expect(save1.ok).toBe(true)

    // Deuxième save avec MAUVAISE révision
    const save2 = store.save('tuto-1', { ...content, title: 'Modified' }, 'wrong-old-revision')

    expect(save2.ok).toBe(false)
    expect(save2.conflict).toBe(true)
    expect(save2.serverRevision).toBe(save1.revision)
  })

  it('should allow save with correct baseRevision', () => {
    const store = new MockDraftStore()
    const content = { title: 'Test', sections: [] }

    // Première save
    const save1 = store.save('tuto-2', content, undefined)
    expect(save1.ok).toBe(true)

    // Deuxième save avec BONNE révision
    const save2 = store.save('tuto-2', { ...content, title: 'Modified' }, save1.revision)

    expect(save2.ok).toBe(true)
    expect(save2.revision).not.toBe(save1.revision)
  })

  it('should prevent recreating deleted draft via late PUT', () => {
    const store = new MockDraftStore()
    const content = { title: 'Test', sections: [] }

    // 1. Save
    const save1 = store.save('tuto-3', content, undefined)
    const revision1 = save1.revision

    // 2. Delete
    store.delete('tuto-3')

    // 3. Tentative tardive avec ancienne révision
    const late = store.save('tuto-3', { ...content, title: 'Stale' }, revision1)

    expect(late.ok).toBe(false)
    expect(late.conflict).toBe(true)
    expect(late.serverRevision).toBeUndefined()
  })

  it('concurrent saves should serialize (one succeeds, one conflicts)', () => {
    const store = new MockDraftStore()
    const content = { title: 'Base', sections: [] }

    // 1. Première save
    const save1 = store.save('tuto-4', content, undefined)
    const revision1 = save1.revision

    // 2. Deux saves concurrentes avec la même révision
    // (En réalité, DO les sérialise, mais on simule le "dernier" qui gagne)
    const concurrent1 = store.save('tuto-4', { ...content, title: 'A' }, revision1)

    // Après concurrent1 succès, la révision change
    // concurrent2 devrait donc échouer avec le nouveau serverRevision
    const concurrent2 = store.save('tuto-4', { ...content, title: 'B' }, revision1)

    // concurrent1 gagne
    expect(concurrent1.ok).toBe(true)
    // concurrent2 échoue (révision ne match pas)
    expect(concurrent2.ok).toBe(false)
    expect(concurrent2.conflict).toBe(true)
    expect(concurrent2.serverRevision).toBe(concurrent1.revision)
  })

  it('should isolate different tutorials', () => {
    const store = new MockDraftStore()
    const content = { title: 'Test', sections: [] }

    // Save deux tutoriels
    const save1 = store.save('tuto-a', { ...content, title: 'Tutorial A' }, undefined)
    const save2 = store.save('tuto-b', { ...content, title: 'Tutorial B' }, undefined)

    // Vérifier isolation
    expect(save1.revision).not.toBe(save2.revision)

    const load1 = store.load('tuto-a')
    const load2 = store.load('tuto-b')

    expect(load1?.content.title).toBe('Tutorial A')
    expect(load2?.content.title).toBe('Tutorial B')
  })

  it('should generate new revision after delete', () => {
    const store = new MockDraftStore()
    const content = { title: 'Test', sections: [] }

    // 1. Save
    const save1 = store.save('tuto-5', content, undefined)
    const revision1 = save1.revision

    // 2. Delete
    store.delete('tuto-5')

    // 3. Prochaine save génère révision nouvelle
    const save2 = store.save('tuto-5', content, undefined)

    expect(save2.ok).toBe(true)
    expect(save2.revision).not.toBe(revision1)
  })

  it('should preserve data integrity on conflict', () => {
    const store = new MockDraftStore()
    const content = { title: 'Original', sections: [] }

    // 1. Save original
    const save1 = store.save('tuto-6', content, undefined)

    // 2. Attempt save con mauvaise révision
    const save2 = store.save('tuto-6', { title: 'Attempted Override' }, 'wrong-revision')

    // 3. Vérifier que original n'a pas été modifié
    expect(save2.ok).toBe(false)

    const loaded = store.load('tuto-6')
    expect(loaded?.content.title).toBe('Original')
    expect(loaded?.revision).toBe(save1.revision)
  })

  it('should handle large content', () => {
    const store = new MockDraftStore()

    // Créer contenu volumineux (simulation)
    const largeContent = {
      title: 'Large Tutorial',
      sections: Array.from({ length: 100 }, (_, i) => ({
        uid: `s${i}`,
        title: `Section ${i}`,
        blocks: Array.from({ length: 50 }, (_, j) => ({
          uid: `b${i}-${j}`,
          type: 'text',
          content: `Block content ${i}-${j} with repetition...`,
        })),
      })),
    }

    const save1 = store.save('large-tuto', largeContent, undefined)
    expect(save1.ok).toBe(true)

    const loaded = store.load('large-tuto')
    expect(loaded?.content.sections.length).toBe(100)
    expect(loaded?.content.sections[0].blocks.length).toBe(50)
  })

  it('should handle revisions as opaque tokens', () => {
    const store = new MockDraftStore()
    const content = { title: 'Test', sections: [] }

    // Revisions devrait être traitées comme des tokens opaques
    // (client ne doit pas les interpréter)
    const save1 = store.save('tuto-7', content, undefined)
    const rev1 = save1.revision

    // Vérifier que c'est un UUID
    expect(rev1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

    // Utiliser comme baseRevision
    const save2 = store.save('tuto-7', { ...content, title: 'Modified' }, rev1)
    expect(save2.ok).toBe(true)
    expect(save2.revision).not.toEqual(rev1)
  })
})
