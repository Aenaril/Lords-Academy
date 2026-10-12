/**
 * Composant Prompt d'inscription aux notifications push
 * 
 * Affiche un prompt discret pour proposer l'inscription aux notifications
 * Peut être intégré à l'accueil ou au footer
 */

import { useState, useEffect } from 'react'
import { canUseNotifications, requestNotificationPermission, subscribeToPush } from '../utils/notifications'
import './NotificationSubscribePrompt.css'

export default function NotificationSubscribePrompt() {
  const [shown, setShown] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    // Vérifier si on devrait montrer le prompt
    const checkAndShowPrompt = async () => {
      if (!canUseNotifications() && 'Notification' in window && Notification.permission !== 'denied') {
        // Attendre un peu avant de montrer pour ne pas déranger
        setTimeout(() => {
          setShown(true)
        }, 3000)
      }
    }

    checkAndShowPrompt()
  }, [])

  const handleSubscribe = async () => {
    setSubscribing(true)

    try {
      const granted = await requestNotificationPermission()
      if (granted) {
        await subscribeToPush()
        setSubscribed(true)
        setShown(false)

        // Cacher après 3s
        setTimeout(() => {
          setSubscribed(false)
        }, 3000)
      }
    } catch (err) {
      console.error('Erreur inscription:', err)
    } finally {
      setSubscribing(false)
    }
  }

  if (!shown && !subscribed) {
    return null
  }

  return (
    <div className="notification-prompt" style={{ display: shown || subscribed ? 'flex' : 'none' }}>
      {subscribed ? (
        <div className="notification-prompt__message notification-prompt__success">
          <span>✓ Inscrit aux notifications!</span>
        </div>
      ) : (
        <>
          <div className="notification-prompt__content">
            <p className="notification-prompt__title">🔔 Rester informé</p>
            <p className="notification-prompt__text">Recevez les annonces et rappels d'événements</p>
          </div>
          <div className="notification-prompt__actions">
            <button
              className="notification-prompt__btn notification-prompt__btn--yes"
              onClick={handleSubscribe}
              disabled={subscribing}
            >
              {subscribing ? '...' : 'Oui'}
            </button>
            <button className="notification-prompt__btn notification-prompt__btn--no" onClick={() => setShown(false)}>
              Non merci
            </button>
          </div>
        </>
      )}
    </div>
  )
}

