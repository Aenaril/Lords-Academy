import { useEffect, useState } from 'react'
import './PWAUpdatePrompt.css'

/**
 * Composant pour afficher les mises à jour PWA disponibles
 * 
 * Stratégie :
 * - Détecte les mises à jour du Service Worker
 * - Affiche une notification quand une mise à jour est prête
 * - L'utilisateur peut mettre à jour ou attendre
 */

export default function PWAUpdatePrompt() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)

  useEffect(() => {
    if (!navigator.serviceWorker) return

    // Vérifier les mises à jour du Service Worker
    const checkForUpdates = async () => {
      const registration = await navigator.serviceWorker.getRegistrations()

      for (const reg of registration) {
        // Vérifier les mises à jour
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Une nouvelle version est prête
              setShowUpdatePrompt(true)
            }
          })
        })

        // Vérifier immédiatement
        reg.update().catch(() => {
          // Silencieusement ignorer les erreurs
        })
      }
    }

    checkForUpdates()

    // Vérifier toutes les 60 secondes
    const interval = setInterval(checkForUpdates, 60000)

    return () => clearInterval(interval)
  }, [])

  const handleUpdate = () => {
    // Recharger la page pour appliquer la mise à jour
    window.location.reload()
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

