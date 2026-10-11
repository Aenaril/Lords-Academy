import { useState } from 'react'
import { useAdmin } from './AdminContext'
import { BLOCK_DEFINITIONS } from '../blocks/registry'
import './AddBlockBar.css'

interface AddBlockBarProps {
  sectionUid: string
}

/**
 * Types de blocs proposés à l'ajout. Dérivés du registre central
 * (`app/src/blocks/registry.ts`), source unique de vérité — l'ordre, les
 * libellés et les icônes y sont définis une seule fois.
 */
const BLOCK_TYPES = BLOCK_DEFINITIONS.map(({ type, label, icon }) => ({ type, label, icon }))

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
