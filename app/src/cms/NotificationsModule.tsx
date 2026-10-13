/**
 * Module CMS Notifications — Programmation autonome des rappels
 *
 * À partir de l'ÉTAPE 3 :
 * - Les notifications sont AUTONOMES (plus dépendantes des Événements)
 * - Chaque notification a un titre, un message, une image
 * - Jusqu'à 3 rappels indépendants par notification (relatifs à un instant absolu)
 * - L'instant absolu est défini en heure belge (Europe/Brussels timezone)
 * - Pas de lien obligatoire à un événement
 * 
 * Persistance : côté serveur (/api/cms-storage)
 * Envoi réel : DÉSACTIVÉ (Web Push non configuré)
 */

import { useState, useEffect, useRef } from 'react'
import type { EventNotificationSchedule, NotificationReminder } from './types'
import {
  loadNotificationSchedules as loadSchedulesServer,
  saveNotificationSchedules as saveSchedulesServer,
  loadEvents,
  CmsStorageError,
} from './cmsStorageClient'
import {
  utcToDatetimeLocalValue,
  datetimeLocalValueToUtc,
  formatBrussels,
} from './timezone'
import { migrateNotifications } from './notificationsMigration'
import { usePublishedTutorials } from './usePublishedTutorials'
import './NotificationsModule.css'

interface NotificationsModuleProps {
  isAuthenticated?: boolean
}

const LS_KEY = 'cms:notifications'
const MAX_REMINDERS_PER_NOTIFICATION = 3

const RELATIVE_OPTIONS = [
  { value: '-24h', label: '24 heures avant' },
  { value: '-12h', label: '12 heures avant' },
  { value: '-6h', label: '6 heures avant' },
  { value: '-3h', label: '3 heures avant' },
  { value: '-1h', label: '1 heure avant' },
  { value: '-30m', label: '30 minutes avant' },
]

