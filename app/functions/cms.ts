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
 */
export async function publishCmsConfig(
  env: CmsEnv,
  filename: string,
  content: any
): Promise<{ ok: boolean; revision?: string; error?: string }> {
  const path = `app/public/cms/${filename}`
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-cms-function',
    Accept: 'application/vnd.github+json',
  }

  // Récupérer SHA courant
  const current = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers }).catch(
    () => null
  )
  let sha: string | undefined
  if (current?.ok) {
    sha = ((await current.json()) as any).sha
  }

  const contentB64 = btoa(
    unescape(encodeURIComponent(JSON.stringify(content, null, 2)))
  )
  const res = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Mise à jour ${filename} (CMS) — ${new Date().toISOString()}`,
      content: contentB64,
      branch: env.GITHUB_BRANCH,
      sha,
    }),
  }).catch(() => null)

  if (!res?.ok) {
    return { ok: false, error: `Erreur publication ${filename}` }
  }

  const result = (await res.json()) as any
  return { ok: true, revision: result.content?.sha }
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

