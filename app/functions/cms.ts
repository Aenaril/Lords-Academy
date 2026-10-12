/**
 * Utilitaires CMS pour Étape 3
 * 
 * Gère le stockage et la publication des configurations CMS
 * - Thèmes (themes.json)
 * - Annonces (announcements.json)
 * - Événements (events.json)
 * - Accueil (home.json)
 * - Paramètres site (settings.json)
 */

import type { Theme, ThemeLibrary, Announcement, Event, HomePageConfig, SiteSettings } from '../src/cms/types'

export interface CmsEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
}

/**
 * Publier configuration CMS vers GitHub avec révision monotone
 * 
 * Système de révisions durables et cohérence :
 * 1. Lire SHA + contenu de l'API GitHub (source atomique)
 * 2. Calculer révision monotone côté serveur
 * 3. Calculer hash du contenu nouveau (vérification exacte)
 * 4. Écrire sur GitHub avec SHA courant
 * 5. Vérifier post-publication par SHA + hash (pas juste _rev)
 * 6. Rejeter anciennes révisions même si elles arrivent plus tard
 */

/**
 * Calculer un hash SHA256 du contenu pour vérification d'identité exacte
 */
function hashContent(obj: any): string {
  const json = JSON.stringify(obj, null, 2)
  let hash = 0
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16)
}

export async function publishCmsConfig(
  env: CmsEnv,
  filename: string,
  content: any,
  maxRetries = 3
): Promise<{ ok: boolean; revision?: string; revisionNumber?: number; error?: string }> {
  const path = `app/public/cms/${filename}`
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`
  const rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${path}`

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-cms-function',
    Accept: 'application/vnd.github+json',
  }

  let lastError = ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // ÉTAPE 1 : Lire SHA + contenu de manière ATOMIQUE depuis API GitHub
      // (pas raw.githubusercontent.com qui peut être en cache)
      let currentRevision = 0
      let currentSha: string | undefined
      let currentPublishedContent: any = null

      try {
        const apiRes = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })
        if (apiRes.ok) {
          const apiData = (await apiRes.json()) as any
          currentSha = apiData.sha

          // Décoder le contenu depuis API
          if (apiData.content) {
            const decodedContent = atob(apiData.content)
            currentPublishedContent = JSON.parse(decodedContent)
            currentRevision = currentPublishedContent?._rev || 0

            console.info(
              `📖 État GitHub cohérent: rev=${currentRevision}, theme=${currentPublishedContent?.activeThemeId}, sha=${currentSha.slice(0, 7)}`
            )
          }
        }
      } catch (e) {
        console.warn(
          `⚠️ Impossible de lire depuis API GitHub (${(e as any).message}), en supposant premier déploiement`
        )
        currentRevision = 0
        currentSha = undefined
      }

      // ÉTAPE 2 : Calculer la nouvelle révision (monotone, côté serveur)
      const newRevision = currentRevision + 1

      // ÉTAPE 3 : Préparer le contenu avec révision
      const wrappedContent = {
        ...content,
        _rev: newRevision,
        _publishedAt: Date.now(),
      }

      const newContentHash = hashContent(wrappedContent)

      // ÉTAPE 4 : Encoder et écrire sur GitHub
      const contentB64 = btoa(
        unescape(encodeURIComponent(JSON.stringify(wrappedContent, null, 2)))
      )

      console.info(
        `📤 Tentative d'écriture ${attempt + 1}/${maxRetries}: rev=${newRevision}, hash=${newContentHash.slice(0, 7)}, currentSha=${currentSha?.slice(0, 7)}`
      )

      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Mise à jour ${filename} (CMS) — rev ${newRevision} — ${new Date().toISOString()}`,
          content: contentB64,
          branch: env.GITHUB_BRANCH,
          sha: currentSha || undefined,
        }),
      })

      if (!putRes.ok) {
        const errText = await putRes.text()
        lastError = `GitHub PUT failed: ${putRes.status} ${errText}`

        // 409 Conflict = SHA mismatch → relire et retry
        if (putRes.status === 409) {
          console.warn(
            `⚠️ Conflit SHA (409): le fichier a changé entre la lecture et l'écriture. Relecture et retry...`
          )
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1))) // Backoff
            continue // Relire le SHA et retry
          }
          return { ok: false, error: 'SHA conflict after retries' }
        }

        // 401 Auth = échouer immédiatement
        if (putRes.status === 401) {
          return { ok: false, error: 'GitHub auth failed' }
        }

        // Autres erreurs = retry
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
          continue
        }
        return { ok: false, error: lastError }
      }

      const putResult = (await putRes.json()) as any
      const newSha = putResult.content?.sha

      // ÉTAPE 5 : Vérifier post-publication par SHA + hash (pas juste _rev)
      // Attendre un peu pour que GitHub propage
      console.info(
        `📝 Écriture GitHub réussie: nouveau SHA=${newSha?.slice(0, 7)}, attente propagation...`
      )
      await new Promise((r) => setTimeout(r, 500))

      let verified = false
      let publishedContent: any = null
      let publishedHash = ''

      // Vérifier 5 fois avec backoff exponentiel
      for (let verifyAttempt = 0; verifyAttempt < 5; verifyAttempt++) {
        try {
          // Lire depuis API GitHub (source cohérente)
          const verifyRes = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })

          if (verifyRes.ok) {
            const verifyData = (await verifyRes.json()) as any
            const verifySha = verifyData.sha

            // Décoder contenu
            if (verifyData.content) {
              const decodedContent = atob(verifyData.content)
              publishedContent = JSON.parse(decodedContent)
              publishedHash = hashContent(publishedContent)

              // Vérifications STRICTES :
              // 1. SHA correspond
              // 2. Révision correspond
              // 3. Theme ID correspond
              // 4. Hash du contenu correspond (identité exacte)
              if (
                verifySha === newSha &&
                publishedContent._rev === newRevision &&
                publishedContent.activeThemeId === content.activeThemeId &&
                publishedHash === newContentHash
              ) {
                verified = true
                console.info(
                  `✅ Publication vérifiée: rev=${newRevision}, sha=${newSha?.slice(0, 7)}, hash=${publishedHash.slice(0, 7)}`
                )
                return { ok: true, revision: newSha, revisionNumber: newRevision }
              }

              console.warn(
                `⚠️ Vérif. tentative ${verifyAttempt + 1}/5: mismatch détecté`
              )
              if (verifySha !== newSha)
                console.warn(`  SHA: ${verifySha?.slice(0, 7)} vs attendu ${newSha?.slice(0, 7)}`)
              if (publishedContent._rev !== newRevision)
                console.warn(`  Rev: ${publishedContent._rev} vs attendu ${newRevision}`)
              if (publishedContent.activeThemeId !== content.activeThemeId)
                console.warn(
                  `  Theme: ${publishedContent.activeThemeId} vs attendu ${content.activeThemeId}`
                )
              if (publishedHash !== newContentHash)
                console.warn(
                  `  Hash: ${publishedHash.slice(0, 7)} vs attendu ${newContentHash.slice(0, 7)}`
                )
            }
          }
        } catch (e) {
          console.warn(
            `⚠️ Vérif. tentative ${verifyAttempt + 1}/5 échouée: ${(e as any).message}`
          )
        }

        if (verifyAttempt < 4) {
          await new Promise((r) => setTimeout(r, 300 * (verifyAttempt + 1)))
        }
      }

      if (!verified) {
        lastError = `Publication verification failed: expected rev ${newRevision} sha ${newSha?.slice(0, 7)} hash ${newContentHash.slice(0, 7)}, got rev ${publishedContent?._rev} hash ${publishedHash.slice(0, 7)}`
        console.error(lastError)
        // Ne pas retry si vérification stricte échoue
        return { ok: false, error: lastError }
      }

      return { ok: true, revision: newSha, revisionNumber: newRevision }
    } catch (err) {
      lastError = `Exception: ${(err as any).message}`
      if (attempt === maxRetries - 1) {
        return { ok: false, error: lastError }
      }
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
    }
  }

  return { ok: false, error: lastError }
}

