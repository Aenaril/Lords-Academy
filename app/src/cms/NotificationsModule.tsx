/**
 * Module CMS Notifications — Programmation des rappels d'événements
 *
 * Pour CHAQUE événement : jusqu'à 3 rappels indépendants.
 * Chaque rappel :
 * - activation/désactivation
 * - timing relatif (-24h/-3h/-30m/…) OU absolu (date/heure belge)
 * - titre + message
 * - image facultative
 * - destination (tutoriel publié)
 * - statut
 *
 * Règles :
 * - jamais plus de 3 rappels par événement
 * - un rappel ne peut pas être programmé APRÈS le début de l'événement
 * - quand la date d'un événement change, les rappels relatifs sont recalculés
 *   automatiquement (ils dépendent de startAt) ; les rappels absolus sont
 *   vérifiés et signalés s'ils tombent après le nouveau début
 *
 * ENVOI RÉEL : désactivé. L'infrastructure Web Push (VAPID + Worker planifié)
 * n'est pas configurée. On affiche explicitement « Envoi push non activé » et
 * on ne simule JAMAIS un envoi réussi.
 *
 * Persistance : programmations ET événements côté serveur (/api/cms-storage).
 */

import { useState, useEffect, useRef } from 'react'
import type { EventNotificationSchedule, Event } from './types'
import {
  loadEvents as loadEventsServer,
  loadNotificationSchedules as loadSchedulesServer,
  saveNotificationSchedules as saveSchedulesServer,
  CmsStorageError,
} from './cmsStorageClient'
import {
  utcToDatetimeLocalValue,
  datetimeLocalValueToUtc,
  formatBrussels,
  relativeReminderTime,
} from './timezone'
import { usePublishedTutorials } from './usePublishedTutorials'
import './NotificationsModule.css'

interface NotificationsModuleProps {
  isAuthenticated?: boolean
}

const LS_KEY = 'cms:push:schedules'
const MAX_REMINDERS_PER_EVENT = 3

const RELATIVE_OPTIONS = [
  { value: '-24h', label: '24 heures avant' },
  { value: '-12h', label: '12 heures avant' },
  { value: '-6h', label: '6 heures avant' },
  { value: '-3h', label: '3 heures avant' },
  { value: '-1h', label: '1 heure avant' },
  { value: '-30m', label: '30 minutes avant' },
]

