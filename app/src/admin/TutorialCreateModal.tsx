import { useState } from 'react'
import './TutorialCreateModal.css'

interface TutorialCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (tutorialId: string) => void
}

const CATEGORIES = [
  'Combats',
  'Formations',
  'Événements',
  'Héros',
  'Stratégie',
  'Économie',
  'Guildes',
  'Autre'
]

export default function TutorialCreateModal({ isOpen, onClose, onCreated }: TutorialCreateModalProps) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Combats')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      setError('Le titre ne peut pas être vide')
      return
    }

    if (title.length > 100) {
      setError('Le titre est trop long (max 100 caractères)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/tutorialCreate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'lma-admin'
        },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim()
        }),
        credentials: 'include'
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Erreur lors de la création')
        return
      }

      if (data.ok && data.tutorialId) {
        // Succès : redirection
        setTitle('')
        setCategory('Combats')
        onCreated(data.tutorialId)
        onClose()
      } else {
        setError(data.error || 'Erreur inconnue')
      }
    } catch (err) {
      setError((err as any).message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="tutorial-create-modal-overlay" onClick={onClose}>
      <div className="tutorial-create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-create-modal__header">
          <h2>Créer un tutoriel</h2>
          <button
            className="tutorial-create-modal__close"
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="tutorial-create-modal__form">
          <div className="form-group">
            <label htmlFor="title">Titre du tutoriel *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Composition Dragon Arena"
              disabled={loading}
              maxLength={100}
              autoFocus
            />
            <span className="form-group__counter">{title.length}/100</span>
          </div>

          <div className="form-group">
            <label htmlFor="category">Catégorie *</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={loading}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="tutorial-create-modal__footer">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn--secondary"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="btn btn--primary"
            >
              {loading ? 'Création en cours...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