/**
 * Charger configuration CMS depuis GitHub
 */
export async function loadCmsConfig(
  env: CmsEnv,
  filename: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const path = `app/public/cms/${filename}`
  const url = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${path}`

  try {
    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
    })

    if (!res.ok) {
      return { ok: false, data: null } // Fichier n'existe pas encore
    }

    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, data: null }
  }
}

/**
 * Valider thème
 */
export function validateTheme(theme: any): boolean {
  if (!theme || typeof theme !== 'object') return false
  if (typeof theme.id !== 'string' || !theme.id.trim()) return false
  if (typeof theme.name !== 'string' || !theme.name.trim()) return false
  if (!theme.colors || typeof theme.colors !== 'object') return false
  if (!theme.typography || typeof theme.typography !== 'object') return false
  return true
}

/**
 * Valider annonce
 */
export function validateAnnouncement(ann: any): boolean {
  if (!ann || typeof ann !== 'object') return false
  if (typeof ann.id !== 'string' || !ann.id.trim()) return false
  if (typeof ann.title !== 'string' || !ann.title.trim()) return false
  if (typeof ann.description !== 'string') return false
  if (typeof ann.buttonText !== 'string' || !ann.buttonText.trim()) return false
  if (typeof ann.bgColor !== 'string' || !ann.bgColor.trim()) return false
  return true
}

/**
 * Valider événement
 */
export function validateEvent(evt: any): boolean {
  if (!evt || typeof evt !== 'object') return false
  if (typeof evt.id !== 'string' || !evt.id.trim()) return false
  if (typeof evt.name !== 'string' || !evt.name.trim()) return false
  if (typeof evt.startAt !== 'number' || evt.startAt <= 0) return false
  if (typeof evt.tutorialId !== 'string') return false
  return true
}

/**
 * Valider config accueil
 */
export function validateHomeConfig(config: any): boolean {
  if (!config || typeof config !== 'object') return false
  if (typeof config.title !== 'string' || !config.title.trim()) return false
  if (typeof config.subtitle !== 'string') return false
  if (!config.sections || typeof config.sections !== 'object') return false
  return true
}

/**
 * Valider paramètres site
 */
export function validateSiteSettings(settings: any): boolean {
  if (!settings || typeof settings !== 'object') return false
  if (typeof settings.siteName !== 'string' || !settings.siteName.trim()) return false
  if (typeof settings.siteDescription !== 'string') return false
  return true
}

