/**
 * Cloudflare Worker — Administration R4 sécurisée de Lords Mobile Academy.
 *
 * ⚠️ NON DÉPLOYÉ. Ce code est prêt mais aucune ressource Cloudflare n'est
 * créée à ce stade. Il sera déployé après configuration guidée des services.
 *
 * Responsabilités (toutes côté serveur, jamais dans le navigateur) :
 *  - Authentification par mot de passe partagé (secret du Worker).
 *  - Émission d'une session via cookie HttpOnly + Secure + SameSite=Strict.
 *  - Limitation des tentatives de connexion (anti-bruteforce) via KV.
 *  - Vérification d'origine + en-tête anti-CSRF sur chaque écriture.
 *  - Stockage des brouillons (KV, privés) et publication (commit GitHub).
 *  - Upload d'images vers R2 avec validation stricte.
 *
 * Secrets attendus (configurés via `wrangler secret put`, jamais commités) :
 *  - ADMIN_PASSWORD        : mot de passe partagé des R4
 *  - SESSION_SIGNING_KEY   : clé HMAC pour signer les sessions
 *  - GITHUB_TOKEN          : token fine-grained, scope minimal (contenu du repo)
 *
 * Bindings attendus (wrangler.toml) :
 *  - DRAFTS  : KV Namespace (brouillons privés)
 *  - RATE    : KV Namespace (compteurs de tentatives)
 *  - MEDIA   : R2 Bucket (images publiques)
 *
 * Variables (vars) :
 *  - ALLOWED_ORIGIN : origine autorisée (ex. https://user.github.io)
 *  - GITHUB_REPO    : "owner/repo"
 *  - GITHUB_BRANCH  : branche de publication (ex. main)
 */

export interface Env {
  ADMIN_PASSWORD: string
  SESSION_SIGNING_KEY: string
  GITHUB_TOKEN: string
  DRAFTS: KVNamespace
  RATE: KVNamespace
  MEDIA: R2Bucket
  ALLOWED_ORIGIN: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
}

const SESSION_TTL = 2 * 60 * 60 // 2 h
const LOGIN_MAX = 5
const LOGIN_WINDOW = 15 * 60 // 15 min
const MAX_UPLOAD = 3 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    // CORS strict : une seule origine autorisée, credentials permis.
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'POST /api/login':
          return withCors(await handleLogin(req, env), cors)
        case 'POST /api/logout':
          return withCors(handleLogout(env), cors)
        case 'GET /api/session':
          return withCors(await handleSession(req, env), cors)
        case 'GET /api/draft':
          return withCors(await handleGetDraft(req, env, url), cors)
        case 'GET /api/published':
          return withCors(await handleGetPublished(req, env, url), cors)
        case 'PUT /api/draft':
          return withCors(await handleSaveDraft(req, env), cors)
        case 'POST /api/publish':
          return withCors(await handlePublish(req, env), cors)
        case 'POST /api/upload':
          return withCors(await handleUpload(req, env), cors)
        case 'GET /api/history':
          return withCors(await handleHistory(req, env, url), cors)
        case 'GET /api/version':
          return withCors(await handleVersion(req, env, url), cors)
        case 'POST /api/restore':
          return withCors(await handleRestore(req, env), cors)
        default:
          return withCors(json({ error: 'Not found' }, 404), cors)
      }
    } catch (err) {
      return withCors(json({ error: 'Erreur serveur' }, 500), cors)
    }
  }
}

/* ───────────────────────── Auth & sessions ───────────────────────── */

async function handleLogin(req: Request, env: Env): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)

  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const rateKey = `login:${ip}`
  const attempts = Number((await env.RATE.get(rateKey)) ?? '0')
  if (attempts >= LOGIN_MAX) {
    return json({ ok: false, error: 'Trop de tentatives', retryAfter: LOGIN_WINDOW }, 429, {
      'Retry-After': String(LOGIN_WINDOW)
    })
  }

  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = body?.password ?? ''

  // Comparaison à temps constant.
  const ok = password.length > 0 && timingSafeEqual(password, env.ADMIN_PASSWORD)
  if (!ok) {
    await env.RATE.put(rateKey, String(attempts + 1), { expirationTtl: LOGIN_WINDOW })
    // Message générique : ne distingue pas la cause.
    return json({ ok: false, error: 'Identifiants invalides' }, 401)
  }

  await env.RATE.delete(rateKey)
  const expiresAt = Date.now() + SESSION_TTL * 1000
  const token = await signSession(expiresAt, env.SESSION_SIGNING_KEY)

  return json(
    { ok: true, session: { authenticated: true, expiresAt } },
    200,
    { 'Set-Cookie': sessionCookie(token, SESSION_TTL) }
  )
}

