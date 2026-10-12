/**
 * Module CMS Notifications (Modules G-H)
 * 
 * Fonctionnalités :
 * - Gérer abonnements push
 * - Créer schedules (3 rappels : -24h, -3h, -30m)
 * - Historique des envois
 * - Test notifications
 */

import { useState, useEffect } from 'react'
import { EventNotificationSchedule, NotificationSubscription, Event } from './types'
import './NotificationsModule.css'

export default function NotificationsModule() {
  const [schedules, setSchedules] = useState<EventNotificationSchedule[]>([])
  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [showNewScheduleForm, setShowNewScheduleForm] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  // Charger données
  useEffect(() => {
    const savedSchedules = localStorage.getItem('cms:push:schedules')
    const savedSubs = localStorage.getItem('cms:push:subscriptions')
    const savedEvents = localStorage.getItem('cms:events:draft')

    if (savedSchedules) {
      try {
        setSchedules(JSON.parse(savedSchedules))
      } catch (e) {
        console.error('Erreur parsing schedules:', e)
      }
    }
    if (savedSubs) {
      try {
        setSubscriptions(JSON.parse(savedSubs))
      } catch (e) {
        console.error('Erreur parsing subscriptions:', e)
      }
    }
    if (savedEvents) {
      try {
        setEvents(JSON.parse(savedEvents))
      } catch (e) {
        console.error('Erreur parsing events:', e)
      }
    }
  }, [])

  // Sauvegarder schedules
  const saveSchedules = (items: EventNotificationSchedule[]) => {
    setSchedules(items)
    localStorage.setItem('cms:push:schedules', JSON.stringify(items))
  }

  // Créer schedule par défaut (3 rappels)
  const createDefaultSchedules = (eventId: string, eventName: string) => {
    const newSchedules: EventNotificationSchedule[] = [
      {
        id: `sched-${Date.now()}-1`,
        eventId,
        enabled: true,
        title: `Rappel: ${eventName}`,
        message: `${eventName} aura lieu dans 24 heures`,
        timing: 'relative',
        relativeDelay: '-24h',
        status: 'pending',
      },
      {
        id: `sched-${Date.now()}-2`,
        eventId,
        enabled: true,
        title: `Rappel: ${eventName}`,
        message: `${eventName} aura lieu dans 3 heures`,
        timing: 'relative',
        relativeDelay: '-3h',
        status: 'pending',
      },
      {
        id: `sched-${Date.now()}-3`,
        eventId,
        enabled: true,
        title: `Rappel: ${eventName}`,
        message: `${eventName} débute dans 30 minutes`,
        timing: 'relative',
        relativeDelay: '-30m',
        status: 'pending',
      },
    ]
    return newSchedules
  }

  // Ajouter schedules pour événement
  const addSchedulesForEvent = (eventId: string) => {
    const event = events.find((e) => e.id === eventId)
    if (!event) return

    const existing = schedules.filter((s) => s.eventId === eventId)
    if (existing.length > 0) return // Déjà existe

    const newScheds = createDefaultSchedules(eventId, event.name)
    const updated = [...schedules, ...newScheds]
    saveSchedules(updated)
    setSelectedScheduleId(newScheds[0].id)
  }

  // Mettre à jour schedule
  const updateSchedule = (id: string, changes: Partial<EventNotificationSchedule>) => {
    const updated = schedules.map((s) => (s.id === id ? { ...s, ...changes } : s))
    saveSchedules(updated)
  }

  // Supprimer schedule
  const deleteSchedule = (id: string) => {
    const updated = schedules.filter((s) => s.id !== id)
    saveSchedules(updated)
    setSelectedScheduleId(null)
  }

  // Tester notification
  const sendTestNotification = async () => {
    if (!selectedScheduleId || !('Notification' in window)) return

    setTestStatus('sending')
    try {
      const schedule = schedules.find((s) => s.id === selectedScheduleId)
      if (!schedule) {
        setTestStatus('error')
        setTimeout(() => setTestStatus('idle'), 3000)
        return
      }

      // Demander permission si nécessaire
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          setTestStatus('error')
          setTimeout(() => setTestStatus('idle'), 3000)
          return
        }
      }

      if (Notification.permission === 'granted') {
        new Notification(schedule.title, {
          body: schedule.message,
          tag: `test-${Date.now()}`,
        })
        setTestStatus('success')
        setTimeout(() => setTestStatus('idle'), 3000)
      } else {
        setTestStatus('error')
        setTimeout(() => setTestStatus('idle'), 3000)
      }
    } catch (e) {
      console.error('Erreur notification test:', e)
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 3000)
    }
  }

  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId)
  // const schedulesForSelected = selectedSchedule
  //   ? schedules.filter((s) => s.eventId === selectedSchedule.eventId)
  //   : []

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>🔔 Notifications Push</h1>
        <p>Gérez la programmation des notifications (3 rappels par événement)</p>
      </div>

      <div className="notifications-container">
        <div className="schedules-section">
          <div className="section-header">
            <h3>Programmations</h3>
            <span className="badge">{schedules.length}</span>
          </div>

          {schedules.length === 0 ? (
            <div className="empty-state">
              <p>Aucune programmation.</p>
              <p className="hint">Créez d'abord des événements dans le module Annonces.</p>
            </div>
          ) : (
            <div className="schedules-list">
              {schedules.map((sched) => {
                const event = events.find((e) => e.id === sched.eventId)
                return (
                  <button
                    key={sched.id}
                    className={`schedule-item ${selectedScheduleId === sched.id ? 'active' : ''}`}
                    onClick={() => setSelectedScheduleId(sched.id)}
                  >
                    <div className="schedule-item__header">
                      <p className="schedule-item__event">{event?.name || 'Événement'}</p>
                      <span className={`schedule-status ${sched.status}`}>
                        {sched.status === 'pending' && '⏳ En attente'}
                        {sched.status === 'sent' && '✓ Envoyé'}
                        {sched.status === 'failed' && '✗ Erreur'}
                      </span>
                    </div>
                    <p className="schedule-item__timing">
                      {sched.timing === 'relative'
                        ? `${sched.relativeDelay}`
                        : `À ${new Date(sched.absoluteTime || 0).toLocaleTimeString()}`}
                    </p>
                  </button>
                )
              })}
            </div>
          )}

          {events.length > 0 && (
            <button className="cms-btn" onClick={() => setShowNewScheduleForm(true)}>
              ➕ Ajouter programmation
            </button>
          )}

          {showNewScheduleForm && (
            <div className="new-schedule-form">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addSchedulesForEvent(e.target.value)
                    setShowNewScheduleForm(false)
                  }
                }}
                className="cms-form__select"
              >
                <option value="">Choisir un événement...</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.name}
                  </option>
                ))}
              </select>
              <button
                className="cms-btn--secondary cms-btn"
                onClick={() => setShowNewScheduleForm(false)}
              >
                Annuler
              </button>
            </div>
          )}
        </div>

        {selectedSchedule && (
          <div className="schedule-editor">
            <h3>Édition Programmation</h3>

            <div className="cms-form">
              <div className="cms-form__group">
                <label className="cms-form__label">Titre notification</label>
                <input
                  type="text"
                  value={selectedSchedule.title}
                  onChange={(e) => updateSchedule(selectedSchedule.id, { title: e.target.value })}
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Message</label>
                <textarea
                  value={selectedSchedule.message}
                  onChange={(e) =>
                    updateSchedule(selectedSchedule.id, { message: e.target.value })
                  }
                  className="cms-form__textarea"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">URL image (optionnel)</label>
                <input
                  type="text"
                  value={selectedSchedule.imageUrl || ''}
                  onChange={(e) =>
                    updateSchedule(selectedSchedule.id, { imageUrl: e.target.value })
                  }
                  className="cms-form__input"
                  placeholder="https://..."
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Type timing</label>
                <select
                  value={selectedSchedule.timing}
                  onChange={(e) =>
                    updateSchedule(selectedSchedule.id, {
                      timing: e.target.value as 'relative' | 'absolute',
                    })
                  }
                  className="cms-form__select"
                >
                  <option value="relative">Relatif à l'événement</option>
                  <option value="absolute">Heure fixe</option>
                </select>
              </div>

              {selectedSchedule.timing === 'relative' ? (
                <div className="cms-form__group">
                  <label className="cms-form__label">Delay relatif</label>
                  <select
                    value={selectedSchedule.relativeDelay || ''}
                    onChange={(e) =>
                      updateSchedule(selectedSchedule.id, { relativeDelay: e.target.value })
                    }
                    className="cms-form__select"
                  >
                    <option value="-24h">24 heures avant</option>
                    <option value="-3h">3 heures avant</option>
                    <option value="-30m">30 minutes avant</option>
                    <option value="-1h">1 heure avant</option>
                    <option value="-2h">2 heures avant</option>
                    <option value="-6h">6 heures avant</option>
                    <option value="-12h">12 heures avant</option>
                  </select>
                </div>
              ) : (
                <div className="cms-form__group">
                  <label className="cms-form__label">Heure d'envoi</label>
                  <input
                    type="datetime-local"
                    value={
                      selectedSchedule.absoluteTime
                        ? new Date(selectedSchedule.absoluteTime).toISOString().slice(0, 16)
                        : ''
                    }
                    onChange={(e) =>
                      updateSchedule(selectedSchedule.id, {
                        absoluteTime: e.target.value ? new Date(e.target.value).getTime() : 0,
                      })
                    }
                    className="cms-form__input"
                  />
                </div>
              )}

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedSchedule.enabled}
                  onChange={(e) =>
                    updateSchedule(selectedSchedule.id, { enabled: e.target.checked })
                  }
                />
                <span>Activer cette programmation</span>
              </label>

              <div className="schedule-actions">
                <button className="cms-btn" onClick={sendTestNotification}>
                  📤 Tester notification
                </button>
                {testStatus === 'success' && <span className="status-success">✓ Envoyé!</span>}
                {testStatus === 'error' && <span className="status-error">✗ Erreur</span>}
              </div>

              <button
                className="cms-btn--danger cms-btn"
                onClick={() => deleteSchedule(selectedSchedule.id)}
              >
                🗑️ Supprimer
              </button>
            </div>
          </div>
        )}

        <div className="notifications-stats">
          <h3>Statistiques</h3>

          <div className="stat-card">
            <p className="stat-label">Abonnés</p>
            <p className="stat-value">{subscriptions.length}</p>
          </div>

          <div className="stat-card">
            <p className="stat-label">Programmations</p>
            <p className="stat-value">{schedules.length}</p>
          </div>

          <div className="stat-card">
            <p className="stat-label">Programmations Actives</p>
            <p className="stat-value">{schedules.filter((s) => s.enabled).length}</p>
          </div>

          <div className="stat-card">
            <p className="stat-label">Envoyées</p>
            <p className="stat-value">{schedules.filter((s) => s.status === 'sent').length}</p>
          </div>

          <div className="hint-box">
            <p>
              💡 <strong>Les notifications push</strong> sont envoyées depuis un Cloudflare Worker avec
              des clés VAPID configurées.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

