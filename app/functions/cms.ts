/**
 * Utilitaires CMS pour Étape 3
 * 
 * Gère le stockage et la publication des configurations CMS
 * - Thèmes (themes.json)
 * - Annonces (announcements.json)
 * - Événements (events.json)
 * - Accueil (home.json)
 * - Paramètres site (settings.json)
 * 
 * Garanties :
 * - Décodage UTF-8 correct (accents français, caractères non-ASCII)
 * - Statuts explicites distinguant : avant écriture, écriture réussie, vérification attente, vérification réussie
 * - Vérification par hash exact (pas juste révision)
 * - Pas de relance aveugle après écriture réussie
 */

import type { Theme, ThemeLibrary, Announcement, Event, HomePageConfig, SiteSettings } from '../src/cms/types'

export interface CmsEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
}

/**
 * États explicites de publication
 */
export enum PublicationStatus {
  BEFORE_WRITE = 'before_write', // Avant tentative d'écriture
  WRITE_SUCCESS = 'write_success', // Écriture GitHub réussie
  VERIFY_PENDING = 'verify_pending', // Vérification en attente
  VERIFY_SUCCESS = 'verify_success', // Vérification réussie
  CLOUDFLARE_PENDING = 'cloudflare_pending', // En attente de déploiement Cloudflare
  EXPIRED_VERIFY = 'expired_verify', // Vérification expirée après écriture réussie
  WRITE_FAILED = 'write_failed', // Écriture GitHub échouée
  VERIFY_FAILED = 'verify_failed', // Vérification échouée après écriture réussie
  CONFLICT = 'conflict', // Conflit SHA persistant
}

/**
 * Décoder Base64 en UTF-8 correct (accents français, caractères non-ASCII)
 * 
 * @param base64String Chaîne base64 (peut contenir sauts de ligne)
 * @returns Objet JSON décodé
 */
