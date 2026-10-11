/**
 * Script de migration — KV → Durable Objects
 * 
 * À exécuter après déploiement du Worker DO en production.
 * Lira tous les brouillons depuis KV, validera checksums, et créera les équivalents en DO.
 * 
 * Usage :
 *   npx wrangler execute scripts/migrate-kv-to-do.ts --env production
 * 
 * Audit :
 *   Créer un fichier migration-{timestamp}.json avec les résultats
 */

import crypto from 'crypto'

export interface MigrationResult {
  success: string[]
  failed: Array<{ tutorialId: string; error: string }>
  checksums: Record<string, string>
  startTime: string
  endTime: string
  totalProcessed: number
  totalSuccessful: number
  totalFailed: number
}

/**
 * Calculer SHA256 checksum (identique à DO)
 */
function computeChecksum(data: any): string {
  const jsonString = JSON.stringify(data)
  const hash = crypto.createHash('sha256').update(jsonString).digest('hex')
  return hash
}

/**
 * Exécuter la migration
 */
export async function migrateKVToDO(env: any): Promise<MigrationResult> {
  const results: MigrationResult = {
    success: [],
    failed: [],
    checksums: {},
    startTime: new Date().toISOString(),
    endTime: '',
    totalProcessed: 0,
    totalSuccessful: 0,
    totalFailed: 0,
  }

  try {
    console.log('[Migration] Début de la migration KV → Durable Objects')

    // 1. Lister toutes les clés KV
    console.log('[Migration] Énumération des clés KV...')

    const kvList = await env.DRAFTS.list({ prefix: 'draft:' })
    console.log(`[Migration] ${kvList.keys.length} brouillon(s) trouvé(s)`)

    // 2. Pour chaque brouillon
    for (const key of kvList.keys) {
      const tutorialId = key.name.replace('draft:', '')
      results.totalProcessed++

      try {
        console.log(
          `[Migration] Traitement ${tutorialId} (${results.totalProcessed}/${kvList.keys.length})...`
        )

        // 2a. Lire depuis KV
        const kvData = await env.DRAFTS.get(key.name, 'json')
        if (!kvData) {
          results.failed.push({
            tutorialId,
            error: 'KV entry empty or unreadable',
          })
          results.totalFailed++
          continue
        }

        // 2b. Valider format
        if (!kvData.content || !kvData.revision || !kvData.updatedAt) {
          results.failed.push({
            tutorialId,
            error: 'KV entry missing required fields (content, revision, updatedAt)',
          })
          results.totalFailed++
          continue
        }

        // 2c. Calculer checksum
        const checksum = computeChecksum(kvData.content)

        // 2d. Invoquer DO.migrate()
        const doStub = env.DRAFTS_DO.get(tutorialId)
        const migrateResult = await doStub.migrate({
          content: kvData.content,
          revision: kvData.revision,
          updatedAt: kvData.updatedAt,
          checksum,
        })

        if (migrateResult.ok) {
          console.log(`[Migration] ✓ ${tutorialId} migré avec succès`)
          results.success.push(tutorialId)
          results.checksums[tutorialId] = checksum
          results.totalSuccessful++

          // 2e. Marquer comme migré en KV (pour retour arrière / audit)
          await env.DRAFTS.put(
            `migrated:${tutorialId}`,
            JSON.stringify({
              migratedAt: Date.now(),
              checksum,
              revision: kvData.revision,
            })
          )
        } else {
          console.error(`[Migration] ✗ ${tutorialId} échoué : ${migrateResult.error}`)
          results.failed.push({
            tutorialId,
            error: migrateResult.error || 'Unknown error',
          })
          results.totalFailed++
        }
      } catch (err) {
        console.error(`[Migration] ✗ ${tutorialId} exception : ${String(err)}`)
        results.failed.push({
          tutorialId,
          error: String(err),
        })
        results.totalFailed++
      }
    }

    results.endTime = new Date().toISOString()

    // 3. Résumé
    console.log('[Migration] Migration terminée')
    console.log(`[Migration] Succès : ${results.totalSuccessful}/${results.totalProcessed}`)
    console.log(`[Migration] Échoué : ${results.totalFailed}/${results.totalProcessed}`)

    if (results.failed.length > 0) {
      console.warn('[Migration] Erreurs :')
      for (const { tutorialId, error } of results.failed) {
        console.warn(`  - ${tutorialId} : ${error}`)
      }
    }

    return results
  } catch (err) {
    console.error('[Migration] Erreur globale :', err)
    results.endTime = new Date().toISOString()
    results.failed.push({
      tutorialId: '__GLOBAL__',
      error: String(err),
    })
    return results
  }
}

/**
 * Validation post-migration
 * 
 * Vérifier que les données migrées n'ont pas de checksum mismatch
 */
export async function validateMigration(
  env: any,
  results: MigrationResult
): Promise<{
  allValid: boolean
  mismatches: Array<{ tutorialId: string; expectedChecksum: string; actualChecksum: string }>
}> {
  const mismatches: typeof mismatches = []

  console.log('[Validation] Vérification des checksums post-migration...')

  for (const [tutorialId, expectedChecksum] of Object.entries(results.checksums)) {
    const doStub = env.DRAFTS_DO.get(tutorialId)
    const draft = await doStub.load()

    if (!draft) {
      mismatches.push({
        tutorialId,
        expectedChecksum,
        actualChecksum: 'NOT_FOUND',
      })
      continue
    }

    const actualChecksum = computeChecksum(draft.content)

    if (actualChecksum !== expectedChecksum) {
      mismatches.push({
        tutorialId,
        expectedChecksum,
        actualChecksum,
      })
    } else {
      console.log(`[Validation] ✓ ${tutorialId} checksum valid`)
    }
  }

  const allValid = mismatches.length === 0
  console.log(
    `[Validation] ${allValid ? '✓ Tous les checksums valides' : `✗ ${mismatches.length} mismatch(es)`}`
  )

  return { allValid, mismatches }
}

/**
 * Rollback — restaurer depuis KV si migration échoue
 * 
 * À utiliser SEULEMENT en cas de problème critique.
 * Ne supprime PAS les données KV (conserver 30j pour audit).
 */
export async function rollbackMigration(
  env: any,
  migratedTutorials: string[]
): Promise<{
  purged: number
  error?: string
}> {
  try {
    console.log('[Rollback] Début du rollback...')

    let purged = 0
    for (const tutorialId of migratedTutorials) {
      // Supprimer du DO (ne pas toucher KV originel)
      const doStub = env.DRAFTS_DO.get(tutorialId)
      await doStub.delete()
      purged++

      // Supprimer le marqueur "migrated:"
      await env.DRAFTS.delete(`migrated:${tutorialId}`)
    }

    console.log(`[Rollback] ✓ ${purged} brouillon(s) nettoyés du DO`)
    return { purged }
  } catch (err) {
    console.error('[Rollback] Erreur :', err)
    return { purged: 0, error: String(err) }
  }
}
