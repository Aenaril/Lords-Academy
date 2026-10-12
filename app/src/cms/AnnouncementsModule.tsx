/**
 * Module CMS Annonces (Module E)
 * 
 * Fonctionnalités :
 * - Créer/éditer annonces
 * - Carrousel d'affichage
 * - Programmation dates début/fin
 * - Association tutoriels/liens externes
 */

import { useState, useEffect, useRef } from 'react'
import { Announcement } from './types'
import {
  loadAnnouncements as loadAnnouncementsServer,
  saveAnnouncements as saveAnnouncementsServer,
  CmsStorageError,
} from './cmsStorageClient'
import { utcToDatetimeLocalValue, datetimeLocalValueToUtc } from './timezone'
import { usePublishedTutorials } from './usePublishedTutorials'
import './AnnouncementsModule.css'

interface AnnouncementsModuleProps {
  isAuthenticated?: boolean
}

const LS_KEY = 'cms:announcements:draft'

export default function AnnouncementsModule({ isAuthenticated = false }: AnnouncementsModuleProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error' | 'auth-required'>(
    'idle'
  )
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedTutorials = usePublishedTutorials()

  // Charger annonces : d'abord cache local (instantané), puis serveur (source de vérité)
  useEffect(() => {
    // 1) Cache local pour affichage immédiat
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      try {
        setAnnouncements(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing announcements (cache local):', e)
      }
    }

    // 2) Serveur (si authentifié) — écrase le cache local
    if (isAuthenticated) {
      setSyncStatus('loading')
      loadAnnouncementsServer()
        .then((serverItems) => {
          setAnnouncements(serverItems)
          localStorage.setItem(LS_KEY, JSON.stringify(serverItems))
          setSyncStatus('idle')
        })
        .catch((err) => {
          if (err instanceof CmsStorageError && err.status === 401) {
            // Session expirée : garder le cache local
            setSyncStatus('idle')
          } else {
            console.error('Erreur chargement annonces serveur:', err)
            setSyncStatus('error')
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // Sauvegarder annonces : cache local immédiat + persistance serveur différée (debounce)
  const saveAnnouncements = (items: Announcement[]) => {
    setAnnouncements(items)
    localStorage.setItem(LS_KEY, JSON.stringify(items))

    // Persistance serveur (debounce 1,5s) si authentifié
    if (!isAuthenticated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSyncStatus('saving')
      saveAnnouncementsServer(items)
        .then(() => {
          setSyncStatus('saved')
          setTimeout(() => setSyncStatus('idle'), 2000)
        })
        .catch((err) => {
          console.error('Erreur sauvegarde annonces serveur:', err)
          setSyncStatus('error')
        })
    }, 1500)
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
        // Recharger les configs CMS pour refléter la publication dans l'app
        // (le fichier public peut toutefois mettre quelques minutes à se
        // propager via le déploiement Cloudflare — voir message ci-dessous)
        try {
          const { reloadCmsConfigs } = await import('./CmsConfigLoader')
          await reloadCmsConfigs()
        } catch {
          /* non bloquant */
        }
        setPublishStatus('success')
        setTimeout(() => setPublishStatus('idle'), 6000)
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
            <span className="status-success" style={{ display: 'block', marginTop: 8 }}>
              ✅ Publication envoyée. L'annonce peut mettre quelques minutes à
              apparaître sur le site (déploiement Cloudflare).
            </span>
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
          {isAuthenticated && (
            <p className="cms-sync-status" style={{ marginTop: 8, fontSize: '0.8em', opacity: 0.75 }}>
              {syncStatus === 'loading' && '⏳ Chargement depuis le serveur…'}
              {syncStatus === 'saving' && '💾 Enregistrement serveur…'}
              {syncStatus === 'saved' && '✓ Brouillon enregistré sur le serveur'}
              {syncStatus === 'error' && '⚠️ Erreur de synchronisation serveur'}
              {syncStatus === 'idle' && '☁️ Brouillons synchronisés'}
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
                  {selected.linkType === 'tutorial' ? 'Tutoriel de destination' : 'Lien'}
                </label>
                {selected.linkType === 'tutorial' ? (
                  <select
                    value={selected.buttonLink}
                    onChange={(e) =>
                      updateAnnouncement(selected.id, { buttonLink: e.target.value })
                    }
                    className="cms-form__select"
                  >
                    <option value="">— Choisir un tutoriel publié —</option>
                    {publishedTutorials.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selected.buttonLink}
                    onChange={(e) =>
                      updateAnnouncement(selected.id, { buttonLink: e.target.value })
                    }
                    className="cms-form__input"
                    placeholder="https://..."
                  />
                )}
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Début affichage (heure belge)</label>
                <input
                  type="datetime-local"
                  value={utcToDatetimeLocalValue(selected.visibilityStartAt)}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, {
                      visibilityStartAt: datetimeLocalValueToUtc(e.target.value),
                    })
                  }
                  className="cms-form__input"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Fin affichage (heure belge)</label>
                <input
                  type="datetime-local"
                  value={utcToDatetimeLocalValue(selected.visibilityEndAt)}
                  onChange={(e) =>
                    updateAnnouncement(selected.id, {
                      visibilityEndAt: datetimeLocalValueToUtc(e.target.value),
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

