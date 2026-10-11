import { useState } from 'react'
import ContentBlockComponent from '../components/ContentBlock'
import { useAdmin } from './AdminContext'
import BlockEditor from './BlockEditor'
import type { EditableBlock } from './types'
import './EditableBlockWrapper.css'

interface EditableBlockWrapperProps {
  sectionUid: string
  block: EditableBlock
  isFirst: boolean
  isLast: boolean
}

/**
 * Enveloppe un bloc en mode admin : affiche le bouton crayon et les contrôles
 * (monter / descendre / supprimer). En aperçu ou hors mode admin, rend le bloc
 * tel quel.
 */
export default function EditableBlockWrapper({
  sectionUid,
  block,
  isFirst,
  isLast
}: EditableBlockWrapperProps) {
  const { isAdminMode, isPreview, moveBlock, removeBlock } = useAdmin()
  const [isEditing, setIsEditing] = useState(false)

  const showControls = isAdminMode && !isPreview

  if (!showControls) {
    return <ContentBlockComponent block={block} />
  }

  if (isEditing) {
    return (
      <div className="editable-block editable-block--editing">
        <BlockEditor
          sectionUid={sectionUid}
          block={block}
          onClose={() => setIsEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="editable-block">
      <div className="editable-block__toolbar">
        <button
          className="editable-block__btn editable-block__btn--edit"
          title="Modifier ce bloc"
          onClick={() => setIsEditing(true)}
        >
          ✏️
        </button>
        <button
          className="editable-block__btn"
          title="Monter"
          disabled={isFirst}
          onClick={() => moveBlock(sectionUid, block._uid, -1)}
        >
          ▲
        </button>
        <button
          className="editable-block__btn"
          title="Descendre"
          disabled={isLast}
          onClick={() => moveBlock(sectionUid, block._uid, 1)}
        >
          ▼
        </button>
        <button
          className="editable-block__btn editable-block__btn--del"
          title="Supprimer ce bloc"
          onClick={() => {
            if (confirm('Supprimer ce bloc ? (modification locale uniquement)')) {
              removeBlock(sectionUid, block._uid)
            }
          }}
        >
          🗑
        </button>
      </div>
      <div className="editable-block__content">
        <ContentBlockComponent block={block} />
      </div>
    </div>
  )
}
