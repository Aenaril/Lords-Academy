/**
 * Migration des notifications de l'ancien format (lié aux Événements)
 * vers le nouveau format autonome.
 * 
 * Approche :
 * - Non-destructive : preserve toutes les données
 * - Idempotente : exécution multiple = résultat identique
 * - Transparente : signale les migrations sans cracher
 * - Serveur-first : sauvegarde seulement après validation
 */

import type { EventNotificationSchedule, NotificationReminder, Event } from './types'
import { parseRelativeDelay } from './timezone'

/**
 * Format ancien d'une notification (avant autonomie).
 * Structure historique pour comprendre les anciennes données stockées.
 */
interface OldEventNotificationSchedule {
  id: string
  eventId: string // Clé vers l'événement
  enabled: boolean
  title: string
  message: string
  imageUrl?: string
  tutorialId?: string
  // Ancien timing : 'relative' ou 'absolute'
  timing?: 'relative' | 'absolute'
  relativeDelay?: string // ex: '-24h' (si timing='relative')
  absoluteTime?: number // timestamp UTC (si timing='absolute')
  sentAt?: number
  status?: 'pending' | 'sent' | 'failed'
  createdAt?: number
  modifiedAt?: number
}

/**
 * Convertir une ancienne notification (avec eventId) vers nouvelle (autonome).
 *
 * GARANTIES :
 * 1. Chaque rappel généré DOIT passer parseRelativeDelay() (format négatif uniquement)
 * 2. Jamais de double-envoi : ancienne notification unique → une seule source d'envoi
 * 3. Dates invalides (0, après-événement) → pas activées, audit trail conservée
 * 4. Idempotence : exécution multiple = identique
 * 5. Non-destructif : données historiques préservées
 *
 * @param oldNotif notification potentiellement anciennes
 * @param events liste d'événements pour résoudre les références
 * @returns notification au format autonome, ou inchangée si déjà migrée
 */
export function migrateNotification(
  oldNotif: any,
  events: Event[]
): EventNotificationSchedule {
  // Vérifier si déjà au format autonome (a relativeReminders)
  if (Array.isArray((oldNotif as any).relativeReminders)) {
    return {
      ...(oldNotif as EventNotificationSchedule),
      eventId: undefined,
    }
  }

  const old = oldNotif as OldEventNotificationSchedule

  // Pas d'eventId → déjà autonome
  if (!old.eventId) {
    return {
      ...(old as EventNotificationSchedule),
      relativeReminders: (old as any).relativeReminders || [],
      eventId: undefined,
    }
  }

  // Récupérer l'événement associé
  const event = events.find((e) => e.id === old.eventId)

  if (!event) {
    // Événement disparu : garder ancienne structure, marquer invalide
    console.warn(
      `[Migration] Événement ${old.eventId} introuvable pour notification ${old.id}. Garder format ancien.`
    )
    return {
      id: old.id,
      enabled: false, // MARQUER INVALIDE (pas de source d'envoi valide)
      title: old.title || 'Sans titre',
      message: old.message || '',
      imageUrl: old.imageUrl,
      tutorialId: old.tutorialId,
      absoluteTime: 0, // Sentinel, invalide
      relativeReminders: [],
      createdAt: old.createdAt || 0,
      modifiedAt: old.modifiedAt || 0,
      eventId: old.eventId, // Audit trail
    }
  }

  // ✅ Événement trouvé : migrer complètement
  const reminders: NotificationReminder[] = []

  // Traiter ancien format relatif
  if (old.timing === 'relative' && old.relativeDelay) {
    // Valider le format avec le contrat réel
    if (parseRelativeDelay(old.relativeDelay) !== null) {
      reminders.push({
        id: `rem-${old.id}`,
        enabled: old.enabled,
        relativeDelay: old.relativeDelay,  // Format exact : -24h, -30m, etc.
        sentAt: old.sentAt,
        status: old.status || 'pending',
      })
    } else {
      console.warn(
        `[Migration] Notification ${old.id}: relativeDelay "${old.relativeDelay}" invalide (doit être -Xh/-Xm/-Xd)`
      )
    }
  }
  // Traiter ancien format absolu
  else if (old.timing === 'absolute' && old.absoluteTime !== undefined) {
    const delayMs = old.absoluteTime - event.startAt

    if (delayMs < 0) {
      // ✅ AVANT l'événement : valide
      const delayMinutes = Math.round(delayMs / 60000)
      const relativeDelay = `${delayMinutes}m`  // ex: -720m

      // Valider AVANT d'ajouter
      if (parseRelativeDelay(relativeDelay) !== null) {
        reminders.push({
          id: `rem-${old.id}`,
          enabled: old.enabled,
          relativeDelay,
          sentAt: old.sentAt,
          status: old.status || 'pending',
        })
      } else {
        console.error(
          `[Migration] ANOMALY: Generated relativeDelay "${relativeDelay}" failed validation`
        )
      }
    } else if (delayMs === 0) {
      // ⚠️ À l'heure exacte : invalide (pas de `-0m`)
      console.warn(
        `[Migration] Notification ${old.id}: programmed exactement à l'heure de l'événement (pas de rappel 0m valide)`
      )
    } else {
      // ❌ APRÈS l'événement : invalide
      console.warn(
        `[Migration] Notification ${old.id}: programmed ${Math.round(delayMs / 60000)} minutes APRÈS l'événement—invalide`
      )
    }
  }
  // Ancien format sans timing = cas ambigu
  else if (old.absoluteTime !== undefined) {
    const delayMs = old.absoluteTime - event.startAt

    if (delayMs < 0) {
      const delayMinutes = Math.round(delayMs / 60000)
      const relativeDelay = `${delayMinutes}m`

      if (parseRelativeDelay(relativeDelay) !== null) {
        reminders.push({
          id: `rem-${old.id}`,
          enabled: old.enabled,
          relativeDelay,
          sentAt: old.sentAt,
          status: old.status || 'pending',
        })
      }
    }
  }

  // Construire la nouvelle notification
  const migrated: EventNotificationSchedule = {
    id: old.id,
    enabled: old.enabled && reminders.length > 0, // Valide seulement si rappels valides
    title: old.title || `Rappel : ${event.name}`,
    message: old.message || `${event.name} approche !`,
    imageUrl: old.imageUrl,
    tutorialId: old.tutorialId || event.tutorialId,
    // Instant de base = début de l'événement
    // Les rappels sont tous relatifs à ce point de repère
    absoluteTime: event.startAt,
    relativeReminders: reminders,
    createdAt: old.createdAt !== undefined ? old.createdAt : 0,
    modifiedAt: old.modifiedAt !== undefined ? old.modifiedAt : 0,
    eventId: undefined,
  }

  // Signaler les cas problématiques
  if (reminders.length === 0) {
    console.warn(
      `[Migration] Notification ${old.id}: aucun rappel valide généré—marquée invalide (enabled=false)`
    )
  }
  if (migrated.createdAt === 0) {
    console.warn(
      `[Migration] Notification ${old.id}: createdAt manquant—sentinel value (0)`
    )
  }

  console.log(
    `[Migration] Notification ${old.id} (evt ${old.eventId}) → autonome (${reminders.length} rappel(s), enabled=${migrated.enabled})`
  )
  return migrated
}

