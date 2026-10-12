/**
 * Module CMS Événements
 *
 * Gère les événements du jeu (tournois, raids, etc.) :
 * - Création / modification / annulation / suppression
 * - Titre, description, date/heure (heure belge), date de fin facultative
 * - Tutoriel associé (parmi les tutoriels publiés)
 * - Statut : actif / annulé / terminé
 * - Persistance serveur (via /api/cms-storage/events)
 *
 * Les événements rendent possibles les programmations de notifications
 * (module Notifications).
 */

import { useState, useEffect, useRef } from 'react'
import type { Event } from './types'
import {
  loadEvents as loadEventsServer,
  saveEvents as saveEventsServer,
  CmsStorageError,
} from './cmsStorageClient'
import {
  utcToDatetimeLocalValue,
  datetimeLocalValueToUtc,
  formatBrussels,
} from './timezone'
import { usePublishedTutorials } from './usePublishedTutorials'
import './EventsModule.css'

interface EventsModuleProps {
  isAuthenticated?: boolean
}

const LS_KEY = 'cms:events:draft'

export default function EventsModule({ isAuthenticated = false }: EventsModuleProps) {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedTutorials = usePublishedTutorials()

  // Charger : cache local immédiat puis serveur
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      try {
        setEvents(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing événements (cache local):', e)
      }
    }

    if (isAuthenticated) {
      setSyncStatus('loading')
      loadEventsServer()
        .then((serverEvents) => {
          setEvents(serverEvents)
          localStorage.setItem(LS_KEY, JSON.stringify(serverEvents))
          setSyncStatus('idle')
        })
        .catch((err) => {
          if (err instanceof CmsStorageError && err.status === 401) {
            setSyncStatus('idle')
          } else {
            console.error('Erreur chargement événements serveur:', err)
            setSyncStatus('error')
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const saveEvents = (items: Event[]) => {
    setEvents(items)
    localStorage.setItem(LS_KEY, JSON.stringify(items))

    if (!isAuthenticated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSyncStatus('saving')
      saveEventsServer(items)
        .then(() => {
          setSyncStatus('saved')
          setTimeout(() => setSyncStatus('idle'), 2000)
        })
        .catch((err) => {
          console.error('Erreur sauvegarde événements serveur:', err)
          setSyncStatus('error')
        })
    }, 1500)
  }

  const createEvent = (): Event => {
    const now = Date.now()
    // Date par défaut : demain 20h (heure belge)
    const tomorrow = new Date(now + 86400000)
    const defaultStart = datetimeLocalValueToUtc(
      utcToDatetimeLocalValue(tomorrow.getTime()).replace(/T\d{2}:\d{2}/, 'T20:00')
    )!
    return {
      id: `evt-${now}`,
      name: 'Nouvel événement',
      description: '',
      startAt: defaultStart,
      tutorialId: publishedTutorials[0]?.id ?? '',
      status: 'active',
      createdAt: now,
      modifiedAt: now,
    }
  }

  const addEvent = () => {
    const evt = createEvent()
    const updated = [...events, evt]
    setSelectedId(evt.id)
    saveEvents(updated)
  }

  const updateEvent = (id: string, changes: Partial<Event>) => {
    const updated = events.map((e) =>
      e.id === id ? { ...e, ...changes, modifiedAt: Date.now() } : e
    )
    saveEvents(updated)
  }

  const deleteEvent = (id: string) => {
    if (!confirm('Supprimer définitivement cet événement ? Les rappels associés devront être retirés dans le module Notifications.')) {
      return
    }
    const updated = events.filter((e) => e.id !== id)
    setSelectedId(null)
    saveEvents(updated)
  }

  const cancelEvent = (id: string) => {
    updateEvent(id, { status: 'cancelled' })
  }

  const reactivateEvent = (id: string) => {
    updateEvent(id, { status: 'active' })
  }

  const selected = events.find((e) => e.id === selectedId)

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>📅 Événements</h1>
        <p>Planifiez les événements du jeu et associez-les à un tutoriel (heure belge)</p>
      </div>

      <div className="events-container">
        <div className="events-list-section">
          <div className="list-header">
            <h3>Événements</h3>
            <span className="count">{events.length}</span>
          </div>

          {events.length === 0 ? (
            <p className="empty-state">Aucun événement. Créez-en un.</p>
          ) : (
            <div className="events-list">
              {events.map((evt) => (
                <button
                  key={evt.id}
                  className={`event-item ${selectedId === evt.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(evt.id)}
                >
                  <div className="item-header">
                    <p className="item-title">{evt.name}</p>
                    <span className={`item-status status-${evt.status}`}>
                      {evt.status === 'active' && '✓ Actif'}
                      {evt.status === 'cancelled' && '✗ Annulé'}
                      {evt.status === 'completed' && '✓ Terminé'}
                    </span>
                  </div>
                  <p className="item-date">{formatBrussels(evt.startAt)}</p>
                </button>
              ))}
            </div>
          )}

          <button className="cms-btn" onClick={addEvent}>
            ➕ Nouvel événement
          </button>

          {isAuthenticated && (
            <p className="cms-sync-status" style={{ marginTop: 8, fontSize: '0.8em', opacity: 0.75 }}>
              {syncStatus === 'loading' && '⏳ Chargement depuis le serveur…'}
              {syncStatus === 'saving' && '💾 Enregistrement serveur…'}
              {syncStatus === 'saved' && '✓ Enregistré sur le serveur'}
              {syncStatus === 'error' && '⚠️ Erreur de synchronisation'}
              {syncStatus === 'idle' && '☁️ Événements synchronisés'}
            </p>
          )}
          {!isAuthenticated && (
            <p style={{ marginTop: 12, color: '#ff9800', fontSize: '0.9em' }}>
              ℹ️ Connectez-vous pour enregistrer les événements sur le serveur
            </p>
          )}
        </div>

        {selected && (
          <div className="event-editor">
            <h3>Édition</h3>

            <div className="cms-form">
              <div className="cms-form__group">
                <label className="cms-form__label">Nom</label>
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => updateEvent(selected.id, { name: e.target.value })}
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Description</label>
                <textarea
                  value={selected.description}
                  onChange={(e) => updateEvent(selected.id, { description: e.target.value })}
                  className="cms-form__textarea"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Début (heure belge)</label>
                <input
                  type="datetime-local"
                  value={utcToDatetimeLocalValue(selected.startAt)}
                  onChange={(e) => {
                    const utc = datetimeLocalValueToUtc(e.target.value)
                    if (utc !== undefined) updateEvent(selected.id, { startAt: utc })
                  }}
                  className="cms-form__input"
                />
                <small style={{ opacity: 0.7 }}>{formatBrussels(selected.startAt)}</small>
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Fin (facultative, heure belge)</label>
                <input
                  type="datetime-local"
                  value={utcToDatetimeLocalValue(selected.endAt)}
                  onChange={(e) =>
                    updateEvent(selected.id, {
                      endAt: datetimeLocalValueToUtc(e.target.value),
                    })
                  }
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Tutoriel associé</label>
                <select
                  value={selected.tutorialId}
                  onChange={(e) => updateEvent(selected.id, { tutorialId: e.target.value })}
                  className="cms-form__select"
                >
                  <option value="">— Choisir un tutoriel publié —</option>
                  {publishedTutorials.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Statut</label>
                <div className="event-status-actions">
                  {selected.status !== 'active' && (
                    <button
                      className="cms-btn cms-btn--secondary"
                      onClick={() => reactivateEvent(selected.id)}
                    >
                      Réactiver
                    </button>
                  )}
                  {selected.status === 'active' && (
                    <button
                      className="cms-btn cms-btn--secondary"
                      onClick={() => cancelEvent(selected.id)}
                    >
                      Annuler l'événement
                    </button>
                  )}
                </div>
              </div>

              <button
                className="cms-btn--danger cms-btn"
                onClick={() => deleteEvent(selected.id)}
              >
                🗑️ Supprimer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
