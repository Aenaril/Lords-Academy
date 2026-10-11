import { useState } from 'react'
import './App.css'
import HomePage from './pages/HomePage'
import TutorialPage from './pages/TutorialPage'
import AdminBarWrapper from './admin/AdminBarWrapper'

type PageType = 'home' | 'tutorial'

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home')
  const [selectedTutorialId, setSelectedTutorialId] = useState<string>('')

  const handleSelectTutorial = (tutorialId: string) => {
    setSelectedTutorialId(tutorialId)
    setCurrentPage('tutorial')
  }

  const handleReturnHome = () => {
    setCurrentPage('home')
    setSelectedTutorialId('')
  }

  return (
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
    </div>
  )
}

export default App
