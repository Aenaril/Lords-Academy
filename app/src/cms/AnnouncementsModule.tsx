/**
 * Module CMS Annonces (Module E)
 * 
 * Fonctionnalités :
 * - Créer/éditer annonces
 * - Carrousel d'affichage
 * - Programmation dates début/fin
 * - Association tutoriels/liens externes
 */

import { useState, useEffect } from 'react'
import { Announcement } from './types'
import './AnnouncementsModule.css'

interface AnnouncementsModuleProps {
  isAuthenticated?: boolean
}

export default function AnnouncementsModule({ isAuthenticated = false }: AnnouncementsModuleProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error' | 'auth-required'>(
    'idle'
  )

  // Charger annonces
  useEffect(() => {
    const saved = localStorage.getItem('cms:announcements:draft')
    if (saved) {
      try {
        setAnnouncements(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing announcements:', e)
      }
    }
  }, [])

  // Sauvegarder annonces
  const saveAnnouncements = (items: Announcement[]) => {
    setAnnouncements(items)
    localStorage.setItem('cms:announcements:draft', JSON.stringify(items))
  }

  // Nouvelle annonce
  const createAnnouncement = (): Announcement => ({
    id: `ann-${Date.now()}`,
    title: 'Nouvelle annonce',
    description: '',
    bgColor: '#1a1a1e',
    textColor: '#f2f2f2',
    buttonText: 'Découvrir',
    buttonLink: '',
    linkType: 'external',
    order: announcements.length,
    enabled: true,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  })

  // Ajouter
  const addAnnouncement = () => {
    const newAnn = createAnnouncement()
    const updated = [...announcements, newAnn]
    setSelectedId(newAnn.id)
    saveAnnouncements(updated)
  }

  // Supprimer
  const deleteAnnouncement = (id: string) => {
    const updated = announcements.filter((a) => a.id !== id)
    setSelectedId(null)
    saveAnnouncements(updated)
  }

  // Mettre à jour annonce
  const updateAnnouncement = (id: string, changes: Partial<Announcement>) => {
    const updated = announcements.map((a) =>
      a.id === id ? { ...a, ...changes, modifiedAt: Date.now() } : a
    )
    saveAnnouncements(updated)
  }

  // Publier annonces
  const publishAnnouncements = async () => {
    // Vérification préalable authentification
    if (!isAuthenticated) {
      setPublishStatus('auth-required')
      setTimeout(() => setPublishStatus('idle'), 4000)
      return
    }

    setPublishStatus('publishing')
    try {
      const response = await fetch('/api/cms/announcements', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'lma-admin'  // ✅ CSRF token correct
        },
        credentials: 'include',  // ✅ Envoyer cookies (session)
        body: JSON.stringify({ action: 'publish', announcements }),
      })

      // Log détaillé pour diagnostiquer
      console.info(`📢 Annonces publish: Status ${response.status}`)

      if (response.ok) {
        console.info(`✅ Annonces publiées: ${announcements.length} items`)
        setPublishStatus('success')
        setTimeout(() => setPublishStatus('idle'), 3000)
      } else {
        const errorText = await response.text()
        console.error(`❌ Erreur publication: ${response.status} ${response.statusText}`)
        console.error(`📝 Réponse: ${errorText}`)
        
        // Afficher erreur HTTP spécifique
        if (response.status === 401) {
          setPublishStatus('auth-required')
        } else {
          setPublishStatus('error')
        }
        setTimeout(() => setPublishStatus('idle'), 4000)
      }
    } catch (e) {
      console.error('❌ Erreur publication annonces (réseau):', e)
      setPublishStatus('error')
      setTimeout(() => setPublishStatus('idle'), 4000)
    }
  }

  const selected = announcements.find((a) => a.id === selectedId)

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>📢 Annonces & Carrousel</h1>
        <p>Créez et programmez des annonces affichées en carousel</p>
      </div>

      <div className="announcements-container">
        <div className="announcements-list-section">
          <div className="list-header">
            <h3>Annonces</h3>
            <span className="count">{announcements.length}</span>
          </div>

          {announcements.length === 0 ? (
            <p className="empty-state">Aucune annonce. Créez-en une.</p>
          ) : (
            <div className="announcements-list">
              {announcements.map((ann) => (
                <button
                  key={ann.id}
                  className={`announcement-item ${selectedId === ann.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(ann.id)}
                >
                  <div className="item-header">
                    <p className="item-title">{ann.title}</p>
                    <span className={`item-status ${ann.enabled ? 'enabled' : 'disabled'}`}>
                      {ann.enabled ? '✓ Actif' : '✗ Inactif'}
                    </span>
                  </div>
                  <p className="item-desc">{ann.description.substring(0, 50)}...</p>
                </button>
              ))}
            </div>
          )}

          <button className="cms-btn" onClick={addAnnouncement}>
            ➕ Nouvelle
          </button>

          <button
            className="cms-btn"
            onClick={publishAnnouncements}
            disabled={publishStatus === 'publishing' || announcements.length === 0 || !isAuthenticated}
            style={{ marginTop: 10 }}
            title={!isAuthenticated ? 'Authentification requise' : ''}
          >
            {publishStatus === 'publishing' ? '⏳ Pub...' : '📤 Publier'}
          </button>
          {publishStatus === 'success' && (
            <span className="status-success">✅ Publié avec succès!</span>
          )}
          {publishStatus === 'error' && (
            <span className="status-error">❌ Erreur de publication (voir console pour détails)</span>
          )}
          {publishStatus === 'auth-required' && (
            <span className="status-warning">🔐 Authentification requise pour publier</span>
          )}
          {!isAuthenticated && (
            <p className="cms-notice" style={{ marginTop: 12, color: '#ff9800', fontSize: '0.9em' }}>
              ℹ️ Connectez-vous pour pouvoir publier des annonces
            </p>
          )}
        </div>

        {selected && (
          <div className="announcement-editor">
            <h3>Édition</h3>

            <div className="cms-form">
              <div className="cms-form__group">
                <label className="cms-form__label">Titre</label>
                <input
                  type="text"
                  value={selected.title}
                  onChange={(e) => updateAnnouncement(selected.id, { title: e.target.value })}
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Description</label>
                <textarea
                  value={selected.description}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, { description: e.target.value })
                  }
                  className="cms-form__textarea"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">URL image</label>
                <input
                  type="text"
                  value={selected.imageUrl || ''}
                  onChange={(e) => updateAnnouncement(selected.id, { imageUrl: e.target.value })}
                  className="cms-form__input"
                  placeholder="https://..."
                />
              </div>

              <div className="color-row">
                <div className="cms-form__group">
                  <label className="cms-form__label">Couleur fond</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="color"
                      value={selected.bgColor}
                      onChange={(e) =>
                        updateAnnouncement(selected.id, { bgColor: e.target.value })
                      }
                      className="color-picker"
                    />
                    <input
                      type="text"
                      value={selected.bgColor}
                      onChange={(e) =>
                        updateAnnouncement(selected.id, { bgColor: e.target.value })
                      }
                      className="cms-form__input"
                    />
                  </div>
                </div>

                <div className="cms-form__group">
                  <label className="cms-form__label">Couleur texte</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="color"
                      value={selected.textColor}
                      onChange={(e) =>
                        updateAnnouncement(selected.id, { textColor: e.target.value })
                      }
                      className="color-picker"
                    />
                    <input
                      type="text"
                      value={selected.textColor}
                      onChange={(e) =>
                        updateAnnouncement(selected.id, { textColor: e.target.value })
                      }
                      className="cms-form__input"
                    />
                  </div>
                </div>
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Texte bouton</label>
                <input
                  type="text"
                  value={selected.buttonText}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, { buttonText: e.target.value })
                  }
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Type de lien</label>
                <select
                  value={selected.linkType}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, {
                      linkType: e.target.value as Announcement['linkType'],
                    })
                  }
                  className="cms-form__select"
                >
                  <option value="tutorial">Tutoriel</option>
                  <option value="internal">Page interne</option>
                  <option value="external">Lien externe</option>
                </select>
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">
                  {selected.linkType === 'tutorial' ? 'ID tutoriel' : 'Lien'}
                </label>
                <input
                  type="text"
                  value={selected.buttonLink}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, { buttonLink: e.target.value })
                  }
                  className="cms-form__input"
                  placeholder={selected.linkType === 'tutorial' ? 'dragon-arena' : 'https://...'}
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Début affichage</label>
                <input
                  type="datetime-local"
                  value={
                    selected.visibilityStartAt
                      ? new Date(selected.visibilityStartAt).toISOString().slice(0, 16)
                      : ''
                  }
                  onChange={(e) =>
                    updateAnnouncement(selected.id, {
                      visibilityStartAt: e.target.value ? new Date(e.target.value).getTime() : 0,
                    })
                  }
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Fin affichage</label>
                <input
                  type="datetime-local"
                  value={
                    selected.visibilityEndAt
                      ? new Date(selected.visibilityEndAt).toISOString().slice(0, 16)
                      : ''
                  }
                  onChange={(e) =>
                    updateAnnouncement(selected.id, {
                      visibilityEndAt: e.target.value ? new Date(e.target.value).getTime() : 0,
                    })
                  }
                  className="cms-form__input"
                />
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selected.enabled}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, { enabled: e.target.checked })
                  }
                />
                <span>Afficher cette annonce</span>
              </label>

              <button
                className="cms-btn--danger cms-btn"
                onClick={() => deleteAnnouncement(selected.id)}
              >
                🗑️ Supprimer
              </button>
            </div>
          </div>
        )}

        <div className="announcement-preview">
          <h3>Aperçu Carrousel</h3>
          {announcements.filter((a) => a.enabled).length === 0 ? (
            <p className="empty-state">Aucune annonce active</p>
          ) : (
            <div className="carousel-demo">
              {announcements
                .filter((a) => a.enabled)
                .map((ann) => (
                  <div
                    key={ann.id}
                    className="carousel-slide"
                    style={{
                      background: ann.bgColor,
                      color: ann.textColor,
                    }}
                  >
                    {ann.imageUrl && (
                      <img src={ann.imageUrl} alt={ann.title} className="slide-image" />
                    )}
                    <div className="slide-content">
                      <h4>{ann.title}</h4>
                      <p>{ann.description}</p>
                      <button
                        style={{
                          background: ann.textColor,
                          color: ann.bgColor,
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {ann.buttonText}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