export default function NotificationsModule({ isAuthenticated = false }: NotificationsModuleProps) {
  const [notifications, setNotifications] = useState<EventNotificationSchedule[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedTutorials = usePublishedTutorials()

  // Charger programmations
  useEffect(() => {
    const savedNotifs = localStorage.getItem(LS_KEY)
    if (savedNotifs) {
      try {
        setNotifications(JSON.parse(savedNotifs))
      } catch (e) {
        console.error('Erreur parsing notifications (cache local):', e)
      }
    }

    if (isAuthenticated) {
      setSyncStatus('loading')
      Promise.all([loadSchedulesServer(), loadEvents()])
        .then(([serverNotifs, serverEvents]) => {
          // Migration non-destructive : convertir anciennes notifications
          const migratedNotifs = migrateNotifications(serverNotifs, serverEvents)

          setNotifications(migratedNotifs)
          localStorage.setItem(LS_KEY, JSON.stringify(migratedNotifs))
          if (migratedNotifs.length > 0 && !selectedId) {
            setSelectedId(migratedNotifs[0].id)
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

  const persistNotifications = (items: EventNotificationSchedule[]) => {
    setNotifications(items)
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
          console.error('Erreur sauvegarde notifications serveur:', err)
          setSyncStatus('error')
        })
    }, 1500)
  }

  const selected = notifications.find((n) => n.id === selectedId) || null

  const createNotification = (): EventNotificationSchedule => {
    const now = Date.now()
    return {
      id: `notif-${now}`,
      enabled: true,
      title: 'Nouvelle notification',
      message: 'Contenu du message',
      absoluteTime: now,
      relativeReminders: [],
      createdAt: now,
      modifiedAt: now,
    }
  }

  const addNotification = () => {
    const notif = createNotification()
    const updated = [...notifications, notif]
    setSelectedId(notif.id)
    persistNotifications(updated)
  }

  const updateNotification = (id: string, changes: Partial<EventNotificationSchedule>) => {
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, ...changes, modifiedAt: Date.now() } : n
    )
    persistNotifications(updated)
  }

  const deleteNotification = (id: string) => {
    if (!confirm('Supprimer définitivement cette notification ?')) return
    const updated = notifications.filter((n) => n.id !== id)
    setSelectedId(null)
    persistNotifications(updated)
  }

  const addReminder = () => {
    if (!selected) return
    if (selected.relativeReminders.length >= MAX_REMINDERS_PER_NOTIFICATION) return

    // Défaut : '-3h'
    const newReminder: NotificationReminder = {
      id: `rem-${Date.now()}`,
      enabled: true,
      relativeDelay: '-3h',
      status: 'pending',
    }
    updateNotification(selected.id, {
      relativeReminders: [...selected.relativeReminders, newReminder],
    })
  }

  const updateReminder = (reminderId: string, changes: Partial<NotificationReminder>) => {
    if (!selected) return
    const updated = selected.relativeReminders.map((r) =>
      r.id === reminderId ? { ...r, ...changes } : r
    )
    updateNotification(selected.id, { relativeReminders: updated })
  }

  const deleteReminder = (reminderId: string) => {
    if (!selected) return
    const updated = selected.relativeReminders.filter((r) => r.id !== reminderId)
    updateNotification(selected.id, { relativeReminders: updated })
  }

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>🔔 Notifications</h1>
        <p>Programmez des notifications autonomes avec jusqu'à 3 rappels (heure belge)</p>
      </div>

      {/* Bandeau honnête : envoi push non activé */}
      <div className="push-disabled-banner">
        ⚠️ <strong>Envoi push non activé.</strong> Les notifications sont
        enregistrées côté serveur, mais aucun envoi réel n'est effectué tant que
        l'infrastructure Web Push (clés VAPID + Worker planifié) n'est pas
        configurée. Aucun envoi n'est simulé.
      </div>

      <div className="notifications-container">
        <div className="notifications-list-section">
          <div className="list-header">
            <h3>Notifications</h3>
            <span className="count">{notifications.length}</span>
          </div>

          {notifications.length === 0 ? (
            <p className="empty-state">Aucune notification. Créez-en une.</p>
          ) : (
            <div className="notifications-list">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  className={`notif-item ${selectedId === notif.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(notif.id)}
                >
                  <div className="item-header">
                    <p className="item-title">{notif.title}</p>
                    <span className={`item-status ${notif.enabled ? 'status-active' : 'status-inactive'}`}>
                      {notif.enabled ? '✓ Active' : '○ Inactive'}
                    </span>
                  </div>
                  <p className="item-date">
                    {formatBrussels(notif.absoluteTime)} · {notif.relativeReminders.length}/{MAX_REMINDERS_PER_NOTIFICATION} rappels
                  </p>
                </button>
              ))}
            </div>
          )}

          <button className="cms-btn" onClick={addNotification}>
            ➕ Nouvelle notification
          </button>

          {isAuthenticated && (
            <p className="cms-sync-status" style={{ marginTop: 8, fontSize: '0.8em', opacity: 0.75 }}>
              {syncStatus === 'loading' && '⏳ Chargement depuis le serveur…'}
              {syncStatus === 'saving' && '💾 Enregistrement serveur…'}
              {syncStatus === 'saved' && '✓ Enregistré sur le serveur'}
              {syncStatus === 'error' && '⚠️ Erreur de synchronisation'}
              {syncStatus === 'idle' && '☁️ Notifications synchronisées'}
            </p>
          )}
          {!isAuthenticated && (
            <p style={{ marginTop: 12, color: '#ff9800', fontSize: '0.9em' }}>
              ℹ️ Connectez-vous pour enregistrer les notifications sur le serveur
            </p>
          )}
        </div>

        {selected && (
          <div className="notification-editor">
            <h3>Édition — {selected.title}</h3>

            <div className="cms-form">
              <div className="cms-form__group">
                <label className="cms-form__label">Titre</label>
                <input
                  type="text"
                  value={selected.title}
                  onChange={(e) => updateNotification(selected.id, { title: e.target.value })}
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Message</label>
                <textarea
                  value={selected.message}
                  onChange={(e) => updateNotification(selected.id, { message: e.target.value })}
                  className="cms-form__textarea"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Image (facultative)</label>
                <input
                  type="text"
                  value={selected.imageUrl || ''}
                  onChange={(e) => updateNotification(selected.id, { imageUrl: e.target.value })}
                  className="cms-form__input"
                  placeholder="https://..."
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Tutoriel de destination (facultatif)</label>
                <select
                  value={selected.tutorialId || ''}
                  onChange={(e) => updateNotification(selected.id, { tutorialId: e.target.value })}
                  className="cms-form__select"
                >
                  <option value="">— Aucun tutoriel —</option>
                  {publishedTutorials.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">
                  Date/heure d'envoi (heure belge) — Instant de base pour les rappels
                </label>
                <input
                  type="datetime-local"
                  value={utcToDatetimeLocalValue(selected.absoluteTime)}
                  onChange={(e) => {
                    const utc = datetimeLocalValueToUtc(e.target.value)
                    if (utc !== undefined) updateNotification(selected.id, { absoluteTime: utc })
                  }}
                  className="cms-form__input"
                />
                <small style={{ opacity: 0.7 }}>{formatBrussels(selected.absoluteTime)}</small>
              </div>

              <div className="cms-form__group">
                <label>
                  <input
                    type="checkbox"
                    checked={selected.enabled}
                    onChange={(e) => updateNotification(selected.id, { enabled: e.target.checked })}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Notification active</span>
                </label>
              </div>

              {/* Rappels relatifs */}
              <div className="reminders-section">
                <h4>Rappels relatifs à l'instant de base</h4>
                <p className="hint">
                  Jusqu'à {MAX_REMINDERS_PER_NOTIFICATION} rappels. Chacun déclenche un envoi X heures/minutes avant l'instant de base.
                </p>

                {selected.relativeReminders.length === 0 ? (
                  <p className="empty-state">Aucun rappel.</p>
                ) : (
                  <div className="reminders-list">
                    {selected.relativeReminders.map((reminder) => (
                      <div key={reminder.id} className="reminder-card">
                        <div className="reminder-card__top">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={reminder.enabled}
                              onChange={(e) =>
                                updateReminder(reminder.id, { enabled: e.target.checked })
                              }
                            />
                            <span>Rappel actif</span>
                          </label>
                          <button
                            className="reminder-card__delete"
                            onClick={() => deleteReminder(reminder.id)}
                            title="Supprimer ce rappel"
                          >
                            🗑️
                          </button>
                        </div>

                        <div className="cms-form__group">
                          <label className="cms-form__label">Délai avant l'instant de base</label>
                          <select
                            value={reminder.relativeDelay || ''}
                            onChange={(e) =>
                              updateReminder(reminder.id, { relativeDelay: e.target.value })
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

                        <div className="reminder-card__status">
                          Statut :{' '}
                          {reminder.status === 'pending' && 'En attente (envoi non activé)'}
                          {reminder.status === 'sent' && 'Envoyé'}
                          {reminder.status === 'failed' && 'Échec'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selected.relativeReminders.length < MAX_REMINDERS_PER_NOTIFICATION ? (
                  <button className="cms-btn" onClick={addReminder}>
                    ➕ Ajouter un rappel ({selected.relativeReminders.length}/{MAX_REMINDERS_PER_NOTIFICATION})
                  </button>
                ) : (
                  <p className="hint">
                    Maximum de {MAX_REMINDERS_PER_NOTIFICATION} rappels atteint pour cette notification.
                  </p>
                )}
              </div>

              <button
                className="cms-btn--danger cms-btn"
                onClick={() => deleteNotification(selected.id)}
              >
                🗑️ Supprimer la notification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
