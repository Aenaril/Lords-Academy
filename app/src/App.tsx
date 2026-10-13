import { useState, useEffect } from 'react'
import './App.css'
import './components/NotificationButtonWrapper.css'
import HomePage from './pages/HomePage'
import TutorialPage from './pages/TutorialPage'
import AdminBarWrapper from './admin/AdminBarWrapper'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import { NotificationPermissionButton } from './components/NotificationPermissionButton'
import { AdminProvider } from './admin/AdminContext'
import { loadCmsConfigs } from './cms/CmsConfigLoader'
import { applyTheme } from './cms/ThemeManager'

type PageType = 'home' | 'tutorial'

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home')
  const [selectedTutorialId, setSelectedTutorialId] = useState<string>('dragon-arena')

  // ✅ Charger configs CMS au démarrage
  useEffect(() => {
    const initializeCms = async () => {
      try {
        const cmsConfig = await loadCmsConfigs()
        
        // Appliquer le thème
        if (cmsConfig.theme) {
          applyTheme(cmsConfig.theme)
          console.info('✅ Thème CMS appliqué au démarrage')
        }

        // Log les erreurs éventuelles
        if (cmsConfig.errors.length > 0) {
          console.warn('⚠️ Erreurs chargement CMS:', cmsConfig.errors)
        }
      } catch (err) {
        console.error('❌ Erreur initialisation CMS:', err)
      }
    }

    initializeCms()
  }, [])

  // Parser les query params au montage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tutorialId = params.get('tutorialId')
    if (tutorialId) {
      setSelectedTutorialId(tutorialId)
      setCurrentPage('tutorial')
    }
  }, [])

  const handleSelectTutorial = (tutorialId: string) => {
    setSelectedTutorialId(tutorialId)
    setCurrentPage('tutorial')
    // Mettre à jour l'URL pour permettre le bookmarking
    const url = new URL(window.location.href)
    url.searchParams.set('tutorialId', tutorialId)
    window.history.pushState({}, '', url)
  }

  const handleReturnHome = () => {
    setCurrentPage('home')
    // Nettoyer l'URL
    const url = new URL(window.location.href)
    url.searchParams.delete('tutorialId')
    window.history.pushState({}, '', url)
    // NB: on ne réinitialise pas selectedTutorialId, ce qui permet à l'utilisateur
    // de conserver son état d'édition en arrière-plan (même s'il retourne à l'accueil)
  }

  return (
    // AdminProvider enveloppe tout l'App pour que AdminBarWrapper
    // puisse accéder au contexte depuis la page d'accueil aussi
    <AdminProvider tutorialId={selectedTutorialId}>
      <div className="app">
        {currentPage === 'home' && (
          <HomePage onSelectTutorial={handleSelectTutorial} />
        )}
        {currentPage === 'tutorial' && selectedTutorialId && (
          <TutorialPage 
            tutorialId={selectedTutorialId} 
            onReturnHome={handleReturnHome}
          />
        )}
        <AdminBarWrapper onSelectTutorial={handleSelectTutorial} />
        <PWAInstallPrompt />
        <PWAUpdatePrompt />
        
        {/* ✅ Bouton notifications (repositionné pour mobile & desktop sans chevauchement) */}
        <div className="notification-button-wrapper">
          <NotificationPermissionButton vapidPublicKey={import.meta.env.VITE_VAPID_PUBLIC_KEY || ''} />
        </div>
      </div>
    </AdminProvider>
  )
}

export default App
