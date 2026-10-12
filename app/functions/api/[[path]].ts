/**
 * Cloudflare Pages Function — Administration R4 sécurisée
 * 
 * Adaptation du Worker existant pour Pages Functions.
 * Gère les routes `/api/*` de l'administration R4 :
 *  - Authentification par mot de passe partagé
 *  - Brouillons privés (KV ou Durable Objects)
 *  - Publication via GitHub (commits)
 *  - Historique et restauration
 * 
 * Secrets requis (Cloudflare Dashboard) :
 *  - ADMIN_PASSWORD
 *  - SESSION_SIGNING_KEY
 *  - GITHUB_TOKEN
 * 
 * Bindings (wrangler.toml) :
 *  - DRAFTS : KV Namespace (par défaut)
 *  - DRAFTS_DO : Durable Objects (optionnel, futur)
 * 
 * Vars (wrangler.toml) :
 *  - ALLOWED_ORIGIN
 *  - GITHUB_REPO
 *  - GITHUB_BRANCH
 *  - STORAGE_BACKEND : "kv" (défaut) ou "do"
 */

import { getStorageBackend } from '../storage'

export const onRequest: PagesFunction = async (context) => {
  const { request, env, params } = context
  const url = new URL(request.url)

  // Récupérer le chemin depuis params (pages/[...path] capture tout après /api/)
  const pathParts = (params.path as string[] | undefined) ?? []
  const path = pathParts.join('/')

  // Reconstruire l'URL pour router
  const pathname = `/api/${path}`

  // CORS strict
  const cors = corsHeaders(request, env as any)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  try {
    const route = `${request.method} ${pathname}`

    let response: Response

    switch (route) {
      case 'POST /api/login':
        response = await handleLogin(request, env as any)
        break
      case 'POST /api/logout':
        response = handleLogout(env as any)
        break
      case 'GET /api/session':
        response = await handleSession(request, env as any)
        break
      case 'GET /api/draft':
        response = await handleGetDraft(request, env as any, url)
        break
      case 'PUT /api/draft':
        response = await handleSaveDraft(request, env as any)
        break
      case 'DELETE /api/draft':
        response = await handleDeleteDraft(request, env as any, url)
        break
      case 'POST /api/publish':
        response = await handlePublish(request, env as any)
        break
      case 'POST /api/upload':
        response = await handleUpload(request, env as any)
        break
      case 'GET /api/published':
        response = await handleGetPublished(request, env as any, url)
        break
      case 'GET /api/history':
        response = await handleHistory(request, env as any, url)
        break
      case 'GET /api/version':
        response = await handleVersion(request, env as any, url)
        break
      case 'POST /api/restore':
        response = await handleRestore(request, env as any)
        break
      case 'POST /api/tutorialCreate':
        response = await handleTutorialCreate(request, env as any)
        break
      case 'GET /api/tutorialIds':
        response = await handleTutorialIds(request, env as any)
        break
      case 'GET /api/tutorials/published':
        response = await handlePublishedTutorials(request, env as any)
        break
      default:
        response = json({ error: 'Not found' }, 404)
    }

    return withCors(response, cors)
  } catch (err) {
    console.error('API error:', err)
    return withCors(json({ error: 'Erreur serveur' }, 500), cors)
  }
}

/* ───────────────────────── Index publié (dynamique) ───────────────────────── */

/**
 * Reconstruit l'index publié en énumérant tous les fichiers tutoriels publiés
 * et en créant index.json. Appelé après chaque publication réussie.
 * 
 * L'index contient une liste de tous les tutoriels publiés avec métadonnées essentielles
 * (id, title, description, category, difficulty, estimatedDuration, coverIcon, status, order).
 */
