/**
 * Modèles de données pour le système Web Push.
 * 
 * Architecture pour Phase B+ :
 * - Abonnements des appareils (stockage KV)
 * - Planification des notifications (stockage KV)
 * - Journaux d'envoi (logs, pas de persistance requise)
 * - Déduplication (clés uniques par subscription × schedule)
 * - Gestion des erreurs et retraits
 */

// ═══════════════════════════════════════════════════════════════
// ABONNEMENTS AUX NOTIFICATIONS PUSH
// ═══════════════════════════════════════════════════════════════

/**
 * Clés cryptographiques ECDH + Auth pour une subscription.
 * Fournies par le navigateur via PushManager.subscribe().
 */
export interface PushSubscriptionKeys {
  /** Clé publique ECDH (Elliptic Curve Diffie-Hellman), Base64-encodée */
  p256dh: string
  /** Clé d'authentification, Base64-encodée */
  auth: string
}

/**
 * État d'une subscription Web Push.
 * 
 * Stockage : KV namespace "NOTIFICATIONS_SUBSCRIPTIONS"
 * Clé : subscription.endpoint (unique par appareil)
 * TTL : 90 jours (auto-expiration si appareil inactif)
 */
export interface PushDeviceSubscription {
  /** UUID unique pour cette subscription */
  id: string

  /** URL d'endpoint Push Service (fournie par le navigateur) */
  endpoint: string

  /** Clés cryptographiques ECDH + Auth */
  keys: PushSubscriptionKeys

  /** User-Agent du navigateur qui s'est abonné (info diagnostique) */
  userAgent?: string

  /** Timestamp UTC de création */
  createdAt: number

  /** Timestamp UTC de dernier contact confirmé */
  lastSeenAt: number

  /**
   * Statut de la subscription.
   * - 'active' : subscription valide, peut recevoir
   * - 'unsubscribed' : utilisateur a cliqué "Arrêter les notifications"
   * - 'invalid' : endpoint mort (erreur HTTP permanent, ex 410 Gone)
   * - 'failed_temp' : échec temporaire (retry plus tard)
   */
  status: 'active' | 'unsubscribed' | 'invalid' | 'failed_temp'

  /** Nombre de tentatives d'envoi échouées (reset après succès) */
  failureCount: number

  /** Dernier timestamp de tentative échouée */
  lastFailureAt?: number

  /** Raison de la dernière erreur (ex: "410 Gone", "timeout") */
  lastError?: string
}

// ═══════════════════════════════════════════════════════════════
// PROGRAMMATION DES NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Programmation autonome d'une notification.
 * 
 * Réutilise EventNotificationSchedule mais ajoute des champs Web Push.
 * Stockage : KV namespace "NOTIFICATIONS_SCHEDULES"
 * Clé : schedule.id
 */
export interface NotificationBroadcastSchedule {
  /** ID unique de la programmation */
  id: string

  /** Contenu de la notification */
  title: string
  message: string
  imageUrl?: string

  /** Destination optionnelle (tutoriel ou URL) */
  tutorialId?: string

  /**
   * Instant UTC d'envoi (absolu).
   * Tous les rappels relatifs sont calculés par rapport à ce moment.
   */
  absoluteTime: number

  /**
   * Rappels relatifs à absoluteTime.
   * Exemples : '-24h', '-12h', '-1h', '-30m'
   * Chaque rappel génère un envoi distinct.
   */
  relativeReminders: BroadcastReminder[]

  /**
   * État de la programmation.
   * - 'draft' : en édition, jamais envoyée
   * - 'scheduled' : en attente d'envoi
   * - 'sent' : tous les rappels envoyés avec succès
   * - 'partial' : certains rappels envoyés, d'autres en erreur
   * - 'cancelled' : annulée avant envoi
   */
  status: 'draft' | 'scheduled' | 'sent' | 'partial' | 'cancelled'

  /** Activée ou non (admin peut désactiver sans supprimer) */
  enabled: boolean

  /** Timestamp de création */
  createdAt: number

  /** Timestamp de dernière modification */
  modifiedAt: number

  /** Admin qui a créé cette programmation */
  createdBy?: string

  /** Métadonnées optionnelles pour déduplication ou analytics */
  deduplicationKey?: string
}

/**
 * Un rappel au sein d'une programmation broadcast.
 */
export interface BroadcastReminder {
  /** UUID du rappel */
  id: string

  /** Délai relatif à absoluteTime (négatif = avant) */
  relativeDelay: string // ex: '-24h', '-1h'

  /** Statut d'envoi */
  status: 'pending' | 'sent' | 'partial_failure' | 'failed'

  /** Timestamp UTC du dernier envoi (si appliquable) */
  sentAt?: number

  /** Nombre de destinataires rejoints */
  recipientCount?: number

  /** Nombre d'erreurs lors d'envoi */
  errorCount?: number

  /** Raison de l'erreur (si failed) */
  failureReason?: string
}

// ═══════════════════════════════════════════════════════════════
// JOURNAUX D'ENVOI
// ═══════════════════════════════════════════════════════════════

/**
 * Événement d'envoi de notification Web Push.
 * 
 * Usage : Logs uniquement (pas de persistance).
 * Important pour audit et debugging.
 */
