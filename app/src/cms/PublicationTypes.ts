/**
 * Types pour Publication de CMS
 * 
 * Inclut uniquement les types nécessaires pour l'API de publication
 * Les types complets (Theme, Announcement, etc.) sont définis ailleurs dans le CMS
 */

/**
 * États de publication côté serveur
 * (depuis app/functions/cms.ts PublicationStatus)
 */
export enum PublicationStatus {
  BEFORE_WRITE = 'before_write',
  WRITE_SUCCESS = 'write_success',
  VERIFY_PENDING = 'verify_pending',
  VERIFY_SUCCESS = 'verify_success',
  CLOUDFLARE_PENDING = 'cloudflare_pending',
  EXPIRED_VERIFY = 'expired_verify',
  WRITE_FAILED = 'write_failed',
  VERIFY_FAILED = 'verify_failed',
  CONFLICT = 'conflict',
}

/**
 * Réponse d'API publication structurée
 */
export interface PublicationResponse {
  ok: boolean
  revision?: string // SHA GitHub
  revisionNumber?: number // révision monotone
  status?: PublicationStatus // État détaillé
  error?: string // Message d'erreur
  details?: string // Détails techniques
  userMessage?: string // Message pour l'utilisateur
}

/**
 * États de l'interface utilisateur (dérivés du statut serveur)
 */
export type PublishUIStatus = 
  | 'idle'
  | 'publishing'
  | 'verify-success' // Vérification réussie
  | 'verify-failed' // Vérification échouée (après écriture réussie)
  | 'verify-expired' // Vérification expirée après écriture réussie
  | 'write-failed' // Écriture GitHub échouée
  | 'conflict' // Conflit persistant
  | 'auth-required'
