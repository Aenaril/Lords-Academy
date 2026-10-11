import { useEffect, useState } from 'react'
import './PWAUpdatePrompt.css'

/**
 * Composant pour afficher les mises à jour PWA disponibles
 * 
 * Stratégie :
 * - Détecte les mises à jour du Service Worker via l'événement 'updatefound'
 * - Affiche une notification quand une nouvelle version est prête
 * - L'utilisateur peut mettre à jour immédiatement ou différer
 * - Vérifie aussi périodiquement (toutes les 60s) pour plus de fiabilité
 */

export default function PWAUpdatePrompt() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!navigator.serviceWorker) return

    let checkTimeout: number

    const setupUpdateListener = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()

      for (const reg of registrations) {
        // Écouter l'événement 'updatefound' (nouvelle version détectée)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            // Quand le nouveau worker est 'installed' ET qu'il y a un controller actif
            // = une mise à jour est disponible (swap en attente)
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setShowUpdatePrompt(true)
              setUpdateRegistration(reg)
            }
          })
        })

        // Vérifier immédiatement (au cas où une mise à jour serait déjà prête)
        reg.update().catch(() => {
          /* silencieusement ignorer les erreurs */
        })
      }

      // Vérifier toutes les 60 secondes (fallback pour détection tardive)
      checkTimeout = window.setInterval(async () => {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const reg of regs) {
          reg.update().catch(() => {
            /* silencieusement ignorer */
          })
        }
      }, 60000)
    }

    setupUpdateListener()

    return () => {
      if (checkTimeout) clearInterval(checkTimeout)
    }
  }, [])

  const handleUpdate = () => {
    if (!updateRegistration) return

    // Dire au nouveau worker qu'il peut prendre le contrôle maintenant
    const newWorker = updateRegistration.installing || updateRegistration.waiting
    if (newWorker) {
      newWorker.postMessage({ type: 'SKIP_WAITING' })
    }

    // Écouter le changement de contrôleur et recharger
    let reloadListener = () => {
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', reloadListener)

    // Fallback : recharger après 1s si rien ne s'est passé
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', reloadListener)
      window.location.reload()
    }, 1000)
  }

  const handleDismiss = () => {
    setShowUpdatePrompt(false)
  }

  if (!showUpdatePrompt) {
    return null
  }

  return (
    <div className="pwa-update-prompt">
      <div className="pwa-update-prompt__content">
        <div className="pwa-update-prompt__header">
          <h3 className="pwa-update-prompt__title">🔄 Mise à jour disponible</h3>
          <button className="pwa-update-prompt__close" onClick={handleDismiss}>✕</button>
        </div>
        <p className="pwa-update-prompt__text">
          Une nouvelle version de Lords Mobile Academy est disponible. 
          Les tutoriels et contenus ont été mis à jour.
        </p>
        <div className="pwa-update-prompt__actions">
          <button className="pwa-update-prompt__btn pwa-update-prompt__btn--primary" onClick={handleUpdate}>
            Mettre à jour maintenant
          </button>
          <button className="pwa-update-prompt__btn pwa-update-prompt__btn--secondary" onClick={handleDismiss}>
            Plus tard
          </button>
        </div>
        <p className="pwa-update-prompt__note">
          La mise à jour s'appliquera au prochain rechargement.
        </p>
      </div>
    </div>
  )
}

