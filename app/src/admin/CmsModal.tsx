import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAdmin } from './AdminContext'
import CmsIndex from './CmsIndex'
import './CmsModal.css'

interface CmsModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectTutorial?: (id: string) => void
}

export default function CmsModal({ isOpen, onClose, onSelectTutorial }: CmsModalProps) {
  const { isVerifying, isAuthenticated, remoteConfigured } = useAdmin()

  // ✅ Ne pas afficher le CMS si vérification en cours
  if (isVerifying || !isOpen) {
    return null
  }

  // ✅ Ne pas afficher le CMS si session invalide (après vérification)
  if (remoteConfigured && !isAuthenticated) {
    onClose() // Fermer immédiatement
    return null
  }

  // Bloquer le défilement de la page quand le CMS est ouvert
  useEffect(() => {
    if (isOpen && !isVerifying) {
      document.body.style.overflow = 'hidden'
      
      // Ajouter gestionnaire Échap pour fermer le modal
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          // ✅ Marquer comme fermé avant de fermer
          sessionStorage.setItem('lma_cms_open', 'false')
          onClose()
        }
      }
      
      document.addEventListener('keydown', handleEscape)
      
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = 'auto'
      }
    }
  }, [isOpen, isVerifying, onClose])

  return createPortal(
    <div 
      className="cms-modal__backdrop" 
      onClick={() => {
        // ✅ Clic extérieur : marquer comme fermé
        sessionStorage.setItem('lma_cms_open', 'false')
        onClose()
      }}
    >
      <div className="cms-modal__container" onClick={(e) => e.stopPropagation()}>
        <CmsIndex 
          onSelectTutorial={onSelectTutorial ?? (() => {})}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body
  )
}
