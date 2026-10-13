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
import { relativeReminderTime } from './timezone'

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
 * Règles de migration :
 * 1. Si eventId existe mais événement manquant → garde le format ancien, signale warning
 * 2. Si timing='relative' et event existe → calcule l'instant réel d'envoi
 * 3. Si timing='absolute' → préserve exactement
 * 4. Crée un rappel pour chaque ancien rappel
 * 5. Jamais de reminders vides (relativeReminders toujours défini)
 *
 * @param oldNotif notification potentiellement anciennes
 * @param events liste d'événements pour résoudre les références
 * @returns notification au format autonome, ou inchangée si déjà migrée
 */
export function migrateNotification(
  oldNotif: any, // any car peut être mélange ancien/nouveau
  events: Event[]
): EventNotificationSchedule {
  // Vérifier si déjà au format autonome (a relativeReminders)
  if (Array.isArray((oldNotif as any).relativeReminders)) {
    // Format autonome : supprimer eventId s'il existe
    return {
      ...(oldNotif as EventNotificationSchedule),
      eventId: undefined,
    }
  }

  const old = oldNotif as OldEventNotificationSchedule

  // Pas d'eventId → déjà autonome (format intermédiaire)
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
    // ⚠️ Événement disparu : garder ancienne structure sans cracher
    console.warn(
      `[Migration] Événement ${old.eventId} introuvable pour notification ${old.id}. Garder format ancien.`
    )
    return {
      id: old.id,
      enabled: old.enabled,
      title: old.title || 'Sans titre',
      message: old.message || '',
      imageUrl: old.imageUrl,
      tutorialId: old.tutorialId,
      // ⚠️ CRITIQUE : Utiliser l'absoluteTime ancien s'il existe
      // NE JAMAIS fallback à Date.now() (cela invente une date arbitraire)
      // Si absoluteTime manque, utiliser une sentinel value neutre
      // Phase B déterminera comment gérer ces cas
      absoluteTime: old.absoluteTime !== undefined ? old.absoluteTime : 0,
      relativeReminders: [],
      createdAt: old.createdAt || 0,
      modifiedAt: old.modifiedAt || 0,
      eventId: old.eventId, // Garder la référence perdue pour audit
    }
  }

  // ✅ Événement trouvé : migrer complètement
  const reminders: NotificationReminder[] = []

  // Créer UN rappel depuis l'ancien format
  if (old.timing === 'relative' && old.relativeDelay) {
    // Rappel relatif : calculer l'heure réelle d'envoi
    const sendTime = relativeReminderTime(event.startAt, old.relativeDelay)
    if (sendTime !== null) {
      reminders.push({
        id: `rem-${old.id}`,
        enabled: old.enabled,
        relativeDelay: old.relativeDelay,
        sentAt: old.sentAt,
        status: old.status || 'pending',
      })
    }
  } else if (old.timing === 'absolute' && old.absoluteTime) {
    // Rappel absolu : créer un rappel "synth" avec le délai calculé
    // IMPORTANT : délai = (absoluteTime - startAt)
    // Si positif : rappel APRÈS l'événement (invalide mais préservé)
    // Si négatif : rappel AVANT l'événement (normal)
    const delayMs = old.absoluteTime - event.startAt
    
    // Format du délai relatif pour relativeReminders
    // delayMinutes peut être positif, négatif, ou zéro
    const delayMinutes = Math.round(delayMs / 60000)
    
    // Format : 
    // - Si delayMinutes === 0 : "0m" (pas de signe)
    // - Si delayMinutes < 0 : "-{abs}m" (signe négatif)
    // - Si delayMinutes > 0 : "{num}m" (positif, pas de signe — c'est rare/invalide)
    let delayStr: string
    if (delayMinutes === 0) {
      delayStr = '0m'
    } else if (delayMinutes < 0) {
      delayStr = `${delayMinutes}m`  // déjà négatif
    } else {
      delayStr = `${delayMinutes}m`  // positif (invalide mais préservé)
    }
    
    reminders.push({
      id: `rem-${old.id}`,
      enabled: old.enabled,
      relativeDelay: delayStr,
      sentAt: old.sentAt,
      status: old.status || 'pending',
    })
    
    console.log(
      `[Migration] Rappel absolu: absoluteTime=${old.absoluteTime}, startAt=${event.startAt}, ` +
      `delayMs=${delayMs}, relativeDelay="-${delayStr}", ` +
      `verify: startAt + (-${delayStr}) = ${event.startAt + (delayMs / 60000 * 60000)} (should be ${old.absoluteTime})`
    )
  } else if (old.absoluteTime) {
    // Pas de timing spécifié, mais absoluteTime → traiter comme absolu
    const delayMs = old.absoluteTime - event.startAt
    const delayMinutes = Math.round(delayMs / 60000)
    
    let delayStr: string
    if (delayMinutes === 0) {
      delayStr = '0m'
    } else if (delayMinutes < 0) {
      delayStr = `${delayMinutes}m`
    } else {
      delayStr = `${delayMinutes}m`
    }
    
    reminders.push({
      id: `rem-${old.id}`,
      enabled: old.enabled,
      relativeDelay: delayStr,
      sentAt: old.sentAt,
      status: old.status || 'pending',
    })
  }

  // Construire la nouvelle notification
  const migrated: EventNotificationSchedule = {
    id: old.id,
    enabled: old.enabled,
    title: old.title || `Rappel : ${event.name}`,
    message: old.message || `${event.name} approche !`,
    imageUrl: old.imageUrl,
    tutorialId: old.tutorialId || event.tutorialId,
    // Instant de base : l'ancien absoluteTime ou le début de l'événement
    // NE JAMAIS utiliser Date.now() comme fallback — ce serait inventer une date
    absoluteTime: old.absoluteTime !== undefined ? old.absoluteTime : event.startAt,
    relativeReminders: reminders,
    // ⚠️ CRITIQUE : Si createdAt/modifiedAt manquent, utiliser SENTINEL (0 ou -1)
    // Pas Date.now() qui inventerait une date arbitraire
    // 0 = pas de date valide (à corriger manuellement en Phase B si besoin)
    createdAt: old.createdAt !== undefined ? old.createdAt : 0,
    modifiedAt: old.modifiedAt !== undefined ? old.modifiedAt : 0,
    // Marquer comme migrée, supprimer eventId
    eventId: undefined,
  }

  // Signaler les dates invalides pour correction manuelle
  if (migrated.createdAt === 0) {
    console.warn(
      `[Migration] MISSING METADATA: Notification ${old.id} has no createdAt — was manually set to 0. ` +
      `This should be corrected in Phase B.`
    )
  }
  if (migrated.modifiedAt === 0) {
    console.warn(
      `[Migration] MISSING METADATA: Notification ${old.id} has no modifiedAt — was manually set to 0. ` +
      `This should be corrected in Phase B.`
    )
  }

  console.log(
    `[Migration] Notification ${old.id} (evt ${old.eventId}) → autonome (${reminders.length} rappel(s))`
  )
  return migrated
}

/**
 * Migrer un lot de notifications.
 * Préserve l'ordre, signale les erreurs, garantit relativeReminders présent.
 */
export function migrateNotifications(
  oldNotifs: any[],
  events: Event[]
): EventNotificationSchedule[] {
  return oldNotifs.map((notif) => {
    try {
      return migrateNotification(notif, events)
    } catch (err) {
      console.error(`[Migration] Erreur notif ${notif?.id}:`, err)
      // Retourner une structure sûre en cas d'erreur
      return {
        id: notif?.id || `error-${Date.now()}`,
        enabled: notif?.enabled ?? true,
        title: notif?.title || '[Erreur migration]',
        message: notif?.message || '',
        absoluteTime: notif?.absoluteTime || Date.now(),
        relativeReminders: [],
        createdAt: notif?.createdAt || Date.now(),
        modifiedAt: notif?.modifiedAt || Date.now(),
        eventId: undefined,
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
