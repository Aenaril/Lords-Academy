/**
 * Tests unitaires de mergeTutorialStatuses
 * Fonction réutilisable utilisée par le handler et les tests d'intégration.
 */

import { describe, it, expect } from 'vitest'
import { mergeTutorialStatuses } from '../src/utils/mergeTutorialStatuses'

describe('mergeTutorialStatuses - Unit Tests', () => {
  it('should merge index.json tutorials + orphaned KV drafts without duplicates', () => {
    const indexTutorials = [
      { id: 'pub-1', title: 'Published', category: 'Test', status: 'published', lastModified: '2026-10-10T14:00:00Z' },
      { id: 'unpub-1', title: 'Unpublished', category: 'Test', status: 'unpublished', lastModified: '2026-10-09T20:15:00Z' },
      { id: 'wip-1', title: 'WIP', category: 'Test', status: 'in_progress', lastModified: '2026-10-08T10:30:00Z' },
      { id: 'coming-1', title: 'Coming', category: 'Test', status: 'coming-soon', lastModified: null },
      { id: 'draft-1', title: 'Draft', category: 'Test', status: 'draft', lastModified: null }
    ]

    const draftIds = new Set(['wip-1', 'draft-1', 'orphan-draft-1'])

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    // Should have 6 items: 5 from index + 1 orphan
    expect(result).toHaveLength(6)

    // Verify orphan is included with correct properties
    const orphan = result.find(t => t.id === 'orphan-draft-1')
    expect(orphan).toBeDefined()
    expect(orphan!.title).toBeNull()
    expect(orphan!.category).toBeNull()
    expect(orphan!.status).toBe('draft')
    expect(orphan!.hasDraft).toBe(true)
    expect(orphan!.inIndex).toBe(false)

    // No duplicates
    const ids = result.map(t => t.id)
    expect(new Set(ids).size).toBe(6)
  })

  it('should not duplicate tutoriels when merging index + KV', () => {
    const indexTutorials = [
      { id: 'a', title: 'A', status: 'published' },
      { id: 'b', title: 'B', status: 'draft' }
    ]

    const draftIds = new Set(['b', 'c'])  // 'b' is in index, 'c' is orphan

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    expect(result).toHaveLength(3)
    const ids = result.map(t => t.id)
    expect(new Set(ids).size).toBe(3)

    // Verify 'b' is not duplicated
    const bCount = result.filter(t => t.id === 'b').length
    expect(bCount).toBe(1)
  })

  it('should mark in-index tutoriels with inIndex=true', () => {
    const indexTutorials = [
      { id: 'pub-1', title: 'Pub', status: 'published' }
    ]

    const draftIds = new Set<string>()

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    expect(result).toHaveLength(1)
    expect(result[0].inIndex).toBe(true)
  })

  it('should include both in-index and orphaned tutoriels in correct counts', () => {
    const indexTutorials = [
      { id: 'pub-1', title: 'Pub', status: 'published' }
    ]

    const draftIds = new Set(['pub-1', 'orphan-1', 'orphan-2'])

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    expect(result).toHaveLength(3)

    const inIndexCount = result.filter(t => t.inIndex === true).length
    const orphanCount = result.filter(t => t.inIndex === false).length

    expect(inIndexCount).toBe(1)
    expect(orphanCount).toBe(2)
  })

  it('should handle hasDraft flag correctly for in-index tutoriels', () => {
    const indexTutorials = [
      { id: 'pub-1', title: 'Pub', status: 'published' },
      { id: 'wip-1', title: 'WIP', status: 'in_progress' }
    ]

    const draftIds = new Set(['wip-1', 'orphan-1'])

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    const pub = result.find(t => t.id === 'pub-1')
    const wip = result.find(t => t.id === 'wip-1')
    const orphan = result.find(t => t.id === 'orphan-1')

    expect(pub!.hasDraft).toBe(false)  // Not in draftIds
    expect(wip!.hasDraft).toBe(true)   // In draftIds
    expect(orphan!.hasDraft).toBe(true)  // Always true for orphans
  })

  it('should return correct structure with all required fields', () => {
    const indexTutorials = [
      { id: 'test-1', title: 'Test', category: 'TestCat', status: 'draft', lastModified: '2026-10-10' }
    ]

    const draftIds = new Set<string>()

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    expect(result).toHaveLength(1)
    const item = result[0]

    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('title')
    expect(item).toHaveProperty('category')
    expect(item).toHaveProperty('status')
    expect(item).toHaveProperty('hasDraft')
    expect(item).toHaveProperty('lastModified')
    expect(item).toHaveProperty('inIndex')
  })

  it('should handle empty inputs correctly', () => {
    const result = mergeTutorialStatuses([], new Set())
    expect(result).toHaveLength(0)
  })

  it('should handle only orphaned drafts (no index tutoriels)', () => {
    const indexTutorials: any[] = []
    const draftIds = new Set(['orphan-1', 'orphan-2'])

    const result = mergeTutorialStatuses(indexTutorials, draftIds)

    expect(result).toHaveLength(2)
    result.forEach(t => {
      expect(t.inIndex).toBe(false)
      expect(t.status).toBe('draft')
      expect(t.title).toBeNull()
    })
  })
})
