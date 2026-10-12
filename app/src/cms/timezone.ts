/**
 * Utilitaires de fuseau horaire — Europe/Brussels
 *
 * Principe :
 * - On STOCKE toujours les instants en millisecondes UTC (timestamp).
 * - On AFFICHE et on SAISIT en heure belge (Europe/Brussels), avec gestion
 *   automatique CEST/CET (heure d'été/hiver).
 *
 * Les champs <input type="datetime-local"> travaillent en heure "locale du
 * navigateur", qui n'est pas forcément Bruxelles. On convertit donc
 * explicitement entre une saisie "heure de Bruxelles" et un timestamp UTC.
 */

const TZ = 'Europe/Brussels'

/**
 * Décalage (en minutes) de Europe/Brussels par rapport à UTC pour un instant
 * donné. Positif car Bruxelles est en avance sur UTC (+60 en hiver, +120 en été).
 */
function brusselsOffsetMinutes(utcMs: number): number {
  // Formate l'instant UTC dans le fuseau de Bruxelles, puis reconstruit un
  // "instant comme si c'était de l'UTC" pour mesurer l'écart.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  // hour peut être "24" à minuit selon l'implémentation : normaliser
  const hour = map.hour === 24 ? 0 : map.hour
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second)
  return Math.round((asUtc - utcMs) / 60000)
}

/**
 * Convertit une saisie "heure de Bruxelles" (composants calendaires) en
 * timestamp UTC (ms).
 *
 * Gère correctement l'heure d'été/hiver. Pour les heures ambiguës (recul de
 * l'horloge) ou inexistantes (avance), on applique le décalage calculé sur une
 * première approximation puis on corrige une fois — suffisant pour un planning
 * d'événements (précision à la minute).
 */
export function brusselsToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number
): number {
  // Première approximation : interpréter les composants comme de l'UTC.
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  // Décalage de Bruxelles autour de cet instant.
  const offset1 = brusselsOffsetMinutes(naiveUtc)
  // L'instant UTC réel = composants - décalage.
  let utc = naiveUtc - offset1 * 60000
  // Correction si le décalage change autour de la frontière DST.
  const offset2 = brusselsOffsetMinutes(utc)
  if (offset2 !== offset1) {
    utc = naiveUtc - offset2 * 60000
  }
  return utc
}

/**
 * Convertit un timestamp UTC (ms) en composants calendaires heure de Bruxelles.
 */
export function utcToBrusselsParts(utcMs: number): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
  }
}

/**
 * Valeur pour <input type="datetime-local"> représentant un instant UTC en
 * heure de Bruxelles (format "YYYY-MM-DDTHH:mm").
 */
export function utcToDatetimeLocalValue(utcMs: number | undefined): string {
  if (!utcMs) return ''
  const p = utcToBrusselsParts(utcMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * Convertit la valeur d'un <input type="datetime-local"> (interprétée comme
 * heure de Bruxelles) en timestamp UTC (ms).
 */
export function datetimeLocalValueToUtc(value: string): number | undefined {
  if (!value) return undefined
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return undefined
  const [, y, mo, d, h, mi] = m
  return brusselsToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi))
}

/**
 * Formate un instant UTC en texte lisible en heure belge.
 * Ex : "24/10/2026 à 20:00"
 */
export function formatBrussels(utcMs: number | undefined): string {
  if (!utcMs) return '—'
  const dtf = new Intl.DateTimeFormat('fr-BE', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // fr-BE insère déjà la date ; on normalise le séparateur.
  return dtf.format(new Date(utcMs)).replace(',', ' à')
}

/**
 * Convertit un délai relatif ('-24h', '-3h', '-30m') en millisecondes négatives.
 * Retourne null si format invalide.
 */
export function parseRelativeDelay(delay: string): number | null {
  const m = delay.match(/^-(\d+)(h|m|d)$/)
  if (!m) return null
  const value = Number(m[1])
  const unit = m[2]
  const factor = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000
  return -(value * factor)
}

/**
 * Calcule l'instant d'envoi (UTC ms) d'un rappel relatif par rapport au début
 * d'un événement. Ex : eventStart - 24h.
 */
export function relativeReminderTime(eventStartUtc: number, delay: string): number | null {
  const offset = parseRelativeDelay(delay)
  if (offset === null) return null
  return eventStartUtc + offset // offset est négatif
}
