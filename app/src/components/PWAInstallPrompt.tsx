import { useState, useEffect } from 'react'
import './PWAInstallPrompt.css'

/**
 * Composant pour afficher le prompt d'installation PWA
 * 
 * - Android : Affiche le prompt natif du navigateur
 * - iOS : Affiche un guide pour ajouter à l'écran d'accueil
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Détecter iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iosDetected = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(iosDetected)

    // Détecter si l'app est déjà installée
    if ((window.navigator as any).standalone === true) {
      setIsInstalled(true)
      return
    }

    // Événement beforeinstallprompt (Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
      setShowPrompt(false)
      setDeferredPrompt(null)
    } catch (err) {
      console.error('Installation PWA échouée:', err)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
  }

  // iOS : Afficher le guide après quelques secondes si l'utilisateur ne peut pas installer
  const handleIOSGuideClick = () => {
    setShowIOSGuide(true)
  }

  // Ne rien afficher si déjà installé
  if (isInstalled) {
    return null
  }

  // Prompt d'installation (Android)
  if (showPrompt && deferredPrompt && !isIOS) {
    return (
      <div className="pwa-prompt pwa-prompt--android">
        <div className="pwa-prompt__content">
          <div className="pwa-prompt__header">
            <h3 className="pwa-prompt__title">📱 Installer Lords Mobile Academy</h3>
            <button className="pwa-prompt__close" onClick={handleDismiss}>✕</button>
          </div>
          <p className="pwa-prompt__text">
            Installez l'application sur votre téléphone pour un accès rapide aux tutoriels.
          </p>
          <div className="pwa-prompt__actions">
            <button className="pwa-prompt__btn pwa-prompt__btn--primary" onClick={handleInstallClick}>
              Installer maintenant
            </button>
            <button className="pwa-prompt__btn pwa-prompt__btn--secondary" onClick={handleDismiss}>
              Plus tard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // iOS : Guide d'installation
  if (showIOSGuide && isIOS) {
    return (
      <div className="pwa-prompt pwa-prompt--ios">
        <div className="pwa-prompt__content">
          <div className="pwa-prompt__header">
            <h3 className="pwa-prompt__title">📱 Ajouter à l'écran d'accueil</h3>
            <button className="pwa-prompt__close" onClick={() => setShowIOSGuide(false)}>✕</button>
          </div>
          <div className="pwa-prompt__ios-guide">
            <p className="pwa-prompt__text">
              <strong>Sur iPhone ou iPad :</strong>
            </p>
            <ol className="pwa-prompt__steps">
              <li>Appuyez sur le bouton <strong>Partager</strong> en bas</li>
              <li>Faites défiler et sélectionnez <strong>« Sur l'écran d'accueil »</strong></li>
              <li>Confirmez en appuyant sur <strong>« Ajouter »</strong></li>
            </ol>
            <p className="pwa-prompt__note">
              L'application apparaîtra alors sur votre écran d'accueil comme une véritable application.
            </p>
          </div>
          <button className="pwa-prompt__btn pwa-prompt__btn--primary" onClick={() => setShowIOSGuide(false)}>
            Compris
          </button>
        </div>
      </div>
    )
  }

  // Bouton pour iOS (toujours visible si not installed)
  if (isIOS && !showIOSGuide) {
    return (
      <button className="pwa-install-button" onClick={handleIOSGuideClick} title="Ajouter à l'écran d'accueil">
        📱 Ajouter l'app
      </button>
    )
  }

  return null
}
