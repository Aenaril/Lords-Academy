import { useState, useEffect } from 'react'
import { useAdmin } from './AdminContext'
import './MyTutorialsPanel.css'

interface MyTutorialsPanelProps {
  onSelectTutorial: (tutorialId: string) => void
  onCreateNew: () => void
  onClose: () => void
}

interface TutorialItem {
  id: string
  title?: string
  category?: string
  status?: 'draft' | 'published'
  lastModified?: string
}

export default function MyTutorialsPanel({ 
  onSelectTutorial, 
  onCreateNew, 
  onClose 
}: MyTutorialsPanelProps) {
  const [tutorials, setTutorials] = useState<TutorialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { tutorial: currentTutorial } = useAdmin()

  useEffect(() => {
    const loadTutorials = async () => {
      try {
        setLoading(true)
        setError(null)

        // Charger la liste des IDs
        const response = await fetch('/api/tutorialIds', {
          headers: { 'X-Requested-With': 'lma-admin' },
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Impossible de charger la liste')
        }

        const data = await response.json()
        const tutorialIds = data.tutorialIds || []

        // Pour chaque ID, récupérer les métadonnées
        // Actuellement : utiliser AdminContext pour charger chaque tutoriel
        // (ce serait mieux d'avoir un endpoint batch, mais réutiliser existant)
        
        const items: TutorialItem[] = tutorialIds.map((id: string) => ({
          id,
          title: id, // Fallback : utiliser l'ID si titre indisponible
          category: '?',
          status: 'draft' as const,
          lastModified: '—'
        }))

        setTutorials(items)
      } catch (err) {
        setError((err as any).message || 'Erreur réseau')
        setTutorials([])
      } finally {
        setLoading(false)
      }
    }

    loadTutorials()
  }, [])

  const handleEditTutorial = (tutorialId: string) => {
    onSelectTutorial(tutorialId)
    onClose()
  }

  const handleDeleteDraft = async (tutorialId: string) => {
    if (!confirm(`Supprimer le brouillon "${tutorialId}" ?`)) {
      return
    }

    try {
      const response = await fetch(`/api/draft?tutorialId=${encodeURIComponent(tutorialId)}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'lma-admin' },
        credentials: 'include'
      })

      if (!response.ok) {
        alert('Erreur lors de la suppression')
        return
      }

      // Retirer de la liste
      setTutorials((prev) => prev.filter((t) => t.id !== tutorialId))
    } catch (err) {
      alert('Erreur réseau')
    }
  }

  const handleViewPublished = (tutorialId: string) => {
    const url = `/?tutorialId=${encodeURIComponent(tutorialId)}`
    window.open(url, '_blank')
  }

  return (
    <div className="my-tutorials-panel">
      <div className="my-tutorials-panel__header">
        <h2>Mes tutoriels</h2>
        <button
          className="my-tutorials-panel__close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      <div className="my-tutorials-panel__toolbar">
        <button
          className="btn btn--primary"
          onClick={onCreateNew}
        >
          + Nouveau tutoriel
        </button>
      </div>

      <div className="my-tutorials-panel__content">
        {loading && (
          <div className="my-tutorials-panel__loading">
            Chargement...
          </div>
        )}

        {error && (
          <div className="my-tutorials-panel__error">
            <p>{error}</p>
            <button className="btn btn--secondary" onClick={onClose}>
              Fermer
            </button>
          </div>
        )}

        {!loading && !error && tutorials.length === 0 && (
          <div className="my-tutorials-panel__empty">
            <p>Aucun tutoriel pour l'instant.</p>
            <button className="btn btn--primary" onClick={onCreateNew}>
              Créer le premier
            </button>
          </div>
        )}

        {!loading && !error && tutorials.length > 0 && (
          <table className="tutorials-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th>Modifié le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tutorials.map((tutorial) => (
                <tr key={tutorial.id} className={tutorial.id === currentTutorial?.id ? 'active' : ''}>
                  <td className="tutorials-table__title">{tutorial.title || tutorial.id}</td>
                  <td>{tutorial.category}</td>
                  <td>
                    <span className={`badge badge--${tutorial.status}`}>
                      {tutorial.status === 'draft' ? 'Brouillon' : 'Publié'}
                    </span>
                  </td>
                  <td className="tutorials-table__date">{tutorial.lastModified}</td>
                  <td className="tutorials-table__actions">
                    <button
                      className="icon-btn"
                      onClick={() => handleEditTutorial(tutorial.id)}
                      title="Éditer"
                    >
                      ✎
                    </button>
                    <div className="dropdown-menu">
                      <button className="icon-btn" title="Actions">
                        ⋯
                      </button>
                      <div className="dropdown-menu__items">
                        <button
                          onClick={() => handleDeleteDraft(tutorial.id)}
                          className="dropdown-menu__item"
                        >
                          Supprimer brouillon
                        </button>
                        <button
                          onClick={() => handleViewPublished(tutorial.id)}
                          className="dropdown-menu__item"
                        >
                          Voir publié
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
