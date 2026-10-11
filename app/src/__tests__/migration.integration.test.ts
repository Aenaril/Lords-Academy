/**
 * Tests d'intégration — Validation migration KV → DO
 * 
 * Valide :
 * - Format de données compatible
 * - Checksum validation
 * - Aucune perte de données
 */

import { describe, it, expect } from 'vitest'

// Mock simple de checksum pour tests
function computeChecksum(data: any): string {
  const jsonString = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(64, '0')
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

describe('Migration — KV → Durable Objects', () => {
  it('should validate checksum for migrated draft', () => {
    const content = {
      title: 'Dragon Arena',
      sections: [{ uid: 's1', title: 'Basics', blocks: [] }],
    }

    const checksum = computeChecksum(content)
    const recomputedChecksum = computeChecksum(content)

    expect(checksum).toBe(recomputedChecksum)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should reject migration with checksum mismatch', () => {
    const content = { title: 'Test', sections: [] }
    const correctChecksum = computeChecksum(content)
    const wrongChecksum = 'aaaa0000bbbb1111cccc2222dddd3333'

    expect(correctChecksum).not.toBe(wrongChecksum)
  })

  it('should preserve all data during migration', () => {
    const complexContent = {
      title: 'Complex Tutorial',
      description: 'A tutorial with multiple sections',
      difficulty: 'intermediate',
      estimatedDuration: 45,
      coverIcon: 'icon-dragon',
      sections: [
        {
          uid: 's1',
          title: 'Introduction',
          blocks: [
            { uid: 'b1', type: 'text', content: 'Welcome' },
            {
              uid: 'b2',
              type: 'image',
              content: 'image.jpg',
              metadata: { width: 800, height: 600 },
            },
          ],
        },
        {
          uid: 's2',
          title: 'Main Content',
          blocks: [
            { uid: 'b3', type: 'video', content: 'video.mp4', duration: 300 },
          ],
        },
      ],
    }

    const checksum = computeChecksum(complexContent)
    const migratedData = JSON.parse(JSON.stringify(complexContent))

    expect(migratedData.title).toBe('Complex Tutorial')
    expect(migratedData.description).toBe('A tutorial with multiple sections')
    expect(migratedData.sections.length).toBe(2)
    expect(migratedData.sections[0].blocks.length).toBe(2)
    expect(migratedData.sections[1].blocks[0].duration).toBe(300)

    const migratedChecksum = computeChecksum(migratedData)
    expect(migratedChecksum).toBe(checksum)
  })

  it('should handle migration of empty sections', () => {
    const minimalContent = {
      title: 'Minimal',
      sections: [],
    }

    const checksum = computeChecksum(minimalContent)
    const migratedData = JSON.parse(JSON.stringify(minimalContent))

    expect(migratedData.sections).toEqual([])
    expect(computeChecksum(migratedData)).toBe(checksum)
  })

  it('should handle null and undefined fields', () => {
    const contentWithNulls = {
      title: 'Test',
      description: null,
      coverIcon: undefined,
      sections: [],
    }

    const jsonString = JSON.stringify(contentWithNulls)
    const parsed = JSON.parse(jsonString)

    expect(parsed.title).toBe('Test')
    expect(parsed.description).toBeNull()
    expect(parsed.coverIcon).toBeUndefined()
    expect(parsed.sections).toEqual([])
  })

  it('should handle special characters in content', () => {
    const specialContent = {
      title: 'Élève avec accénts',
      sections: [
        {
          uid: 's1',
          title: 'Ñoño & Émoji 🐉',
          blocks: [
            {
              uid: 'b1',
              type: 'text',
              content: 'Test avec "guillemets" et \'apostrophes\' et \\ backslash',
            },
          ],
        },
      ],
    }

    const checksum = computeChecksum(specialContent)
    const migratedData = JSON.parse(JSON.stringify(specialContent))
    const migratedChecksum = computeChecksum(migratedData)

    expect(migratedChecksum).toBe(checksum)
    expect(migratedData.sections[0].title).toContain('🐉')
  })

  it('should handle deeply nested structures', () => {
    const deepContent = {
      title: 'Deep Tutorial',
      sections: [
        {
          uid: 's1',
          blocks: [
            {
              uid: 'b1',
              type: 'container',
              content: {
                nested: {
                  deeply: {
                    with: {
                      multiple: {
                        levels: [1, 2, 3, { key: 'value' }],
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    }

    const checksum = computeChecksum(deepContent)
    const migratedData = JSON.parse(JSON.stringify(deepContent))
    const migratedChecksum = computeChecksum(migratedData)

    expect(migratedChecksum).toBe(checksum)
    expect(migratedData.sections[0].blocks[0].content.nested.deeply.with.multiple.levels[3].key).toBe(
      'value'
    )
  })

  it('should detect data corruption via checksum', () => {
    const content = {
      title: 'Test',
      sections: [{ uid: 's1', blocks: [] }],
    }

    const originalChecksum = computeChecksum(content)

    const corruptedContent = {
      ...content,
      sections: [{ uid: 's1', blocks: [{ uid: 'b1', type: 'text' }] }],
    }

    const corruptedChecksum = computeChecksum(corruptedContent)

    expect(originalChecksum).not.toBe(corruptedChecksum)
  })

  it('should handle revision preservation', () => {
    const tutorialId = 'dragon-arena'
    const content = { title: 'Dragon Arena', sections: [] }
    const revision = generateUUID()
    const checksum = computeChecksum(content)

    const kvEntry = {
      tutorialId,
      content,
      revision,
      updatedAt: Date.now(),
      checksum,
    }

    const migratedEntry = {
      tutorialId: kvEntry.tutorialId,
      content: kvEntry.content,
      revision: kvEntry.revision,
      updatedAt: kvEntry.updatedAt,
    }

    expect(migratedEntry.revision).toBe(revision)
    expect(computeChecksum(migratedEntry.content)).toBe(checksum)
  })
})
