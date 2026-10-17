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
  title: string
  category: string
  status: 'draft' | 'in_progress' | 'published' | 'unpublished' | 'coming-soon'
  hasDraft: boolean
  lastModified: string
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

        // Appeler le nouvel endpoint /api/tutorial/statuses pour charger TOUS les tutoriels
        // avec leurs statuts (draft, in_progress, published, unpublished, coming-soon)
        const response = await fetch('/api/tutorial/statuses', {
          headers: { 'X-Requested-With': 'lma-admin' },
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Impossible de charger la liste des tutoriels')
        }

        const data = await response.json()
        if (!data.ok || !Array.isArray(data.tutorials)) {
          throw new Error('Format de réponse invalide')
        }

        // Construire les items avec les données du nouvel endpoint
        const items: TutorialItem[] = data.tutorials.map((t: any) => ({
          id: t.id,
          title: t.title || t.id,
          category: t.category || '—',
          status: t.status || 'draft',
          hasDraft: t.hasDraft || false,
          lastModified: t.lastModified
            ? new Date(t.lastModified).toLocaleDateString('fr-FR')
            : '—'
        }))

        // Trier par titre pour cohérence
        items.sort((a, b) => a.title.localeCompare(b.title))

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

  const handleDeleteDraft = async (tutorialId: string, tutorial: TutorialItem) => {
    // Avertissement adapté au statut
    const messages: Record<string, string> = {
      'published': `Supprimer le brouillon de "${tutorialId}" ? Le tutoriel publié restera accessible.`,
      'unpublished': `Supprimer le brouillon de "${tutorialId}" ? Le tutoriel dépublié ne sera plus accessible.`,
      'coming-soon': `Supprimer le brouillon de "${tutorialId}" ? Le statut "Bientôt disponible" disparaîtra.`,
      'in_progress': `Supprimer le brouillon de "${tutorialId}" ?`,
      'draft': `Supprimer le brouillon de "${tutorialId}" ?`
    }
    
    const message = messages[tutorial.status] || messages['draft']
    
    if (!confirm(message)) {
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

      // Retirer de la liste si c'était un brouillon pur
      // Si le tutoriel a un statut publié/unpublished/coming-soon, il reste dans la liste
      if (tutorial.status === 'draft' || tutorial.status === 'in_progress') {
        setTutorials((prev) => prev.filter((t) => t.id !== tutorialId))
      } else {
        // Sinon, recharger la liste pour mettre à jour le statut
        setTutorials((prev) =>
          prev.map((t) =>
            t.id === tutorialId ? { ...t, hasDraft: false } : t
          )
        )
      }
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
                  <td className="tutorials-table__title">{tutorial.title}</td>
                  <td className="tutorials-table__category">{tutorial.category}</td>
                  <td>
                    <span className={`badge badge--${tutorial.status}`}>
                      {tutorial.status === 'draft' && 'Brouillon'}
                      {tutorial.status === 'in_progress' && 'En chantier'}
                      {tutorial.status === 'published' && 'Publié'}
                      {tutorial.status === 'unpublished' && 'Dépublié'}
                      {tutorial.status === 'coming-soon' && 'Bientôt disponible'}
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
                          onClick={() => handleDeleteDraft(tutorial.id, tutorial)}
                          className="dropdown-menu__item"
                        >
                          Supprimer brouillon
                        </button>
                        {tutorial.status === 'published' && (
                          <button
                            onClick={() => handleViewPublished(tutorial.id)}
                            className="dropdown-menu__item"
                          >
                            Voir publié
                          </button>
                        )}
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
