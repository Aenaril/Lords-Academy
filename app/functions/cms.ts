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
 * Système de révisions durables :
 * 1. Lire le fichier publié actuel pour obtenir la révision réelle
 * 2. Incrémenter monotoniquement côté serveur
 * 3. Écrire le nouveau contenu avec révision+1
 * 4. Vérifier post-publication que le contenu exact est accessible
 * 5. Rejeter les anciennes révisions même si elles arrivent plus tard
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

  let lastError = ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // ÉTAPE 1 : Lire la révision actuellement publiée (source de vérité)
      let currentRevision = 0
      let currentPublishedContent: any = null
      try {
        const currentContentRes = await fetch(rawUrl, {
          headers: { 'Cache-Control': 'no-cache, max-age=0' },
        })
        if (currentContentRes.ok) {
          currentPublishedContent = await currentContentRes.json()
          currentRevision = currentPublishedContent?._rev || 0
          console.info(
            `📖 Révision publiée actuelle: ${currentRevision} (theme: ${currentPublishedContent?.activeThemeId})`
          )
        }
      } catch (e) {
        console.warn('⚠️ Impossible de lire la révision publiée actuelle (premier déploiement?)')
        currentRevision = 0
      }

      // ÉTAPE 2 : Calculer la nouvelle révision (monotone, côté serveur)
      const newRevision = currentRevision + 1

      // ÉTAPE 3 : Préparer le contenu avec révision
      const wrappedContent = {
        ...content,
        _rev: newRevision,
        _publishedAt: Date.now(),
      }

      // ÉTAPE 4 : Récupérer SHA courant (peut avoir changé depuis lecture)
      const currentRes = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })
      let sha: string | undefined
      if (currentRes.ok) {
        sha = ((await currentRes.json()) as any).sha
      }

      const contentB64 = btoa(
        unescape(encodeURIComponent(JSON.stringify(wrappedContent, null, 2)))
      )

      // ÉTAPE 5 : Écrire sur GitHub
      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Mise à jour ${filename} (CMS) — rev ${newRevision} — ${new Date().toISOString()}`,
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

      // ÉTAPE 6 : Vérifier post-publication (attendre propagation GitHub)
      console.info(
        `📤 Publication écrite sur GitHub: theme=${content.activeThemeId} rev=${newRevision} sha=${newSha}`
      )
      await new Promise((r) => setTimeout(r, 500))

      let verified = false
      let publishedContent: any = null

      for (let verifyAttempt = 0; verifyAttempt < 5; verifyAttempt++) {
        try {
          const verifyRes = await fetch(rawUrl, {
            headers: { 'Cache-Control': 'no-cache, max-age=0' },
          })
          if (verifyRes.ok) {
            publishedContent = await verifyRes.json()

            // Vérification stricte : révision ET thème ET contenu
            if (
              publishedContent._rev === newRevision &&
              publishedContent.activeThemeId === content.activeThemeId
            ) {
              verified = true
              console.info(
                `✅ Publication vérifiée: theme=${publishedContent.activeThemeId} rev=${newRevision}`
              )
              return { ok: true, revision: newSha, revisionNumber: newRevision }
            } else {
              console.warn(
                `⚠️ Vérif. tentative ${verifyAttempt}: rev=${publishedContent._rev} (attendu ${newRevision}), theme=${publishedContent?.activeThemeId}`
              )
            }
          }
        } catch (e) {
          console.warn(`⚠️ Vérif. tentative ${verifyAttempt} échouée: ${(e as any).message}`)
        }

        if (verifyAttempt < 4) {
          await new Promise((r) => setTimeout(r, 300 * (verifyAttempt + 1)))
        }
      }

      if (!verified) {
        lastError = `Publication verification failed: expected rev ${newRevision}, got ${publishedContent?._rev}`
        console.error(lastError)
        // Ne pas retry si vérification échoue (le contenu a changé entre deux publications concurrentes)
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