async function rebuildPublishedIndex(env: any): Promise<void> {
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-pages-function',
    Accept: 'application/vnd.github+json'
  }

  // Récupérer la liste des fichiers dans app/public/content/
  const treeUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/git/trees/${env.GITHUB_BRANCH}?recursive=1`
  const treeRes = await fetch(treeUrl, { headers })
  if (!treeRes.ok) {
    console.warn(`Cannot fetch tree: ${treeRes.status}`)
    return
  }

  const treeData = (await treeRes.json()) as any
  const contentFiles = (treeData.tree ?? []).filter(
    (item: any) => item.path.startsWith('app/public/content/') && item.path.endsWith('.json') && item.path !== 'app/public/content/index.json'
  )

  // Charger et extraire les métadonnées de chaque tutoriel
  const tutorials: any[] = []
  for (const file of contentFiles) {
    try {
      const fileUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${file.path}`
      const fileRes = await fetch(fileUrl)
      if (!fileRes.ok) continue

      const content = await fileRes.json()
      if (content && typeof content.id === 'string') {
        tutorials.push({
          id: content.id,
          title: content.title || 'Sans titre',
          description: content.description || '',
          category: content.category || 'Autre',
          difficulty: content.difficulty || 'medium',
          estimatedDuration: content.estimatedDuration || '10',
          coverIcon: content.coverIcon || '📚',
          status: 'published',
          order: content.order ?? 999
        })
      }
    } catch (err) {
      console.warn(`Erreur lors du traitement du fichier ${file.path}:`, err)
    }
  }

  // Trier par ordre
  tutorials.sort((a, b) => a.order - b.order)

  // Écrire l'index
  const indexPath = 'app/public/content/index.json'
  const indexUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${indexPath}`

  // Récupérer le SHA courant (s'il existe)
  const currentRes = await fetch(`${indexUrl}?ref=${env.GITHUB_BRANCH}`, { headers })
  let currentSha: string | undefined
  if (currentRes.ok) {
    currentSha = ((await currentRes.json()) as any).sha
  }

  const indexContent = btoa(unescape(encodeURIComponent(JSON.stringify({ tutorials }, null, 2))))
  const publishRes = await fetch(indexUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Mise à jour index.json (auto) — ${new Date().toISOString()}`,
      content: indexContent,
      branch: env.GITHUB_BRANCH,
      sha: currentSha
    })
  })

  if (!publishRes.ok) {
    console.error(`Erreur lors de la mise à jour de l'index: ${publishRes.status}`)
  }
}

/* ───────────────────────── Auth & sessions ───────────────────────── */

async function handleLogin(req: Request, env: any): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)

  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const rateKey = `login:${ip}`
  const attempts = Number((await env.RATE.get(rateKey)) ?? '0')
  
  const LOGIN_MAX = 5
  const LOGIN_WINDOW = 15 * 60

  if (attempts >= LOGIN_MAX) {
    return json(
      { ok: false, error: 'Trop de tentatives', retryAfter: LOGIN_WINDOW },
      429,
      { 'Retry-After': String(LOGIN_WINDOW) }
    )
  }

  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = body?.password ?? ''

  // Comparaison à temps constant
  const ok = password.length > 0 && timingSafeEqual(password, env.ADMIN_PASSWORD)
  if (!ok) {
    await env.RATE.put(rateKey, String(attempts + 1), { expirationTtl: LOGIN_WINDOW })
    return json({ ok: false, error: 'Identifiants invalides' }, 401)
  }

  await env.RATE.delete(rateKey)
  const SESSION_TTL = 2 * 60 * 60
  const expiresAt = Date.now() + SESSION_TTL * 1000
  const token = await signSession(expiresAt, env.SESSION_SIGNING_KEY)

  return json(
    { ok: true, session: { authenticated: true, expiresAt } },
    200,
    { 'Set-Cookie': sessionCookie(token, SESSION_TTL) }
  )
}

