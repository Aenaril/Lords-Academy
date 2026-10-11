/**
 * Contrat d'API partagé entre le front (navigateur) et le Cloudflare Worker.
 *
 * Ce fichier ne contient AUCUN secret. Il décrit uniquement la forme des
 * requêtes/réponses, afin que le front et le Worker restent synchronisés.
 *
 * Principes de sécurité (rappel, appliqués côté Worker) :
 *  - Le mot de passe partagé n'existe QUE côté Worker (variable secrète).
 *  - Le token GitHub privilégié n'existe QUE côté Worker.
 *  - La session est portée par un cookie HttpOnly + Secure + SameSite,
 *    jamais lisible par le JavaScript du navigateur.
 *  - Toute écriture est vérifiée côté serveur (session + origine + CSRF).
 */

/** Métadonnées publiques renvoyées après connexion (jamais le secret). */
export interface SessionInfo {
  authenticated: boolean
  /** Expiration de session (timestamp ms) pour information d'UI. */
  expiresAt?: number
}

/** Corps de POST /api/login */
export interface LoginRequest {
  password: string
}

export interface LoginResponse {
  ok: boolean
  /** Présent uniquement si ok. */
  session?: SessionInfo
  /** Message générique en cas d'échec (ne distingue pas la cause). */
  error?: string
  /** Secondes avant nouvelle tentative autorisée (si rate-limited). */
  retryAfter?: number
}

/** Enveloppe d'un contenu de tutoriel versionné. */
export interface TutorialPayload {
  /** Identifiant du tutoriel (ex. 'dragon-arena'). */
  tutorialId: string
  /** Contenu complet du tutoriel (structure EditableTutorial sérialisée). */
  content: unknown
  /** Empreinte de la version de base (optimistic concurrency). */
  baseRevision?: string
}

/** Réponse de lecture d'un brouillon ou d'un contenu publié. */
export interface TutorialFetchResponse {
  content: unknown | null
  /** Révision courante côté serveur (sha GitHub ou hash). */
  revision?: string
  /** Qui a modifié en dernier (étiquette, pas un compte individuel). */
  lastEditedLabel?: string
  updatedAt?: number
}

/** Réponse d'écriture (sauvegarde de brouillon ou publication). */
export interface MutationResponse {
  ok: boolean
  revision?: string
  error?: string
  /** En cas de conflit de version (409). */
  conflict?: {
    serverRevision: string
  }
}

/** Réponse d'upload d'image. */
export interface UploadResponse {
  ok: boolean
  /** URL publique de l'image enregistrée. */
  url?: string
  error?: string
}

/** Une entrée d'historique de publication (= un commit GitHub). */
export interface HistoryEntry {
  /** SHA du commit (identifiant de la version). */
  revision: string
  /** Date/heure du commit (ISO) pour affichage. */
  date: string
  /** Message du commit (contient le tutoriel concerné). */
  message: string
  /** Étiquette d'auteur (pas de compte individuel : "R4"). */
  authorLabel?: string
}

/** Réponse de l'historique des publications d'un tutoriel. */
export interface HistoryResponse {
  tutorialId: string
  entries: HistoryEntry[]
}

/** Réponse : contenu d'une version précise (pour prévisualisation). */
export interface VersionResponse {
  revision: string
  content: unknown | null
  date?: string
}

/** Chemins d'API (sans préfixe `/api` — ajouté automatiquement à la base URL). */
export const API_ROUTES = {
  login: '/login',
  logout: '/logout',
  session: '/session',
  draftGet: '/draft', // GET ?tutorialId=
  draftPut: '/draft', // PUT
  publish: '/publish', // POST
  upload: '/upload', // POST (multipart)
  publishedGet: '/published', // GET ?tutorialId=
  history: '/history', // GET ?tutorialId= — liste des commits
  version: '/version', // GET ?tutorialId=&revision= — contenu d'une version
  restore: '/restore' // POST — republie une version (nouveau commit)
} as const

/** Limites de sécurité partagées (le Worker fait foi). */
export const LIMITS = {
  maxUploadBytes: 3 * 1024 * 1024, // 3 Mo par image
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  sessionTtlSeconds: 2 * 60 * 60, // 2 h
  loginMaxAttempts: 5,
  loginWindowSeconds: 15 * 60 // 5 essais / 15 min
} as const
