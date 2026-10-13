import { useEffect, useRef } from 'react'
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
  const hasClosedDueToInvalidSessionRef = useRef(false)

  // ✅ Tous les hooks en premier (AVANT tout return conditionnel)

  // ✅ Gérer le nettoyage du défilement et les event listeners
  useEffect(() => {
    // N'activer que si vraiment ouvert + vérification terminée + authentification valide
    const shouldBlock = isOpen && !isVerifying && (!remoteConfigured || isAuthenticated)
    
    if (!shouldBlock) {
      // Restaurer défilement si le modal n'est pas censé être affiché
      document.body.style.overflow = 'auto'
      return
    }

    // Bloquer le défilement de la page
    document.body.style.overflow = 'hidden'

    // Gestionnaire Échap pour fermer le modal
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sessionStorage.setItem('lma_cms_open', 'false')
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'auto'
    }
  }, [isOpen, isVerifying, isAuthenticated, remoteConfigured, onClose])

  // ✅ Effet de fermeture si session devient invalide
  useEffect(() => {
    if (!isOpen) {
      hasClosedDueToInvalidSessionRef.current = false
      return
    }

    const shouldShowCms = !isVerifying && (!remoteConfigured || isAuthenticated)
    if (!shouldShowCms && !hasClosedDueToInvalidSessionRef.current) {
      // Session devenue invalide : fermer sans modifier le flag (on peut restaurer après reconnexion)
      hasClosedDueToInvalidSessionRef.current = true
      onClose()
    }
  }, [isOpen, isVerifying, isAuthenticated, remoteConfigured, onClose])

  // ✅ Déterminer si le CMS peut être affiché en sécurité
  const canDisplayCms = isOpen && !isVerifying && (!remoteConfigured || isAuthenticated)

  if (!canDisplayCms) {
    return null
  }

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