function handleLogout(_env: any): Response {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

async function handleSession(req: Request, env: any): Promise<Response> {
  const session = await readSession(req, env)
  return json({ authenticated: !!session, expiresAt: session?.expiresAt })
}

/* ───────────────────────── Brouillons (stockage abstrait) ───────────────────────── */

async function handleGetDraft(
  req: Request,
  env: any,
  url: URL
): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  const storage = getStorageBackend(env, tutorialId)
  const draft = await storage.get(tutorialId)

  if (!draft) return json({ content: null })
  return json({
    content: draft.content,
    revision: draft.revision,
    lastEditedLabel: draft.lastEditedLabel,
    updatedAt: draft.updatedAt,
  })
}

async function handleSaveDraft(req: Request, env: any): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as any
  const tutorialId = sanitizeId(body?.tutorialId)
  if (!tutorialId || !validateTutorial(body?.content)) {
    return json({ ok: false, error: 'Données invalides' }, 400)
  }

  const storage = getStorageBackend(env, tutorialId)
  const result = await storage.save(tutorialId, body.content, body.baseRevision)

  if (!result.ok) {
    return json(result, result.conflict ? 409 : 500)
  }

  return json({ ok: true, revision: result.revision })
}

async function handleDeleteDraft(
  req: Request,
  env: any,
  url: URL
): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  const storage = getStorageBackend(env, tutorialId)
  const result = await storage.delete(tutorialId)

  if (!result.ok) {
    return json(result, 500)
  }

  return json({ ok: true })
}

/* ───────────────────────── Publication (GitHub) ───────────────────────── */

async function handlePublish(req: Request, env: any): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as any
  const tutorialId = sanitizeId(body?.tutorialId)
  if (!tutorialId || !validateTutorial(body?.content)) {
    return json({ ok: false, error: 'Données invalides' }, 400)
  }

  const path = `app/public/content/${tutorialId}.json`
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-pages-function',
    Accept: 'application/vnd.github+json'
  }

  // Récupère le sha courant
  const current = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })
  let sha: string | undefined
  if (current.ok) sha = ((await current.json()) as any).sha

  if (body.baseRevision && sha && body.baseRevision !== sha) {
    return json({ ok: false, conflict: { serverRevision: sha } }, 409)
  }

  const contentB64 = btoa(unescape(encodeURIComponent(JSON.stringify(body.content, null, 2))))
  const commit = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Publication tutoriel ${tutorialId} (R4) — ${new Date().toISOString()}`,
      content: contentB64,
      branch: env.GITHUB_BRANCH,
      sha
    })
  })

  if (!commit.ok) return json({ ok: false, error: 'Échec publication' }, 502)
  const result = (await commit.json()) as any
  
  // Après succès : reconstruire l'index publié
  try {
    await rebuildPublishedIndex(env)
  } catch (err) {
    console.error('Erreur lors de la reconstruction de l\'index:', err)
    // Ne pas bloquer la publication si l'index échoue
  }
  
  return json({ ok: true, revision: result.content?.sha })
}

/* ───────────────────────── Upload d'images (GitHub) ───────────────────────── */

async function handleUpload(req: Request, env: any): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const formData = await req.formData().catch(() => null)
  if (!formData) return json({ ok: false, error: 'FormData invalide' }, 400)

  const file = formData.get('file') as File | null
  if (!file) return json({ ok: false, error: 'Fichier manquant' }, 400)

  // Vérifier le type MIME
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return json({ ok: false, error: 'Type d\'image non supporté' }, 400)
  }

  // Vérifier la taille (3 Mo max)
  const maxSize = 3 * 1024 * 1024
  if (file.size > maxSize) {
    return json({ ok: false, error: 'Fichier trop volumineux' }, 400)
  }

  const bytes = await file.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)))
  const ext = file.name.split('.').pop() || 'png'
  const filename = `image-${Date.now()}.${ext}`
  const path = `app/public/images/${filename}`

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-pages-function',
    Accept: 'application/vnd.github+json'
  }

  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`
  const commitRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Upload image ${filename} (R4) — ${new Date().toISOString()}`,
      content: base64,
      branch: env.GITHUB_BRANCH
    })
  })

  if (!commitRes.ok) {
    return json({ ok: false, error: 'Échec upload' }, 502)
  }

  // Retourner l'URL publique de l'image
  const imageUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${path}`
  return json({ ok: true, url: imageUrl })
}

