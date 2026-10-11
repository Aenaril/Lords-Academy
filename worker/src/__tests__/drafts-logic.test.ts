/**
 * Test simple Phase 1 — Vérification de la logique (sans Cloudflare binding)
 * 
 * Ce test valide les opérations de base sans dépendre de `cloudflare:workers`
 */

import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Logique simple de gestion des révisions (reproductible localement)
 */
class SimpleDraftManager {
  private draft: { content: any; revision: string; createdAt: number; updatedAt: number } | null = null

  async save(params: {
    content: any
    baseRevision?: string
  }): Promise<{
    ok: boolean
    revision?: string
    conflict?: boolean
    serverRevision?: string
  }> {
    // Vérifier match de baseRevision
    if (params.baseRevision !== (this.draft?.revision ?? undefined)) {
      return {
        ok: false,
        conflict: true,
        serverRevision: this.draft?.revision,
      }
    }

    // Générer nouvelle révision
    const newRevision = crypto.randomUUID()
    const now = Date.now()

    if (!this.draft) {
      this.draft = {
        content: params.content,
        revision: newRevision,
        createdAt: now,
        updatedAt: now,
      }
    } else {
      this.draft = {
        ...this.draft,
        content: params.content,
        revision: newRevision,
        updatedAt: now,
      }
    }

    return { ok: true, revision: newRevision }
  }

  async load() {
    return this.draft
  }

  delete() {
    this.draft = null
    return { ok: true }
  }
}

describe('Draft Manager Logic — Phase 1', () => {
  let manager: SimpleDraftManager

  beforeEach(() => {
    manager = new SimpleDraftManager()
  })

  it('1. Créer un brouillon', async () => {
    const content = { title: 'Test Tutorial', modules: [] }
    const result = await manager.save({ content })

    expect(result.ok).toBe(true)
    expect(result.revision).toBeDefined()
    expect(result.conflict).toBeFalsy()

    const draft = await manager.load()
    expect(draft?.content).toEqual(content)
    expect(draft?.revision).toBe(result.revision)

    console.log('✓ Brouillon créé')
  })

  it('2. Charger le brouillon', async () => {
    const content = { title: 'Test Tutorial', modules: [] }
    const save1 = await manager.save({ content })

    const draft = await manager.load()
    expect(draft).toBeDefined()
    expect(draft?.content).toEqual(content)
    expect(draft?.revision).toBe(save1.revision)

    console.log('✓ Brouillon chargé')
  })

  it('3. Refuser mise à jour avec ancienne révision (409)', async () => {
    const content1 = { title: 'V1', modules: [] }
    const save1 = await manager.save({ content: content1 })

    const content2 = { title: 'V2', modules: [{ name: 'Module' }] }
    const save2 = await manager.save({ content: content2, baseRevision: save1.revision })
    expect(save2.ok).toBe(true)

    // Tenter mise à jour avec ancienne révision
    const content3 = { title: 'V3', modules: [] }
    const save3 = await manager.save({ content: content3, baseRevision: save1.revision })

    expect(save3.ok).toBe(false)
    expect(save3.conflict).toBe(true)
    expect(save3.serverRevision).toBe(save2.revision)

    console.log('✓ Conflit 409 détecté')
  })

  it('4. Mettre à jour avec bonne révision', async () => {
    const content1 = { title: 'V1', modules: [] }
    const save1 = await manager.save({ content: content1 })

    const content2 = { title: 'V2 Updated', modules: [{ name: 'Advanced' }] }
    const save2 = await manager.save({ content: content2, baseRevision: save1.revision })

    expect(save2.ok).toBe(true)
    expect(save2.revision).not.toBe(save1.revision)

    const draft = await manager.load()
    expect(draft?.content).toEqual(content2)
    expect(draft?.revision).toBe(save2.revision)

    console.log('✓ Mise à jour OK')
  })

  it('5. Supprimer le brouillon', async () => {
    const content = { title: 'To Delete', modules: [] }
    await manager.save({ content })

    let draft = await manager.load()
    expect(draft).toBeDefined()

    const deleteResult = manager.delete()
    expect(deleteResult.ok).toBe(true)

    draft = await manager.load()
    expect(draft).toBeNull()

    console.log('✓ Suppression OK')
  })

  it('6. Après suppression, nouvelle révision sans conflit initial', async () => {
    const content1 = { title: 'V1', modules: [] }
    const save1 = await manager.save({ content: content1 })

    manager.delete()

    // Tenter avec ancienne révision = conflit (car serverRevision = undefined)
    const content2 = { title: 'V2', modules: [] }
    const save2 = await manager.save({ content: content2, baseRevision: save1.revision })
    expect(save2.conflict).toBe(true)
    expect(save2.serverRevision).toBeUndefined()

    // Créer avec undefined (nouveau brouillon)
    const save3 = await manager.save({ content: content2, baseRevision: undefined })
    expect(save3.ok).toBe(true)

    console.log('✓ Création après suppression OK')
  })
})