function handleLogout(_env: Env): Response {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

async function handleSession(req: Request, env: Env): Promise<Response> {
  const session = await readSession(req, env)
  return json({ authenticated: !!session, expiresAt: session?.expiresAt })
}

/* ───────────────────────── Brouillons (KV privé) ───────────────────────── */

async function handleGetDraft(req: Request, env: Env, url: URL): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  const raw = await env.DRAFTS.get(`draft:${tutorialId}`)
  if (!raw) return json({ content: null })
  const parsed = JSON.parse(raw)
  return json({
    content: parsed.content,
    revision: parsed.revision,
    lastEditedLabel: parsed.lastEditedLabel,
    updatedAt: parsed.updatedAt
  })
}

/**
 * Récupère le contenu publié d'un tutoriel (accessible sans authentification).
 * Lit depuis GitHub raw.githubusercontent.com.
 * Ajoute les en-têtes Cache-Control pour garantir une vérification réseau fraîche.
 */
async function handleGetPublished(req: Request, env: Env, url: URL): Promise<Response> {
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  // Lire depuis GitHub raw (contenu publié)
  const ghUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/app/public/content/${tutorialId}.json`
  
  try {
    const res = await fetch(ghUrl)
    if (!res.ok) {
      return json({ content: null }, 200, {
        'Cache-Control': 'no-cache, max-age=0, must-revalidate'
      })
    }

    const text = await res.text()
    let content: unknown = null
    try {
      content = JSON.parse(text)
    } catch {
      // JSON invalide → retourner null
      content = null
    }

    // Réponse avec headers de cache strict pour contenu public
    return json(
      { content, revision: res.headers.get('ETag') ?? undefined },
      200,
      {
        // Headers critiques pour éviter la mise en cache du contenu obsolète
        'Cache-Control': 'no-cache, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    )
  } catch (err) {
    // Erreur réseau → retourner null
    return json({ content: null }, 200, {
      'Cache-Control': 'no-cache, max-age=0, must-revalidate'
    })
  }
}

async function handleSaveDraft(req: Request, env: Env): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as any
  const tutorialId = sanitizeId(body?.tutorialId)
  if (!tutorialId || !validateTutorial(body?.content)) {
    return json({ ok: false, error: 'Données invalides' }, 400)
  }

  const revision = crypto.randomUUID()
  await env.DRAFTS.put(
    `draft:${tutorialId}`,
    JSON.stringify({
      content: body.content,
      revision,
      updatedAt: Date.now(),
      lastEditedLabel: 'R4'
    })
  )
  return json({ ok: true, revision })
}

/* ───────────────────────── Publication (GitHub) ───────────────────────── */

async function handlePublish(req: Request, env: Env): Promise<Response> {
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
    'User-Agent': 'lma-worker',
    Accept: 'application/vnd.github+json'
  }

  // Récupère le sha courant (optimistic concurrency).
  const current = await fetch(`${apiBase}?ref=${env.GITHUB_BRANCH}`, { headers })
  let sha: string | undefined
  if (current.ok) sha = ((await current.json()) as any).sha

  // Conflit si le client travaillait sur une base différente.
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
  return json({ ok: true, revision: result.content?.sha })
}

/* ───────────────────────── Historique & restauration (GitHub) ─────────────────────────
 *
 * On s'appuie exclusivement sur l'historique natif de GitHub (commits), sans
 * base de données ni stockage supplémentaire :
 *  - /api/history : liste les commits touchant le fichier du tutoriel.
 *  - /api/version : lit le contenu du fichier à un commit donné.
 *  - /api/restore : réécrit le contenu d'une ancienne version → NOUVEAU commit,
 *    sans jamais effacer l'historique précédent.
 */

function contentPath(tutorialId: string): string {
  return `app/public/content/${tutorialId}.json`
}

function ghHeaders(env: Env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'lma-worker',
    Accept: 'application/vnd.github+json'
  }
}

async function handleHistory(req: Request, env: Env, url: URL): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  if (!tutorialId) return json({ error: 'tutorialId invalide' }, 400)

  const path = contentPath(tutorialId)
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/commits?path=${encodeURIComponent(path)}&sha=${env.GITHUB_BRANCH}&per_page=30`
  const res = await fetch(api, { headers: ghHeaders(env) })
  if (!res.ok) return json({ error: 'Historique indisponible' }, 502)

  const commits = (await res.json()) as any[]
  const entries = commits.map((c) => ({
    revision: c.sha,
    date: c.commit?.committer?.date ?? c.commit?.author?.date ?? '',
    message: c.commit?.message ?? '',
    authorLabel: 'R4'
  }))
  return json({ tutorialId, entries })
}

