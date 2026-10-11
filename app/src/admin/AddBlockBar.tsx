import { useState } from 'react'
import { useAdmin } from './AdminContext'
import type { ContentBlock } from '../data/tutorials'
import './AddBlockBar.css'

interface AddBlockBarProps {
  sectionUid: string
}

const BLOCK_TYPES: { type: ContentBlock['type']; label: string; icon: string }[] = [
  { type: 'text', label: 'Paragraphe', icon: '📝' },
  { type: 'image', label: 'Image', icon: '🖼' },
  { type: 'memo', label: 'Mémo', icon: '📌' },
  { type: 'quiz', label: 'Quiz', icon: '❓' },
  { type: 'comparison', label: 'Comparaison', icon: '⚖️' },
  { type: 'hero-image', label: 'Image immersive', icon: '🌄' }
]

/** Barre d'ajout de bloc en fin de section (mode édition uniquement). */
export default function AddBlockBar({ sectionUid }: AddBlockBarProps) {
  const { isAdminMode, isPreview, addBlock } = useAdmin()
  const [open, setOpen] = useState(false)

  if (!isAdminMode || isPreview) return null

  return (
    <div className="add-block-bar">
      {!open ? (
        <button className="add-block-bar__trigger" onClick={() => setOpen(true)}>
          + Ajouter un bloc pédagogique
        </button>
      ) : (
        <div className="add-block-bar__menu">
          {BLOCK_TYPES.map((b) => (
            <button
              key={b.type}
              className="add-block-bar__option"
              onClick={() => {
                addBlock(sectionUid, b.type)
                setOpen(false)
              }}
            >
              <span>{b.icon}</span> {b.label}
            </button>
          ))}
          <button className="add-block-bar__cancel" onClick={() => setOpen(false)}>
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}
