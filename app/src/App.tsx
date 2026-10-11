import { useState } from 'react'
import './App.css'
import HomePage from './pages/HomePage'
import TutorialPage from './pages/TutorialPage'
import AdminBarWrapper from './admin/AdminBarWrapper'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import { AdminProvider } from './admin/AdminContext'

type PageType = 'home' | 'tutorial'

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home')
  const [selectedTutorialId, setSelectedTutorialId] = useState<string>('dragon-arena')

  const handleSelectTutorial = (tutorialId: string) => {
    setSelectedTutorialId(tutorialId)
    setCurrentPage('tutorial')
  }

  const handleReturnHome = () => {
    setCurrentPage('home')
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
        <AdminBarWrapper />
        <PWAInstallPrompt />
        <PWAUpdatePrompt />
      </div>
    </AdminProvider>
  )
}

export default App
