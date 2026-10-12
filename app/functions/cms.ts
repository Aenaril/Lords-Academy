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
 * Publier configuration CMS vers GitHub
 * 
 * Inclut :
 * - Numéro de révision monotone (_rev) pour éviter les retours arrière
 * - Vérification post-publication que le fichier est accessible
 * - Retry sur erreur SHA (cas de race conditions)
 */
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

  // Ajouter numéro de révision monotone au contenu
  const wrappedContent = {
    ...content,
    _rev: (content._rev || 0) + 1,
    _publishedAt: Date.now(),
  }

  let lastError = ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Récupérer SHA courant (peut avoir changé depuis la dernière tentative)
      const currentRes = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })
      let sha: string | undefined
      if (currentRes.ok) {
        sha = ((await currentRes.json()) as any).sha
      }

      const contentB64 = btoa(
        unescape(encodeURIComponent(JSON.stringify(wrappedContent, null, 2)))
      )

      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Mise à jour ${filename} (CMS) — ${new Date().toISOString()}`,
          content: contentB64,
          branch: env.GITHUB_BRANCH,
          sha,
        }),
      })

      if (!putRes.ok) {
        const errText = await putRes.text()
        lastError = `GitHub PUT failed: ${putRes.status} ${errText}`
        // Continue to retry on 409 (conflict), fail immediately on 401 (auth)
        if (putRes.status === 401) {
          return { ok: false, error: 'GitHub auth failed' }
        }
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1))) // Exponential backoff
          continue
        }
        return { ok: false, error: lastError }
      }

      const putResult = (await putRes.json()) as any
      const newSha = putResult.content?.sha
      const revisionNumber = wrappedContent._rev

      // ✅ VÉRIFICATION POST-PUBLICATION : S'assurer que le fichier est lisible
      // Attendre un peu pour que GitHub propage le changement
      await new Promise((r) => setTimeout(r, 500))

      let verified = false
      for (let verifyAttempt = 0; verifyAttempt < 5; verifyAttempt++) {
        try {
          const verifyRes = await fetch(rawUrl, { 
            headers: { 'Cache-Control': 'no-cache, max-age=0' }
          })
          if (verifyRes.ok) {
            const published = await verifyRes.json()
            // Vérifier que c'est bien notre contenu (même révision)
            if (published._rev === revisionNumber) {
              verified = true
              console.info(`✅ Thème publié vérifiée: rev ${revisionNumber}, SHA ${newSha}`)
              return { ok: true, revision: newSha, revisionNumber }
            }
          }
        } catch (e) {
          // Continuer à essayer
        }
        if (verifyAttempt < 4) {
          await new Promise((r) => setTimeout(r, 300 * (verifyAttempt + 1)))
        }
      }

      if (!verified) {
        lastError = `Publication verification failed after ${maxRetries} attempts`
        return { ok: false, error: lastError }
      }

      return { ok: true, revision: newSha, revisionNumber }
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