/* ───────────────────────── Contenu publié (GitHub) ───────────────────────── */

async function handleGetPublished(
  req: Request,
  env: any,
  url: URL
): Promise<Response> {
  // Route publique : pas d'authentification requise
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  const path = contentPath(tutorialId)
  
  // Headers stricts pour empêcher la mise en cache du contenu obsolète
  const cacheHeaders = {
    'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }

  try {
    // Étape 1 : Obtenir le SHA courant du fichier via l'API GitHub (authentifiée)
    // Cela force Cloudflare à revalider auprès de GitHub
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`
    const apiRes = await fetch(apiUrl, {
      headers: ghHeaders(env),
      // Force la revalidation à chaque fois
      cache: 'no-store'
    })

    let sha: string | undefined
    if (apiRes.ok) {
      const data = (await apiRes.json()) as any
      sha = data.sha
    }

    // Étape 2 : Récupérer le contenu publié
    // Utiliser le SHA comme cache-bust pour éviter le cache Cloudflare
    let rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${path}`
    if (sha) {
      // Ajouter le SHA en paramètre pour garantir une URL unique par version
      rawUrl += `?v=${sha}`
    } else {
      // Fallback : utiliser un timestamp si le SHA n'est pas disponible
      rawUrl += `?t=${Date.now()}`
    }

    const res = await fetch(rawUrl, { cache: 'no-store' })

    if (!res.ok) {
      // Pas de contenu publié
      return json({ content: null }, 200, cacheHeaders)
    }

    let content: unknown = null
    try {
      content = await res.json()
    } catch {
      content = null
    }

    return json({ content, revision: sha || 'published' }, 200, cacheHeaders)
  } catch (err) {
    // Erreur lors de la récupération : retourner null au lieu de servir une ancienne version
    console.error('Error fetching published content:', err)
    return json({ content: null }, 200, cacheHeaders)
  }
}

/* ───────────────────────── Historique & restauration (GitHub) ───────────────────────── */

function contentPath(tutorialId: string): string {
  return `app/public/content/${tutorialId}.json`
}

function ghHeaders(env: any) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-pages-function',
    Accept: 'application/vnd.github+json'
  }
}

