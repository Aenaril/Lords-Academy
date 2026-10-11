/**
 * Test RPC Durable Objects — Phase 2
 * Endpoint TEMPORAIRE pour valider la connexion DO
 * 
 * À SUPPRIMER après validation
 */

export async function onRequest(context: any) {
  const { DRAFTS_DO } = context.env

  if (!DRAFTS_DO) {
    return new Response(JSON.stringify({ error: 'DRAFTS_DO binding not found' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const tutorialId = 'test-do-validation'
    const doId = DRAFTS_DO.idFromString(tutorialId)
    const stub = DRAFTS_DO.get(doId)

    const results: any = {
      tests: [],
    }

    // TEST 1: SAVE
    console.log('[TEST] SAVE — Créer un brouillon')
    const saveResult = await stub.save({
      content: { title: 'Test Tutorial', text: 'Version initiale' },
      baseRevision: undefined,
    })

    if (!saveResult.ok) {
      throw new Error(`SAVE failed: ${JSON.stringify(saveResult)}`)
    }

    const revision1 = saveResult.revision
    results.tests.push({
      name: 'SAVE',
      status: 'OK',
      revision: revision1,
    })
    console.log(`✅ SAVE OK: revision=${revision1}`)

    // TEST 2: LOAD
    console.log('[TEST] LOAD — Relire le brouillon')
    const draft = await stub.load()

    if (!draft) {
      throw new Error('LOAD failed: draft is undefined')
    }

    if (draft.content.text !== 'Version initiale') {
      throw new Error(`LOAD failed: content mismatch`)
    }

    if (draft.revision !== revision1) {
      throw new Error(`LOAD failed: revision mismatch`)
    }

    results.tests.push({
      name: 'LOAD',
      status: 'OK',
      content: draft.content.text,
      revision: draft.revision,
    })
    console.log(`✅ LOAD OK: content="${draft.content.text}"`)

    // TEST 3: CONFLICT
    console.log('[TEST] CONFLICT — Refuser ancienne révision')
    const conflictResult = await stub.save({
      content: { title: 'Test Tutorial', text: 'Modification tentée' },
      baseRevision: 'wrong-revision-uuid',
    })

    if (conflictResult.ok) {
      throw new Error('CONFLICT test failed: save should have been rejected')
    }

    if (!conflictResult.conflict) {
      throw new Error('CONFLICT test failed: conflict flag missing')
    }

    if (conflictResult.serverRevision !== revision1) {
      throw new Error('CONFLICT test failed: serverRevision mismatch')
    }

    results.tests.push({
      name: 'CONFLICT',
      status: 'REJECTED',
      serverRevision: conflictResult.serverRevision,
    })
    console.log(`✅ CONFLICT OK: conflit détecté (409)`)

    // TEST 4: DELETE
    console.log('[TEST] DELETE — Supprimer le brouillon')
    const deleteResult = stub.delete()

    if (!deleteResult.ok) {
      throw new Error(`DELETE failed: ${JSON.stringify(deleteResult)}`)
    }

    const draftAfterDelete = await stub.load()

    if (draftAfterDelete !== undefined) {
      throw new Error('DELETE test failed: draft should be undefined')
    }

    results.tests.push({
      name: 'DELETE',
      status: 'OK',
    })
    console.log(`✅ DELETE OK: brouillon supprimé`)

    // Résumé
    results.summary = {
      allTestsPassed: true,
      totalTests: 4,
      passedTests: 4,
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(results, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[ERROR]', err.message)
    return new Response(
      JSON.stringify({
        error: err.message,
        stack: err.stack,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