async function handleVersion(req: Request, env: Env, url: URL): Promise<Response> {
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)
  const tutorialId = sanitizeId(url.searchParams.get('tutorialId'))
  const revision = (url.searchParams.get('revision') ?? '').replace(/[^a-f0-9]/gi, '')
  if (!tutorialId || !revision) return json({ error: 'Paramètres invalides' }, 400)

  // Lecture du fichier au commit donné (le ref peut être un SHA).
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

async function handleRestore(req: Request, env: Env): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as any
  const tutorialId = sanitizeId(body?.tutorialId)
  const revision = (body?.revision ?? '').replace(/[^a-f0-9]/gi, '')
  if (!tutorialId || !revision) return json({ ok: false, error: 'Paramètres invalides' }, 400)

  const path = contentPath(tutorialId)
  // 1) Lire le contenu de la version à restaurer.
  const oldRes = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${revision}`,
    { headers: ghHeaders(env) }
  )
  if (!oldRes.ok) return json({ ok: false, error: 'Version introuvable' }, 404)
  const oldData = (await oldRes.json()) as any

  // Valider que le contenu restauré est bien structuré (traçabilité préservée).
  let parsed: any = null
  try {
    parsed = JSON.parse(decodeURIComponent(escape(atob((oldData.content ?? '').replace(/\n/g, '')))))
  } catch {
    return json({ ok: false, error: 'Contenu de version illisible' }, 422)
  }
  if (!validateTutorial(parsed)) {
    return json({ ok: false, error: 'Version invalide (structure)' }, 422)
  }

  // 2) Récupérer le sha courant du fichier (HEAD) pour écrire par-dessus.
  const headRes = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    { headers: ghHeaders(env) }
  )
  const currentSha = headRes.ok ? ((await headRes.json()) as any).sha : undefined

  // 3) Nouveau commit explicite de restauration (l'historique précédent reste intact).
  const commit = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: ghHeaders(env),
      body: JSON.stringify({
        message: `Restauration tutoriel ${tutorialId} depuis ${revision.slice(0, 7)} (R4) — ${new Date().toISOString()}`,
        content: oldData.content, // on réécrit tel quel (images + cadrage conservés)
        branch: env.GITHUB_BRANCH,
        sha: currentSha
      })
    }
  )
  if (!commit.ok) return json({ ok: false, error: 'Échec restauration' }, 502)
  const result = (await commit.json()) as any
  return json({ ok: true, revision: result.content?.sha })
}

/* ───────────────────────── Upload (R2) ───────────────────────── */

async function handleUpload(req: Request, env: Env): Promise<Response> {
  if (!originAllowed(req, env)) return json({ error: 'Origine refusée' }, 403)
  if (!csrfOk(req)) return json({ error: 'CSRF' }, 403)
  if (!(await readSession(req, env))) return json({ error: 'Non authentifié' }, 401)

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return json({ ok: false, error: 'Fichier manquant' }, 400)
  if (file.size > MAX_UPLOAD) return json({ ok: false, error: 'Fichier trop lourd' }, 413)
  if (!ALLOWED_TYPES.includes(file.type)) return json({ ok: false, error: 'Type non autorisé' }, 415)

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const key = `content/uploads/${crypto.randomUUID()}.${ext}`
  await env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type }
  })

  // L'URL publique dépend de la config R2 (domaine public ou route Worker).
  const url = `/${key}`
  return json({ ok: true, url })
}

/* ───────────────────────── Helpers sécurité ───────────────────────── */

function corsHeaders(req: Request, env: Env): Record<string, string> {
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

function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('Origin')
  return !origin || origin === env.ALLOWED_ORIGIN
}

function csrfOk(req: Request): boolean {
  // En plus de SameSite=Strict, on exige l'en-tête custom (non envoyable
  // en cross-site par un formulaire HTML classique).
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

async function readSession(req: Request, env: Env): Promise<{ expiresAt: number } | null> {
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

/** Validation minimale de structure (le Worker ne fait jamais confiance au client). */
function validateTutorial(content: any): boolean {
  if (!content || typeof content !== 'object') return false
  if (typeof content.id !== 'string') return false
  if (!Array.isArray(content.sections)) return false
  // La traçabilité PowerPoint doit être préservée sur chaque section.
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