async function handleHistory(
  req: Request,
  env: any,
  url: URL
): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  const path = contentPath(tutorialId)

  // En-têtes stricts : l'historique ne doit jamais être servi depuis un cache
  // obsolète (même stratégie que /api/published).
  const cacheHeaders = {
    'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }

  // Pagination : l'API GitHub /commits plafonne à 100 résultats par page.
  // On parcourt les pages pour récupérer TOUTES les publications du fichier,
  // pas seulement les 30 plus récentes. Borne de sécurité pour éviter une
  // boucle infinie (20 pages × 100 = 2000 publications max).
  const PER_PAGE = 100
  const MAX_PAGES = 20
  const collected: any[] = []

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      // URL de base vers l'API GitHub pour les commits du fichier.
      // Le paramètre `t` (timestamp) force GitHub à ignorer son cache interne
      // pour cette requête, garantissant une liste complète et fraîche des commits.
      // Stratégie identique à celle appliquée avec succès à /api/published.
      const baseApi = `https://api.github.com/repos/${env.GITHUB_REPO}/commits?path=${encodeURIComponent(path)}&sha=${env.GITHUB_BRANCH}&per_page=${PER_PAGE}&page=${page}`
      const api = `${baseApi}&t=${Date.now()}`
      
      // cache: 'no-store' → force récupération fraîche auprès de GitHub,
      // sans passer par un éventuel cache Cloudflare.
      const res = await fetch(api, { headers: ghHeaders(env), cache: 'no-store' })
      if (!res.ok) {
        // Si la première page échoue, l'historique est réellement indisponible.
        if (page === 1) {
          console.error(`GitHub /commits API error for ${path}:`, res.status, res.statusText)
          return json({ error: 'Historique indisponible (erreur GitHub)' }, 502, cacheHeaders)
        }
        // Sinon, on s'arrête et on renvoie ce qui a déjà été collecté.
        break
      }

      const batch = (await res.json()) as any[]
      if (!Array.isArray(batch) || batch.length === 0) break
      collected.push(...batch)

      // Dernière page atteinte (lot incomplet).
      if (batch.length < PER_PAGE) break
    }
  } catch (err) {
    console.error('Error fetching history for', path, ':', err)
    if (collected.length === 0) {
      return json({ error: 'Historique indisponible (erreur réseau)' }, 502, cacheHeaders)
    }
    // Si on a au moins un lot, on le renvoie avec un avertissement console.
    console.warn('Incomplete history retrieved for', path, '— returning', collected.length, 'commits')
  }

  const entries = collected
    .map((c) => ({
      revision: c.sha as string,
      date: (c.commit?.committer?.date ?? c.commit?.author?.date ?? '') as string,
      message: (c.commit?.message ?? '') as string,
      authorLabel: 'R4'
    }))
    // Tri chronologique explicite : des plus récentes aux plus anciennes.
    // (L'API GitHub renvoie déjà cet ordre, mais on le garantit ici.)
    .sort((a, b) => {
      const ta = Date.parse(a.date) || 0
      const tb = Date.parse(b.date) || 0
      return tb - ta
    })

  return json({ tutorialId, entries }, 200, cacheHeaders)
}

async function handleVersion(
  req: Request,
  env: any,
  url: URL
): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  const revision = (url.searchParams.get('revision') ?? '').replace(/[^a-f0-9]/gi, '')
  if (!tutorialId || !revision) return json({ error: 'Paramètres invalides' }, 400)

  const path = contentPath(tutorialId)
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${revision}`
  const res = await fetch(api, { headers: ghHeaders(env) })
  if (!res.ok) return json({ error: 'Version introuvable' }, 404)

  const data = (await res.json()) as any
  let content: unknown = null
  try {
    const decoded = decodeURIComponent(escape(atob((data.content ?? '').replace(/\n/g, ''))))
    content = JSON.parse(decoded)
  } catch {
    content = null
  }
  return json({ revision, content })
}

async function handleRestore(req: Request, env: any): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as any
  const tutorialId = sanitizeId(body?.tutorialId)
  const revision = (body?.revision ?? '').replace(/[^a-f0-9]/gi, '')
  if (!tutorialId || !revision) return json({ ok: false, error: 'Paramètres invalides' }, 400)

  const path = contentPath(tutorialId)
  const oldRes = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${revision}`,
    { headers: ghHeaders(env) }
  )
  if (!oldRes.ok) return json({ ok: false, error: 'Version introuvable' }, 404)
  const oldData = (await oldRes.json()) as any

  let parsed: any = null
  try {
    parsed = JSON.parse(decodeURIComponent(escape(atob((oldData.content ?? '').replace(/\n/g, '')))))
  } catch {
    return json({ ok: false, error: 'Contenu de version illisible' }, 422)
  }
  if (!validateTutorial(parsed)) {
    return json({ ok: false, error: 'Version invalide (structure)' }, 422)
  }

  const headRes = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: ghHeaders(env) }
  )
  const currentSha = headRes.ok ? ((await headRes.json()) as any).sha : undefined

  const commit = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: ghHeaders(env),
      body: JSON.stringify({
        message: `Restauration tutoriel ${tutorialId} depuis ${revision.slice(0, 7)} (R4) — ${new Date().toISOString()}`,
        content: oldData.content,
        branch: env.GITHUB_BRANCH,
        sha: currentSha
      })
    }
  )
  if (!commit.ok) return json({ ok: false, error: 'Échec restauration' }, 502)
  const result = (await commit.json()) as any
  return json({ ok: true, revision: result.content?.sha })
}

