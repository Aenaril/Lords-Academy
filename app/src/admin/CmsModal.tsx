/**
 * CMS Modal — Affiche le CMS dans une vraie fenêtre flottante
 * 
 * Utilise React Portal pour rendre au-dessus du document.body
 * Gère le z-index correct, le scroll de la page, et le focus
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import CmsIndex from './CmsIndex'
import './CmsModal.css'

interface CmsModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectTutorial?: (id: string) => void
}

export default function CmsModal({ isOpen, onClose, onSelectTutorial }: CmsModalProps) {
  // Bloquer le défilement de la page quand le CMS est ouvert
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'auto'
      }
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div className="cms-modal__backdrop" onClick={onClose}>
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