/**
 * Migrer un lot de notifications.
 * Préserve l'ordre, signale les erreurs, garantit relativeReminders présent.
 * 
 * GARANTIES EN CAS D'ERREUR :
 * - Aucun horaire inventé (pas Date.now())
 * - enabled=false (pas d'envoi jusqu'à correction manuelle)
 * - Données originales conservées (audit trail)
 * - ID conservé si possible, sinon identifiant d'erreur unique
 */
export function migrateNotifications(
  oldNotifs: any[],
  events: Event[]
): EventNotificationSchedule[] {
  return oldNotifs.map((notif, index) => {
    try {
      return migrateNotification(notif, events)
    } catch (err) {
      console.error(`[Migration] Erreur notif ${notif?.id}:`, err)
      
      // Structure de secours : aucun horaire inventé, désactivée, données préservées
      return {
        id: notif?.id || `migration-error-${index}`,
        enabled: false, // JAMAIS d'envoi automatique en cas d'erreur
        title: notif?.title || '[Erreur migration]',
        message: notif?.message || '',
        imageUrl: notif?.imageUrl,
        tutorialId: notif?.tutorialId,
        // Préserver la valeur brute si disponible, sinon sentinel 0 (PAS Date.now())
        absoluteTime: notif?.absoluteTime ?? 0,
        relativeReminders: [], // Aucun envoi avant correction
        // Préserver métadonnées historiques ou sentinel 0
        createdAt: notif?.createdAt ?? 0,
        modifiedAt: notif?.modifiedAt ?? 0,
        eventId: (notif as any)?.eventId, // Audit trail pour investigation
      }
    }
  })
}

/**
 * Vérifier si une notification nécessite une migration.
 * = a eventId ou timing défini.
 */
export function needsMigration(notif: any): boolean {
  return Boolean(notif?.eventId || notif?.timing)
}

/**
 * Vérifier si une notification est déjà au format autonome.
 * = a relativeReminders et pas eventId.
 */
export function isAutonomous(notif: any): boolean {
  return Array.isArray(notif?.relativeReminders) && !notif?.eventId
}

/**
 * Statistiques de migration pour audit.
 */
export interface MigrationStats {
  total: number
  migrated: number
  autonomous: number
  erroredOrMissing: number
  warnings: string[]
}

/**
 * Analyser un lot et fournir statistiques.
 */
export function analyzeMigration(
  notifs: any[],
  events: Event[]
): MigrationStats {
  const stats: MigrationStats = {
    total: notifs.length,
    migrated: 0,
    autonomous: 0,
    erroredOrMissing: 0,
    warnings: [],
  }

  for (const notif of notifs) {
    if (isAutonomous(notif)) {
      stats.autonomous++
    } else if (needsMigration(notif)) {
      const event = events.find((e) => e.id === (notif as OldEventNotificationSchedule).eventId)
      if (!event && (notif as OldEventNotificationSchedule).eventId) {
        stats.warnings.push(
          `Notification ${notif.id}: événement ${(notif as OldEventNotificationSchedule).eventId} introuvable`
        )
        stats.erroredOrMissing++
      } else {
        stats.migrated++
      }
    } else {
      // Ancien format sans eventId (intermédiaire)
      stats.autonomous++
    }
  }

  return stats
}
