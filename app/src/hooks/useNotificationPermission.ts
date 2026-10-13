/**
 * Hook pour gérer l'état des notifications push
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

      if (perm === 'granted') {
        const subscribed = await isCurrentlySubscribed()
        setIsSubscribed(subscribed)
      }

      setIsLoading(false)
    }

    check()

    // Rafraîchir l'état toutes les 5 secondes
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  return { isSupported, permission, isSubscribed, isLoading }
}
