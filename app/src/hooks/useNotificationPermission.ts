/**
 * Hook pour gérer l'état des notifications push
 * 
 * ✅ Vérification initiale uniquement (pas de polling agressif)
 * ✅ Écoute les changements du navigateur (storagechange)
 * ✅ Utilise localStorage comme source de vérité
 */

import { useState, useEffect } from 'react'
import {
  isPushNotificationSupported,
  getNotificationState,
  isCurrentlySubscribed,
} from '../services/webPushService'

interface UseNotificationPermissionResult {
  isSupported: boolean
  permission: 'granted' | 'denied' | 'default'
  isSubscribed: boolean
  isLoading: boolean
}

export function useNotificationPermission(): UseNotificationPermissionResult {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<'granted' | 'denied' | 'default'>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      setIsLoading(true)

      const supported = isPushNotificationSupported()
      setIsSupported(supported)

      if (!supported) {
        setIsLoading(false)
        return
      }

      const perm = await getNotificationState()
      setPermission(perm)

      // ✅ Utiliser localStorage comme source de vérité
      const subscriptionId = localStorage.getItem('lma-subscription-id')
      if (subscriptionId) {
        setIsSubscribed(true)
      } else {
        // Vérifier si PushManager a une subscription (cas F5 ou localStorage corrompu)
        if (perm === 'granted') {
          const subscribed = await isCurrentlySubscribed()
          setIsSubscribed(subscribed)
        } else {
          setIsSubscribed(false)
        }
      }

      setIsLoading(false)
    }

    check()

    // ✅ Écouter les changements localStorage (autre onglet/tab)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'lma-subscription-id') {
        setIsSubscribed(!!event.newValue)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return { isSupported, permission, isSubscribed, isLoading }
}