/* ───────────────────────── Création de tutoriels (dynamique) ───────────────────────── */

/**
 * Génère un ID unique à partir d'un titre.
 * - Slugifié (lowercase, accents supprimés, caractères spéciaux → tirets)
 * - Collision : ajout timestamp en fallback
 */
function generateTutorialId(title: string, existingIds: string[]): string {
  const base = title
    .toLowerCase()
    // Accents
    .replace(/[éèê]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[ùû]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/[îï]/g, 'i')
    .replace(/[ç]/g, 'c')
    // Caractères spéciaux → tirets
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)

  // Pas de collision
  if (!existingIds.includes(base)) {
    return base
  }

  // Collision : ajouter timestamp (36-base pour compacité)
  const ts = Date.now().toString(36)
  return `${base}-${ts}`.slice(0, 48)
}

/**
 * Crée un nouveau tutoriel vierge.
 * 
 * Workflow :
 * 1. Valide title (non-vide) et category (libre)
 * 2. Charge liste IDs existants
 * 3. Génère ID unique
 * 4. Crée objet tutoriel vierge (métadonnées + sections: [])
 * 5. Enregistre premier brouillon (PUT draft:${id} KV)
 * 6. Ajoute ID à private:adminTutorialIds (atomique)
 * 7. Retourne tutorialId + contenu initial
 */
async function handleTutorialCreate(req: Request, env: any): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as any
  const title = (body?.title ?? '').trim()
  const category = (body?.category ?? '').trim()

  if (!title || !category) {
    return json({ ok: false, error: 'Titre et catégorie requis' }, 400)
  }

  if (title.length > 100) {
    return json({ ok: false, error: 'Titre trop long (max 100 caractères)' }, 400)
  }

  try {
    // Charger IDs existants
    const indexKey = 'private:adminTutorialIds'
    const indexRaw = await env.DRAFTS.get(indexKey)
    const indexData = indexRaw ? JSON.parse(indexRaw) : { tutorialIds: [], metadata: {} }
    const existingIds = indexData.tutorialIds || []

    // Générer ID unique
    const tutorialId = generateTutorialId(title, existingIds)

    // Créer objet tutoriel vierge
    const newTutorial = {
      id: tutorialId,
      title: title,
      description: '',
      category: category,
      difficulty: 'easy' as const,
      estimatedDuration: '10',
      coverIcon: '📚',
      order: 999,
      status: 'draft' as const,
      sections: []
    }

    // Enregistrer premier brouillon
    const draftKey = `draft:${tutorialId}`
    const draftData = {
      content: newTutorial,
      revision: crypto.getRandomValues(new Uint8Array(16)).toString(),
      updatedAt: Date.now(),
      lastEditedLabel: 'Créé'
    }
    await env.DRAFTS.put(draftKey, JSON.stringify(draftData))

    // Ajouter à l'index privé (atomique)
    if (!indexData.tutorialIds.includes(tutorialId)) {
      indexData.tutorialIds.push(tutorialId)
      indexData.metadata = indexData.metadata || {}
      indexData.metadata[tutorialId] = {
        createdAt: new Date().toISOString(),
        title: title,
        adminEmail: null
      }
      await env.DRAFTS.put(indexKey, JSON.stringify(indexData))
    }

    return json({
      ok: true,
      tutorialId: tutorialId,
      tutorial: newTutorial
    })
  } catch (err) {
    console.error('Error creating tutorial:', err)
    return json({ ok: false, error: 'Erreur serveur lors de la création' }, 500)
  }
}

/**
 * Énumère tous les IDs administrables (brouillons + publiés).
 * 
 * Retourne la liste des tutoriels que l'admin peut éditer/créer.
 */
