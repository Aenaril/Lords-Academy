/**
 * Logique réutilisable pour fusionner tutoriels d'index.json + brouillons orphelins de KV.
 * Utilisée par le handler et par les tests.
 */

export interface TutorialStatusResult {
  id: string
  title: string | null
  category: string | null
  status: 'draft' | 'in_progress' | 'published' | 'unpublished' | 'coming-soon'
  hasDraft: boolean
  lastModified: string | null
  inIndex: boolean
}

/**
 * Fusionne les tutoriels de index.json avec les brouillons orphelins de KV.
 * 
 * @param indexTutorials - Tutoriels depuis index.json
 * @param draftIds - Ensemble des IDs de brouillons depuis KV
 * @returns Tableau fusionné sans doublons
 */
export function mergeTutorialStatuses(
  indexTutorials: any[],
  draftIds: Set<string>
): TutorialStatusResult[] {
  const result: TutorialStatusResult[] = []
  const processedIds = new Set<string>()

  // 1. Ajouter tous les tutoriels de index.json
  indexTutorials.forEach((t: any) => {
    result.push({
      id: t.id,
      title: t.title || t.id,
      category: t.category || null,
      status: t.status || 'draft',
      hasDraft: draftIds.has(t.id),
      lastModified: t.lastModified || null,
      inIndex: true
    })
    processedIds.add(t.id)
  })

  // 2. Ajouter les brouillons orphelins (en KV mais pas en index.json)
  draftIds.forEach((draftId: string) => {
    if (!processedIds.has(draftId)) {
      result.push({
        id: draftId,
        title: null,  // Pas de métadonnées
        category: null,
        status: 'draft',
        hasDraft: true,
        lastModified: null,
        inIndex: false
      })
      processedIds.add(draftId)
    }
  })

  return result
}