export interface PushSendEvent {
  /** UUID unique pour cet envoi */
  id: string

  /** ID de la programmation (NotificationBroadcastSchedule.id) */
  scheduleId: string

  /** ID du rappel au sein de la programmation */
  reminderId: string

  /** ID de la subscription destinataire */
  subscriptionId: string

  /** Endpoint de destination (pour debugging) */
  endpointHash: string // Hash de l'endpoint, pas l'URL complète

  /**
   * Statut final de l'envoi.
   * - 'success' : notification reçue par le Push Service
   * - 'failed' : erreur lors de l'envoi
   * - 'invalid_subscription' : subscription expirée/invalide
   */
  status: 'success' | 'failed' | 'invalid_subscription'

  /** Timestamp UTC d'envoi */
  sentAt: number

  /** Code HTTP (ex: 201, 410, 500) */
  httpStatus?: number

  /** Message d'erreur (si applicable) */
  errorMessage?: string

  /** Durée de l'appel HTTP en ms */
  durationMs?: number
}

// ═══════════════════════════════════════════════════════════════
// DÉDUPLICATION ET INTÉGRITÉ
// ═══════════════════════════════════════════════════════════════

/**
 * Clé de déduplication pour éviter les doubles envois.
 * 
 * Format : `${scheduleId}#${reminderId}#${subscriptionId}`
 * 
 * Permet de détecter si une notification a déjà été envoyée à ce destinataire.
 * En Phase B, vérifier cette clé avant l'envoi HTTP.
 */
export interface DeduplicationKey {
  scheduleId: string
  reminderId: string
  subscriptionId: string

  /** Clé composite */
  composite(): string
}

// ═══════════════════════════════════════════════════════════════
// STRATÉGIES DE NETTOYAGE
// ═══════════════════════════════════════════════════════════════

/**
 * Politique de nettoyage des subscriptions invalidées.
 * 
 * Phase B implémentera :
 * - TTL auto-expiration (90 jours)
 * - Suppression post-erreur (410 Gone → supprimer immédiatement)
 * - Suppression post-limite (3 erreurs consécutives → invalide)
 * - Archive (garder logs 30 jours puis supprimer)
 */
export interface SubscriptionCleanupPolicy {
  /** TTL en secondes avant auto-expiration (90 jours = 7776000 sec) */
  defaultTtlSeconds: number

  /** Max erreurs avant invalide */
  maxConsecutiveErrors: number

  /** TTL pour les logs de send événements (30 jours = 2592000 sec) */
  logRetentionSeconds: number

  /** Si true, supprimer immédiatement après erreur 410 Gone */
  deleteOn410Gone: boolean

  /** Délai avant retry après erreur temp (ex: 3600 = 1 heure) */
  retryAfterSeconds: number
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION ET SECRETS
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration globale Web Push.
 * 
 * À définir dans les secrets Cloudflare Worker :
 * - VAPID_PRIVATE_KEY : Clé privée ECDP256 (generation externe)
 * - VAPID_PUBLIC_KEY : Clé publique correspondante
 * - VAPID_SUBJECT : URL de contact (ex: mailto:admin@example.com)
 */
export interface WebPushConfig {
  vapidSubject: string // mailto:... ou https://...
  vapidPublicKey: string // Clé publique (à distribuer au navigateur)
  // vapidPrivateKey: string // ❌ JAMAIS exposer au client
  
  /** Push Service endpoint (généralement Firebase Cloud Messaging) */
  pushServiceEndpoint?: string

  /** Max délai entre reminders (ex: 7 jours) */
  maxReminderSpanMs: number

  /** Politique de nettoyage */
  cleanupPolicy: SubscriptionCleanupPolicy
}

// ═══════════════════════════════════════════════════════════════
// STATISTIQUES DE SANTÉ
// ═══════════════════════════════════════════════════════════════

/**
 * Métriques de santé du système Web Push.
 * Utilisées pour monitoring et alertes.
 */
export interface WebPushHealthMetrics {
  /** Nombre total de subscriptions actives */
  totalSubscriptions: number

  /** Subscriptions créées au cours des 24 dernières heures */
  newSubscriptionsLast24h: number

  /** Subscriptions en erreur (invalid / failed_temp) */
  problematicSubscriptions: number

  /** Pourcentage de problèmes */
  problemRatePercent: number

  /** Programmations en attente d'envoi */
  pendingSchedules: number

  /** Programmations en erreur partielle */
  partialFailureSchedules: number

  /** Timestamp du calcul */
  calculatedAt: number
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION ET CONTRATS
// ═══════════════════════════════════════════════════════════════

/**
 * Résultats de validation d'une subscription.
 */
export interface SubscriptionValidationResult {
  /** Valide ? */
  valid: boolean

  /** Code d'erreur (si invalide) */
  code?: string

  /** Message d'erreur (si invalide) */
  message?: string

  /** Propriétés qui ont échoué la validation */
  failedProperties?: string[]
}

/**
 * Résultats de validation d'une programmation.
 */
export interface ScheduleValidationResult {
  valid: boolean
  code?: string
  message?: string
  failedProperties?: string[]
}