async function handleTutorialIds(req: Request, env: any): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  try {
    const indexKey = 'private:adminTutorialIds'
    const indexRaw = await env.DRAFTS.get(indexKey)
    const indexData = indexRaw ? JSON.parse(indexRaw) : { tutorialIds: ['dragon-arena'], metadata: {} }

    return json({
      ok: true,
      tutorialIds: indexData.tutorialIds || ['dragon-arena']
    })
  } catch (err) {
    console.error('Error fetching tutorial IDs:', err)
    return json({ ok: false, error: 'Erreur serveur' }, 500)
  }
}

/**
 * Énumère tous les tutoriels publiés (endpoint public).
 * 
 * Construit la liste en consulant index.json (mis à jour après chaque publication).
 * Cache : 5 min CDN + revalidation sur chaque accès.
 */
async function handlePublishedTutorials(req: Request, env: any): Promise<Response> {
  // Route publique : pas d'authentification requise
  
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'Pragma': 'public'
  }

  try {
    // Récupérer l'index publié depuis GitHub
    const indexPath = 'app/public/content/index.json'
    const indexUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${indexPath}`
    
    const indexRes = await fetch(indexUrl, { cache: 'no-store' })
    
    if (!indexRes.ok) {
      // Index non disponible : retourner liste vide ou fallback
      console.warn(`Index publié indisponible: ${indexRes.status}`)
      return json({ tutorials: [] }, 200, cacheHeaders)
    }

    const indexData = await indexRes.json()
    const tutorials = indexData.tutorials || []

    return json({ tutorials }, 200, cacheHeaders)
  } catch (err) {
    console.error('Error fetching published tutorials:', err)
    // En cas d'erreur, retourner liste vide (pas d'erreur 500)
    return json({ tutorials: [] }, 200, cacheHeaders)
  }
}

/* ───────────────────────── Helpers CORS ───────────────────────── */

function corsHeaders(req: Request, env: any): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow = origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With',
    Vary: 'Origin'
  }
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(cors)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

function originAllowed(req: Request, env: any): boolean {
  const origin = req.headers.get('Origin')
  return !origin || origin === env.ALLOWED_ORIGIN
}

function csrfOk(req: Request): boolean {
  return req.headers.get('X-Requested-With') === 'lma-admin'
}

function sessionCookie(token: string, ttl: number): string {
  const parts = [
    `lma_session=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict'
  ]
  parts.push(ttl > 0 ? `Max-Age=${ttl}` : 'Max-Age=0')
  return parts.join('; ')
}

async function signSession(expiresAt: number, key: string): Promise<string> {
  const payload = `${expiresAt}`
  const sig = await hmac(payload, key)
  return `${btoa(payload)}.${sig}`
}

async function readSession(req: Request, env: any): Promise<{ expiresAt: number } | null> {
  const cookie = req.headers.get('Cookie') ?? ''
  const match = cookie.match(/lma_session=([^;]+)/)
  if (!match) return null
  const [payloadB64, sig] = match[1].split('.')
  if (!payloadB64 || !sig) return null
  const payload = atob(payloadB64)
  const expected = await hmac(payload, env.SESSION_SIGNING_KEY)
  if (!timingSafeEqual(sig, expected)) return null
  const expiresAt = Number(payload)
  if (!expiresAt || Date.now() > expiresAt) return null
  return { expiresAt }
}

async function hmac(data: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function sanitizeId(id: string | null | undefined): string | null {
  if (!id) return null
  return /^[a-z0-9-]{1,64}$/.test(id) ? id : null
}

function validateTutorial(content: any): boolean {
  if (!content || typeof content !== 'object') return false
  if (typeof content.id !== 'string') return false
  if (!Array.isArray(content.sections)) return false
  return content.sections.every(
    (s: any) => s && typeof s.title === 'string' && typeof s.sourceSlide === 'number'
  )
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  })
}
