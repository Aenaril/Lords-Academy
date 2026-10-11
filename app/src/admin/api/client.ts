/**
 * Client HTTP du front vers le Cloudflare Worker.
 *
 * - La base de l'API vient de `import.meta.env.VITE_ADMIN_API_BASE`
 *   (variable publique, pas un secret : juste l'URL du Worker).
 * - Les requêtes incluent les cookies (`credentials: 'include'`) pour porter
 *   la session HttpOnly émise par le Worker.
 * - Un en-tête `X-Requested-With` accompagne chaque écriture : combiné à la
 *   vérification d'origine côté Worker, il protège contre le CSRF.
 */
import {
  API_ROUTES,
  type HistoryResponse,
  type LoginResponse,
  type MutationResponse,
  type SessionInfo,
  type TutorialFetchResponse,
  type UploadResponse,
  type VersionResponse
} from './contract'

export class AdminApiError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) {
    super(message)
    this.name = 'AdminApiError'
  }
}

function apiBase(): string {
  const base = (import.meta.env.VITE_ADMIN_API_BASE as string | undefined) ?? ''
  const cleaned = base.replace(/\/$/, '')
  return cleaned.length > 0 ? cleaned + '/api' : ''
}

/** L'admin distante est-elle configurée (URL du Worker fournie) ? */
export function isRemoteConfigured(): boolean {
  const base = (import.meta.env.VITE_ADMIN_API_BASE as string | undefined) ?? ''
  return base.trim().length > 0
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Lectures d'état qui doivent TOUJOURS être fraîches (jamais servies depuis
  // le cache navigateur) : le contenu publié et l'historique des publications.
  // Note : le préfixe "/api" est ajouté par apiBase(), donc on teste "/published"
  // et "/history" (et non "/api/...").
  const freshPaths = ['/published', '/history']
  const needsFresh = freshPaths.some((p) => path === p || path.startsWith(p + '?'))
  
  const res = await fetch(apiBase() + path, {
    credentials: 'include',
    // Forcer le rechargement réseau pour ces lectures sensibles à la fraîcheur
    cache: needsFresh ? 'no-store' : 'default',
    headers: {
      'X-Requested-With': 'lma-admin',
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers ?? {})
    },
    ...options
  })

  if (res.status === 204) return undefined as T

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* réponse sans corps JSON */
  }

  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After')) || data?.retryAfter
    throw new AdminApiError(
      data?.error ?? `Erreur ${res.status}`,
      res.status,
      retryAfter
    )
  }

  return data as T
}

export const adminApi = {
  /** Vérifie la session courante (via cookie). */
  async session(): Promise<SessionInfo> {
    try {
      return await request<SessionInfo>(API_ROUTES.session, { method: 'GET' })
    } catch {
      return { authenticated: false }
    }
  },

  /** Connexion par mot de passe partagé. Le Worker pose le cookie de session. */
  async login(password: string): Promise<LoginResponse> {
    return request<LoginResponse>(API_ROUTES.login, {
      method: 'POST',
      body: JSON.stringify({ password })
    })
  },

  async logout(): Promise<void> {
    await request<void>(API_ROUTES.logout, { method: 'POST' })
  },

  /** Récupère le brouillon privé (nécessite une session). */
  async getDraft(tutorialId: string): Promise<TutorialFetchResponse> {
    return request<TutorialFetchResponse>(
      `${API_ROUTES.draftGet}?tutorialId=${encodeURIComponent(tutorialId)}`,
      { method: 'GET' }
    )
  },

  /** Enregistre le brouillon privé (session requise). */
  async saveDraft(
    tutorialId: string,
    content: unknown,
    baseRevision?: string
  ): Promise<MutationResponse> {
    return request<MutationResponse>(API_ROUTES.draftPut, {
      method: 'PUT',
      body: JSON.stringify({ tutorialId, content, baseRevision })
    })
  },

  /** Supprime le brouillon distant (CORRECTION). */
  async deleteDraft(tutorialId: string): Promise<void> {
    return request<void>(`/draft?tutorialId=${encodeURIComponent(tutorialId)}`, { 
      method: 'DELETE' 
    })
  },

  /** Publie le contenu (session requise). Déclenche un commit GitHub côté Worker. */
  async publish(
    tutorialId: string,
    content: unknown,
    baseRevision?: string
  ): Promise<MutationResponse> {
    return request<MutationResponse>(API_ROUTES.publish, {
      method: 'POST',
      body: JSON.stringify({ tutorialId, content, baseRevision })
    })
  },

  /** Téléverse une image (session requise). Retourne l'URL publique. */
  async upload(file: File): Promise<UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    return request<UploadResponse>(API_ROUTES.upload, {
      method: 'POST',
      body: form
    })
  },

  /** Historique des publications (commits) d'un tutoriel (session requise). */
  async history(tutorialId: string): Promise<HistoryResponse> {
    return request<HistoryResponse>(
      `${API_ROUTES.history}?tutorialId=${encodeURIComponent(tutorialId)}`,
      { method: 'GET' }
    )
  },

  /** Contenu d'une version précise (prévisualisation avant restauration). */
  async version(tutorialId: string, revision: string): Promise<VersionResponse> {
    return request<VersionResponse>(
      `${API_ROUTES.version}?tutorialId=${encodeURIComponent(tutorialId)}&revision=${encodeURIComponent(revision)}`,
      { method: 'GET' }
    )
  },

  /** Restaure une version : republie son contenu via un NOUVEAU commit. */
  async restore(tutorialId: string, revision: string): Promise<MutationResponse> {
    return request<MutationResponse>(API_ROUTES.restore, {
      method: 'POST',
      body: JSON.stringify({ tutorialId, revision })
    })
  },

  /** Récupère le contenu publié d'un tutoriel (accessible sans authentification). */
  async getPublished(tutorialId: string): Promise<TutorialFetchResponse> {
    try {
      return await request<TutorialFetchResponse>(
        `${API_ROUTES.publishedGet}?tutorialId=${encodeURIComponent(tutorialId)}`,
        { method: 'GET' }
      )
    } catch {
      // Si l'API n'est pas accessible ou la route n'existe pas, retourner null
      return { content: null }
    }
  }
}
