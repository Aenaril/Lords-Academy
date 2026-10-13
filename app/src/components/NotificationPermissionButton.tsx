/**
 * Bouton de consentement notifications push
 * 
 * - Détecte le support navigateur
 * - Demande permission
 * - Gère l'état d'abonnement
 * - Affiche restrictions (ex: iPhone)
 * - Désabonnement possible
 */

import { useState, useEffect } from 'react'
import {
  isPushNotificationSupported,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getNotificationState,
  isCurrentlySubscribed,
} from '../services/webPushService'

interface Props {
  vapidPublicKey: string
}

type PermissionState = 'granted' | 'denied' | 'default'
type SubscriptionState = 'idle' | 'loading' | 'subscribed' | 'error' | 'not-supported'

export function NotificationPermissionButton({ vapidPublicKey }: Props) {
  const [permissionState, setPermissionState] = useState<PermissionState>('default')
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isBrowserUnsupported, setIsBrowserUnsupported] = useState(false)

  // ✅ Initialiser l'état au montage
  useEffect(() => {
    const init = async () => {
      // Vérifier support navigateur
      const supported = isPushNotificationSupported()
      if (!supported) {
        setIsBrowserUnsupported(true)
        setSubscriptionState('not-supported')
        return
      }

      // Déterminer les permissions actuelles
      const permission = await getNotificationState()
      setPermissionState(permission)

      // Vérifier si déjà abonné
      if (permission === 'granted') {
        const subscribed = await isCurrentlySubscribed()
        if (subscribed) {
          setSubscriptionState('subscribed')
        }
      }
    }

    init()
  }, [])

  // ✅ Demander permission et s'abonner
  const handleSubscribe = async () => {
    if (!isPushNotificationSupported()) {
      setErrorMessage('Notifications non supportées')
      return
    }

    // ✅ Vérifier VAPID
    if (!vapidPublicKey) {
      setSubscriptionState('error')
      setErrorMessage('Clé VAPID manquante (configuration requise)')
      return
    }

    setSubscriptionState('loading')
    setErrorMessage('')

    // Demander permission si pas encore
    if (permissionState !== 'granted') {
      const result = await requestNotificationPermission()
      setPermissionState(result)

      if (result !== 'granted') {
        setSubscriptionState('error')
        setErrorMessage('Permission refusée')
        return
      }
    }

    // S'abonner
    const response = await subscribeToPushNotifications(vapidPublicKey)

    if (response.ok && response.subscriptionId && response.revocationSecret) {
      // ✅ SAUVEGARDER subscriptionId + revocationSecret (CRITIQUE)
      localStorage.setItem('lma-subscription-id', response.subscriptionId)
      localStorage.setItem('lma-revocation-secret', response.revocationSecret)
      setSubscriptionState('subscribed')
      setErrorMessage('')
    } else {
      setSubscriptionState('error')
      setErrorMessage(response.error || 'Erreur lors de l\'abonnement')
    }
  }

  // ✅ Désabonner
  const handleUnsubscribe = async () => {
    setSubscriptionState('loading')
    setErrorMessage('')

    // Récupérer l'ID depuis la clé locale
    const subscriptionId = localStorage.getItem('lma-subscription-id')

    if (!subscriptionId) {
      setSubscriptionState('idle')
      localStorage.removeItem('lma-revocation-secret')
      return
    }

    const response = await unsubscribeFromPushNotifications(subscriptionId)

    if (response.ok) {
      setSubscriptionState('idle')
      localStorage.removeItem('lma-subscription-id')
      localStorage.removeItem('lma-revocation-secret')  // ✅ Supprimer aussi le secret
      setErrorMessage('')
    } else {
      setSubscriptionState('error')
      setErrorMessage(response.error || 'Erreur lors du désabonnement')
    }
  }

  // ✅ Rendu selon l'état
  if (isBrowserUnsupported) {
    return (
      <div style={{ padding: '1rem', backgroundColor: '#f5f5f0' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
          ⓘ Notifications non disponibles sur votre appareil ou navigateur.
          <br />
          <small>
            Sur iPhone/iPad: Web Push requiert Safari 16.1+ avec l'app installée sur l'écran d'accueil.
            Sur macOS Safari: Web Push est supporté.
          </small>
        </p>
      </div>
    )
  }

  if (subscriptionState === 'loading') {
    return (
      <button
        disabled
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#ccc',
          border: 'none',
          borderRadius: '4px',
          cursor: 'not-allowed',
          fontSize: '0.95rem',
        }}
      >
        Chargement...
      </button>
    )
  }

  if (subscriptionState === 'subscribed') {
    // ✅ Vérifier VRAIMENT : localStorage + PushManager
    const hasSecret = localStorage.getItem('lma-revocation-secret')
    if (!hasSecret) {
      // localStorage corrompu = pas vraiment abonné
      setSubscriptionState('error')
      setErrorMessage('État local corrompu (secret manquant)')
      return
    }

    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>✓ Notifications activées</span>
        <button
          onClick={handleUnsubscribe}
          style={{
            padding: '0.4rem 0.8rem',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Désactiver
        </button>
      </div>
    )
  }

  if (subscriptionState === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ color: '#f44336', margin: 0, fontSize: '0.9rem' }}>
          ✗ {errorMessage}
        </p>
        <button
          onClick={handleSubscribe}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#D84D00',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  // État par défaut : offrir l'abonnement
  return (
    <button
      onClick={handleSubscribe}
      style={{
        padding: '0.5rem 1rem',
        backgroundColor: '#D84D00',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.95rem',
        fontWeight: 'bold',
      }}
    >
      🔔 Activer les notifications
    </button>
  )
}