export default function NotificationsModule({ isAuthenticated = false }: NotificationsModuleProps) {
  const [schedules, setSchedules] = useState<EventNotificationSchedule[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedTutorials = usePublishedTutorials()

  // Charger événements + programmations
  useEffect(() => {
    const savedScheds = localStorage.getItem(LS_KEY)
    if (savedScheds) {
      try {
        setSchedules(JSON.parse(savedScheds))
      } catch (e) {
        console.error('Erreur parsing programmations (cache local):', e)
      }
    }

    if (isAuthenticated) {
      setSyncStatus('loading')
      Promise.all([loadEventsServer(), loadSchedulesServer()])
        .then(([serverEvents, serverScheds]) => {
          setEvents(serverEvents)
          setSchedules(serverScheds)
          localStorage.setItem(LS_KEY, JSON.stringify(serverScheds))
          if (serverEvents.length > 0 && !selectedEventId) {
            setSelectedEventId(serverEvents[0].id)
          }
          setSyncStatus('idle')
        })
        .catch((err) => {
          if (err instanceof CmsStorageError && err.status === 401) {
            setSyncStatus('idle')
          } else {
            console.error('Erreur chargement notifications serveur:', err)
            setSyncStatus('error')
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const persistSchedules = (items: EventNotificationSchedule[]) => {
    setSchedules(items)
    localStorage.setItem(LS_KEY, JSON.stringify(items))

    if (!isAuthenticated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSyncStatus('saving')
      saveSchedulesServer(items)
        .then(() => {
          setSyncStatus('saved')
          setTimeout(() => setSyncStatus('idle'), 2000)
        })
        .catch((err) => {
          console.error('Erreur sauvegarde programmations serveur:', err)
          setSyncStatus('error')
        })
    }, 1500)
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null
  const eventSchedules = schedules.filter((s) => s.eventId === selectedEventId)

  // Instant d'envoi effectif (UTC) d'un rappel, selon son timing
  const reminderSendTime = (
    sched: EventNotificationSchedule,
    event: Event | null
  ): number | null => {
    if (sched.timing === 'absolute') return sched.absoluteTime ?? null
    if (!event) return null
    return sched.relativeDelay ? relativeReminderTime(event.startAt, sched.relativeDelay) : null
  }

  // Un rappel est-il valide (programmé AVANT le début de l'événement) ?
  const isReminderValid = (sched: EventNotificationSchedule, event: Event | null): boolean => {
    const t = reminderSendTime(sched, event)
    if (t === null || !event) return false
    return t < event.startAt
  }

  const addReminder = () => {
    if (!selectedEvent) return
    if (eventSchedules.length >= MAX_REMINDERS_PER_EVENT) return

    // Choisir un délai relatif non encore utilisé par défaut
    const usedDelays = new Set(eventSchedules.map((s) => s.relativeDelay))
    const defaultDelay =
      RELATIVE_OPTIONS.find((o) => !usedDelays.has(o.value))?.value ?? '-3h'

    const newSched: EventNotificationSchedule = {
      id: `sched-${Date.now()}`,
      eventId: selectedEvent.id,
      enabled: true,
      title: `Rappel : ${selectedEvent.name}`,
      message: `${selectedEvent.name} approche !`,
      timing: 'relative',
      relativeDelay: defaultDelay,
      status: 'pending',
    }
    persistSchedules([...schedules, newSched])
  }

  const updateReminder = (id: string, changes: Partial<EventNotificationSchedule>) => {
    persistSchedules(schedules.map((s) => (s.id === id ? { ...s, ...changes } : s)))
  }

  const deleteReminder = (id: string) => {
    persistSchedules(schedules.filter((s) => s.id !== id))
  }

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>🔔 Notifications</h1>
        <p>Programmez jusqu'à 3 rappels par événement (heure belge)</p>
      </div>

      {/* Bandeau honnête : envoi push non activé */}
      <div className="push-disabled-banner">
        ⚠️ <strong>Envoi push non activé.</strong> Les programmations sont
        enregistrées côté serveur, mais aucun envoi réel n'est effectué tant que
        l'infrastructure Web Push (clés VAPID + Worker planifié) n'est pas
        configurée. Aucun envoi n'est simulé.
      </div>

      {events.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <p>Aucun événement disponible.</p>
          <p className="hint">
            Créez d'abord des événements dans le module <strong>📅 Événements</strong>.
          </p>
          {!isAuthenticated && (
            <p style={{ color: '#ff9800' }}>
              ℹ️ Connectez-vous pour charger vos événements depuis le serveur.
            </p>
          )}
        </div>
      ) : (
        <div className="notifications-container">
          {/* Colonne événements */}
          <div className="events-column">
            <h3>Événements</h3>
            <div className="events-mini-list">
              {events.map((evt) => {
                const count = schedules.filter((s) => s.eventId === evt.id).length
                return (
                  <button
                    key={evt.id}
                    className={`event-mini ${selectedEventId === evt.id ? 'active' : ''}`}
                    onClick={() => setSelectedEventId(evt.id)}
                  >
                    <span className="event-mini__name">{evt.name}</span>
                    <span className="event-mini__meta">
                      {formatBrussels(evt.startAt)} · {count}/{MAX_REMINDERS_PER_EVENT} rappels
                    </span>
                  </button>
                )
              })}
            </div>

            {isAuthenticated && (
              <p className="cms-sync-status" style={{ marginTop: 8, fontSize: '0.8em', opacity: 0.75 }}>
                {syncStatus === 'loading' && '⏳ Chargement…'}
                {syncStatus === 'saving' && '💾 Enregistrement serveur…'}
                {syncStatus === 'saved' && '✓ Enregistré sur le serveur'}
                {syncStatus === 'error' && '⚠️ Erreur de synchronisation'}
                {syncStatus === 'idle' && '☁️ Programmations synchronisées'}
              </p>
            )}
          </div>

          {/* Colonne rappels de l'événement sélectionné */}
          <div className="reminders-column">
            {selectedEvent ? (
              <>
                <div className="reminders-header">
                  <h3>Rappels — {selectedEvent.name}</h3>
                  <p className="reminders-event-date">
                    Début : {formatBrussels(selectedEvent.startAt)}
                  </p>
                  {selectedEvent.status === 'cancelled' && (
                    <p className="status-warning">
                      ⚠️ Événement annulé — les rappels resteront inactifs.
                    </p>
                  )}
                </div>

                {eventSchedules.length === 0 ? (
                  <p className="empty-state">Aucun rappel pour cet événement.</p>
                ) : (
                  <div className="reminders-list">
                    {eventSchedules.map((sched) => {
                      const sendTime = reminderSendTime(sched, selectedEvent)
                      const valid = isReminderValid(sched, selectedEvent)
                      return (
                        <div key={sched.id} className="reminder-card">
                          <div className="reminder-card__top">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={sched.enabled}
                                onChange={(e) =>
                                  updateReminder(sched.id, { enabled: e.target.checked })
                                }
                              />
                              <span>Actif</span>
                            </label>
                            <button
                              className="reminder-card__delete"
                              onClick={() => deleteReminder(sched.id)}
                              title="Supprimer ce rappel"
                            >
                              🗑️
                            </button>
                          </div>

                          <div className="cms-form__group">
                            <label className="cms-form__label">Titre</label>
                            <input
                              type="text"
                              value={sched.title}
                              onChange={(e) => updateReminder(sched.id, { title: e.target.value })}
                              className="cms-form__input"
                            />
                          </div>

                          <div className="cms-form__group">
                            <label className="cms-form__label">Message</label>
                            <textarea
                              value={sched.message}
                              onChange={(e) =>
                                updateReminder(sched.id, { message: e.target.value })
                              }
                              className="cms-form__textarea"
                            />
                          </div>

                          <div className="cms-form__group">
                            <label className="cms-form__label">Image (facultative)</label>
                            <input
                              type="text"
                              value={sched.imageUrl || ''}
                              onChange={(e) =>
                                updateReminder(sched.id, { imageUrl: e.target.value })
                              }
                              className="cms-form__input"
                              placeholder="https://..."
                            />
                          </div>

                          <div className="cms-form__group">
                            <label className="cms-form__label">Destination (tutoriel)</label>
                            <select
                              value={sched.tutorialId || selectedEvent.tutorialId || ''}
                              onChange={(e) =>
                                updateReminder(sched.id, { tutorialId: e.target.value })
                              }
                              className="cms-form__select"
                            >
                              <option value="">— Tutoriel de l'événement —</option>
                              {publishedTutorials.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="cms-form__group">
                            <label className="cms-form__label">Déclenchement</label>
                            <select
                              value={sched.timing}
                              onChange={(e) =>
                                updateReminder(sched.id, {
                                  timing: e.target.value as 'relative' | 'absolute',
                                })
                              }
                              className="cms-form__select"
                            >
                              <option value="relative">Relatif à l'événement</option>
                              <option value="absolute">Date/heure fixe</option>
                            </select>
                          </div>

                          {sched.timing === 'relative' ? (
                            <div className="cms-form__group">
                              <label className="cms-form__label">Délai avant l'événement</label>
                              <select
                                value={sched.relativeDelay || ''}
                                onChange={(e) =>
                                  updateReminder(sched.id, { relativeDelay: e.target.value })
                                }
                                className="cms-form__select"
                              >
                                {RELATIVE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="cms-form__group">
                              <label className="cms-form__label">Heure d'envoi (heure belge)</label>
                              <input
                                type="datetime-local"
                                value={utcToDatetimeLocalValue(sched.absoluteTime)}
                                onChange={(e) =>
                                  updateReminder(sched.id, {
                                    absoluteTime: datetimeLocalValueToUtc(e.target.value),
                                  })
                                }
                                className="cms-form__input"
                              />
                            </div>
                          )}

                          {/* Instant d'envoi calculé + validation */}
                          <div className="reminder-card__computed">
                            {sendTime !== null ? (
                              <>
                                <span>Envoi prévu : {formatBrussels(sendTime)}</span>
                                {!valid && (
                                  <span className="status-error">
                                    ⚠️ Ce rappel tombe après le début de l'événement — il
                                    ne sera pas programmé.
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="status-warning">Instant d'envoi indéterminé</span>
                            )}
                            <span className="reminder-card__status">
                              Statut :{' '}
                              {sched.status === 'pending' && 'En attente (envoi non activé)'}
                              {sched.status === 'sent' && 'Envoyé'}
                              {sched.status === 'failed' && 'Échec'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {eventSchedules.length < MAX_REMINDERS_PER_EVENT ? (
                  <button className="cms-btn" onClick={addReminder}>
                    ➕ Ajouter un rappel ({eventSchedules.length}/{MAX_REMINDERS_PER_EVENT})
                  </button>
                ) : (
                  <p className="hint">
                    Maximum de {MAX_REMINDERS_PER_EVENT} rappels atteint pour cet événement.
                  </p>
                )}

                {!isAuthenticated && (
                  <p style={{ marginTop: 12, color: '#ff9800', fontSize: '0.9em' }}>
                    ℹ️ Connectez-vous pour enregistrer les rappels sur le serveur.
                  </p>
                )}
              </>
            ) : (
              <p className="empty-state">Sélectionnez un événement.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
