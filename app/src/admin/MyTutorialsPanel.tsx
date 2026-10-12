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
  status: 'draft' | 'published'
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

        // Étape 1 : Charger la liste des brouillons depuis l'index privé
        const draftResponse = await fetch('/api/tutorialIds', {
          headers: { 'X-Requested-With': 'lma-admin' },
          credentials: 'include'
        })

        if (!draftResponse.ok) {
          throw new Error('Impossible de charger la liste des brouillons')
        }

        const draftData = await draftResponse.json()
        const draftIds = draftData.tutorialIds || []

        // Étape 2 : Charger les tutoriels publiés depuis l'API
        let publishedMap = new Map<string, any>()
        try {
          const pubResponse = await fetch('/api/tutorials/published', { cache: 'no-store' })
          if (pubResponse.ok) {
            const pubData = await pubResponse.json()
            if (pubData.tutorials && Array.isArray(pubData.tutorials)) {
              publishedMap = new Map(pubData.tutorials.map((t: any) => [t.id, t]))
            }
          }
        } catch {
          // Fallback : pas d'accès à l'API publique
        }

        // Étape 3 : Construire la liste complète (brouillons + publiés + Dragon Arena statique)
        const allIds = new Set<string>()
        
        // Ajouter tous les brouillons
        draftIds.forEach((id: string) => allIds.add(id))
        
        // Ajouter tous les tutoriels publiés
        publishedMap.forEach((_, id) => allIds.add(id))
        
        // S'assurer que Dragon Arena est toujours présent (même s'il n'est ni brouillon ni publié)
        allIds.add('dragon-arena')

        // Construire les items avec vrais titres et statuts
        const items: TutorialItem[] = Array.from(allIds).map((id: string) => {
          const published = publishedMap.get(id)
          const isDraft = draftIds.includes(id)
          
          // Logique de statut corrigée
          let status: 'draft' | 'published'
          if (published) {
            // Si une version publiée existe, le tutoriel est publié
            // (peu importe s'il y a aussi un brouillon privé)
            status = 'published'
          } else if (isDraft) {
            // Pas de version publique, mais existe dans l'index privé
            status = 'draft'
          } else {
            // Ni publié ni brouillon enregistré = ne devrait pas arriver ici
            status = 'draft'
          }

          // Date de modification : ne jamais inventer
          let lastModified = '—'
          if (published && published.publishedAt) {
            try {
              lastModified = new Date(published.publishedAt).toLocaleDateString('fr-FR')
            } catch {
              lastModified = '—'
            }
          }

          return {
            id,
            title: published?.title || id,
            category: published?.category || '—',
            status,
            lastModified
          }
        })

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

  const handleDeleteDraft = async (tutorialId: string, status: 'draft' | 'published') => {
    // Avertissement si le tutoriel est publié
    const message = status === 'published'
      ? `Supprimer le brouillon de "${tutorialId}" ? Le tutoriel publié restera accessible.`
      : `Supprimer le brouillon de "${tutorialId}" ?`
    
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
                  <td className="tutorials-table__title">{tutorial.title}</td>
                  <td className="tutorials-table__category">{tutorial.category}</td>
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
                          onClick={() => handleDeleteDraft(tutorial.id, tutorial.status)}
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