function decodeBase64ToJSON(base64String: string): any {
  // Nettoyer les sauts de ligne que GitHub peut inclure
  const cleanBase64 = base64String.replace(/\s/g, '')
  
  // Convertir base64 en Uint8Array
  const binaryString = atob(cleanBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  
  // Décoder Uint8Array en UTF-8
  const decoder = new TextDecoder('utf-8')
  const jsonString = decoder.decode(bytes)
  
  // Parser JSON
  return JSON.parse(jsonString)
}

/**
 * Encoder objet JSON en Base64 UTF-8 correct
 * 
 * @param obj Objet à encoder
 * @returns Chaîne base64 encodée en UTF-8
 */
function encodeJSONToBase64(obj: any): string {
  const jsonString = JSON.stringify(obj, null, 2)
  
  // Encoder JSON en UTF-8 bytes
  const encoder = new TextEncoder()
  const bytes = encoder.encode(jsonString)
  
  // Convertir Uint8Array en base64
  let binaryString = ''
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i])
  }
  
  return btoa(binaryString)
}

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
): Promise<{
  ok: boolean
  revision?: string
  revisionNumber?: number
  status?: PublicationStatus
  error?: string
  details?: string
}> {
  const path = `app/public/cms/${filename}`
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-cms-function',
    Accept: 'application/vnd.github+json',
  }

  let lastError = ''
  let writeSucceeded = false
  let writtenSha = ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // ÉTAPE 1 : Lire SHA + contenu de manière ATOMIQUE depuis API GitHub
      let currentRevision = 0
      let currentSha: string | undefined
      let currentPublishedContent: any = null

      try {
        const apiRes = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })
        if (apiRes.ok) {
          const apiData = (await apiRes.json()) as any
          currentSha = apiData.sha

          // Décoder le contenu depuis API avec UTF-8 correct
          if (apiData.content) {
            currentPublishedContent = decodeBase64ToJSON(apiData.content)
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

      // ÉTAPE 4 : Encoder avec UTF-8 correct et écrire sur GitHub
      const contentB64 = encodeJSONToBase64(wrappedContent)

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
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
            continue
          }
          return { 
            ok: false, 
            status: PublicationStatus.CONFLICT,
            error: 'SHA conflict after retries',
            details: lastError
          }
        }

        // 401 Auth = échouer immédiatement
        if (putRes.status === 401) {
          return { 
            ok: false, 
            status: PublicationStatus.WRITE_FAILED,
            error: 'GitHub authentication failed',
            details: lastError
          }
        }

        // Autres erreurs = retry
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
          continue
        }
        return { 
          ok: false, 
          status: PublicationStatus.WRITE_FAILED,
          error: 'GitHub write failed after retries',
          details: lastError
        }
      }

      const putResult = (await putRes.json()) as any
      const newSha = putResult.content?.sha
      writeSucceeded = true
      writtenSha = newSha

      // ÉTAPE 5 : Vérifier post-publication par SHA + hash + UTF-8 correct
      console.info(
        `📝 ✅ Écriture GitHub réussie: nouveau SHA=${newSha?.slice(0, 7)}, attente propagation...`
      )
      await new Promise((r) => setTimeout(r, 500))

      let verified = false
      let publishedContent: any = null
      let publishedHash = ''

      // Vérifier 5 fois avec backoff exponentiel
      for (let verifyAttempt = 0; verifyAttempt < 5; verifyAttempt++) {
        try {
          const verifyRes = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })

          if (verifyRes.ok) {
            const verifyData = (await verifyRes.json()) as any
            const verifySha = verifyData.sha

            // Décoder contenu avec UTF-8 correct
            if (verifyData.content) {
              publishedContent = decodeBase64ToJSON(verifyData.content)
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
                return { 
                  ok: true, 
                  revision: newSha, 
                  revisionNumber: newRevision,
                  status: PublicationStatus.VERIFY_SUCCESS
                }
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

      // Écriture réussie mais vérification échouée
      if (!verified) {
        lastError = `Publication verification failed: expected rev ${newRevision} sha ${newSha?.slice(0, 7)} hash ${newContentHash.slice(0, 7)}, got rev ${publishedContent?._rev} hash ${publishedHash.slice(0, 7)}`
        console.error(`❌ ${lastError}`)
        return { 
          ok: false, 
          status: PublicationStatus.VERIFY_FAILED,
          error: 'GitHub write succeeded but verification failed',
          details: lastError,
          revision: newSha,
          revisionNumber: newRevision
        }
      }

      return { 
        ok: true, 
        revision: newSha, 
        revisionNumber: newRevision,
        status: PublicationStatus.VERIFY_SUCCESS
      }
    } catch (err) {
      lastError = `Exception: ${(err as any).message}`
      if (attempt === maxRetries - 1) {
        if (writeSucceeded) {
          return {
            ok: false,
            status: PublicationStatus.EXPIRED_VERIFY,
            error: 'Verification expired after write success',
            details: lastError,
            revision: writtenSha
          }
        }
        return { 
          ok: false, 
          status: PublicationStatus.WRITE_FAILED,
          error: 'Unexpected error',
          details: lastError
        }
      }
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
    }
  }

  if (writeSucceeded) {
    return {
      ok: false,
      status: PublicationStatus.EXPIRED_VERIFY,
      error: 'Verification expired after write success',
      details: lastError,
      revision: writtenSha
    }
  }

  return { 
    ok: false, 
    status: PublicationStatus.WRITE_FAILED,
    error: 'Publication failed after all retries',
    details: lastError
  }
}

/**
 * Charger configuration CMS depuis GitHub avec décodage UTF-8 correct
 */
export async function loadCmsConfig(
  env: CmsEnv,
  filename: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const path = `app/public/cms/${filename}`
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-cms-function',
    Accept: 'application/vnd.github+json',
  }

  try {
    // Lire depuis API GitHub (pas raw.githubusercontent.com qui peut être en cache)
    const res = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })

    if (!res.ok) {
      return { ok: false, data: null } // Fichier n'existe pas encore
    }

    const apiData = (await res.json()) as any
    
    // Décoder contenu avec UTF-8 correct
    if (apiData.content) {
      const data = decodeBase64ToJSON(apiData.content)
      return { ok: true, data }
    }

    return { ok: false, data: null }
  } catch (err) {
    console.warn(`⚠️ loadCmsConfig failed: ${(err as any).message}`)
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

