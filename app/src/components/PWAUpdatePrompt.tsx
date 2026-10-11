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
 * - Après activation d'une mise à jour : recharge la page
 * 
 * À noter :
 * - Le contenu pédagogique (tutoriels) a sa propre stratégie :
 *   - /api/published utilise NetworkFirst (toujours vérifier le réseau)
 *   - TutorialPage recharge toutes les 5 min
 *   - Un rechargement normal montre la nouvelle version
 * - Cette modale est pour les mises à jour de l'APPLICATION (JS, CSS, etc.)
 */

export default function PWAUpdatePrompt() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateMessage, setUpdateMessage] = useState('Une nouvelle version de l\'application est disponible.')

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
              // Déterminer le type de mise à jour
              const message = detectUpdateType()
              setUpdateMessage(message)
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

  const detectUpdateType = (): string => {
    // Si on peut accéder à l'historique, déterminer si c'est une grosse mise à jour ou petite
    // Pour l'instant, message générique
    return '🔄 Une nouvelle version de l\'application est disponible. ' +
           'Les tutoriels et l\'interface ont été mis à jour.'
  }

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
          {updateMessage}
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
          Une fois mise à jour activée, la page se rechargera automatiquement.
        </p>
      </div>
    </div>
  )
}

