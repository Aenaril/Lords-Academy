/**
 * Module CMS Médiathèque (Module C)
 * 
 * Fonctionnalités :
 * - Upload d'images/vidéos
 * - Gestion des fichiers
 * - Aperçu et métadonnées
 * - Suppression et organisation
 */

import { useState, useEffect } from 'react'
import { MediaItem } from './types'
import './MediaLibraryModule.css'

export default function MediaLibraryModule() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [editingAltText, setEditingAltText] = useState('')

  // Charger média du localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cms:media:library')
    if (saved) {
      try {
        setMediaItems(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing media:', e)
      }
    }
  }, [])

  // Sauvegarder média
  const saveMedia = (items: MediaItem[]) => {
    setMediaItems(items)
    localStorage.setItem('cms:media:library', JSON.stringify(items))
  }

  // Upload fichier
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (!files) return

    setUploading(true)
    const newItems: MediaItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const reader = new FileReader()

      reader.onload = (event) => {
        if (!event.target?.result) return

        const dataUrl = event.target.result as string
        const mimeType = file.type

        const newItem: MediaItem = {
          id: `media-${Date.now()}-${i}`,
          filename: file.name,
          url: dataUrl,
          mimeType,
          size: file.size,
          altText: '',
          createdAt: Date.now(),
        }

        // Extraire dimensions si image
        if (mimeType.startsWith('image/')) {
          const img = new Image()
          img.onload = () => {
            newItem.width = img.width
            newItem.height = img.height
            newItems.push(newItem)

            if (newItems.length === files.length) {
              const updated = [...mediaItems, ...newItems]
              saveMedia(updated)
              setUploading(false)
              ;(e.target as HTMLInputElement).value = ''
            }
          }
          img.src = dataUrl
        } else {
          newItems.push(newItem)
          if (newItems.length === files.length) {
            const updated = [...mediaItems, ...newItems]
            saveMedia(updated)
            setUploading(false)
            ;(e.target as HTMLInputElement).value = ''
          }
        }
      }

      reader.readAsDataURL(file)
    }
  }

  // Supprimer média
  const deleteMedia = (id: string) => {
    const updated = mediaItems.filter((m) => m.id !== id)
    saveMedia(updated)
    if (selectedItem?.id === id) {
      setSelectedItem(null)
    }
  }

  // Mettre à jour alt text
  const updateAltText = (id: string, altText: string) => {
    const updated = mediaItems.map((m) => (m.id === id ? { ...m, altText } : m))
    saveMedia(updated)
    if (selectedItem?.id === id) {
      setSelectedItem({ ...selectedItem, altText })
    }
  }

  // Mettre à jour description
  const updateDescription = (id: string, description: string) => {
    const updated = mediaItems.map((m) => (m.id === id ? { ...m, description } : m))
    saveMedia(updated)
    if (selectedItem?.id === id) {
      setSelectedItem({ ...selectedItem, description })
    }
  }

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>🖼️ Médiathèque</h1>
        <p>Gérez vos images et vidéos</p>
      </div>

      <div className="media-container">
        <div className="media-upload-section">
          <div className="upload-box">
            <label htmlFor="file-input" className="upload-label">
              <span>📁 Cliquez ou glissez vos fichiers</span>
              <p>PNG, JPG, GIF, SVG, WebP — max 50 MB par fichier</p>
            </label>
            <input
              id="file-input"
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              className="file-input"
            />
            {uploading && <p className="uploading">⏳ Upload en cours...</p>}
          </div>

          <div className="media-stats">
            <p>
              <strong>{mediaItems.length}</strong> fichier{mediaItems.length !== 1 ? 's' : ''}
            </p>
            <p className="media-size">
              {(mediaItems.reduce((sum, m) => sum + m.size, 0) / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>

        <div className="media-grid-section">
          <h3>Bibliothèque</h3>
          {mediaItems.length === 0 ? (
            <p className="empty-state">Aucun média. Commencez par en ajouter.</p>
          ) : (
            <div className="media-grid">
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  className={`media-card ${selectedItem?.id === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedItem(item)
                    setEditingAltText(item.altText)
                  }}
                >
                  {item.mimeType.startsWith('image/') ? (
                    <img src={item.url} alt={item.altText} className="media-thumb" />
                  ) : (
                    <div className="media-placeholder">📄</div>
                  )}
                  <p className="media-filename" title={item.filename}>
                    {item.filename}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedItem && (
          <div className="media-editor">
            <h3>Détails</h3>

            <div className="media-preview">
              {selectedItem.mimeType.startsWith('image/') ? (
                <img src={selectedItem.url} alt={selectedItem.altText} />
              ) : (
                <div className="preview-placeholder">📄 {selectedItem.filename}</div>
              )}
            </div>

            <div className="cms-form">
              <div className="cms-form__group">
                <label className="cms-form__label">Nom du fichier</label>
                <input type="text" value={selectedItem.filename} disabled className="cms-form__input" />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Type</label>
                <input type="text" value={selectedItem.mimeType} disabled className="cms-form__input" />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Taille</label>
                <input
                  type="text"
                  value={`${(selectedItem.size / 1024).toFixed(2)} KB`}
                  disabled
                  className="cms-form__input"
                />
              </div>

              {selectedItem.width && selectedItem.height && (
                <div className="cms-form__group">
                  <label className="cms-form__label">Dimensions</label>
                  <input
                    type="text"
                    value={`${selectedItem.width} × ${selectedItem.height} px`}
                    disabled
                    className="cms-form__input"
                  />
                </div>
              )}

              <div className="cms-form__group">
                <label className="cms-form__label">Texte alternatif (accessibilité)</label>
                <textarea
                  value={editingAltText}
                  onChange={(e) => setEditingAltText(e.target.value)}
                  onBlur={() => updateAltText(selectedItem.id, editingAltText)}
                  className="cms-form__textarea"
                  placeholder="Description pour lecteurs d'écran"
                />
              </div>

              <div className="cms-form__group">
                <label className="cms-form__label">Description</label>
                <textarea
                  value={selectedItem.description || ''}
                  onChange={(e) => updateDescription(selectedItem.id, e.target.value)}
                  className="cms-form__textarea"
                  placeholder="Usage, crédits, notes..."
                />
              </div>

              <div className="media-url-copy">
                <input
                  type="text"
                  value={selectedItem.url}
                  readOnly
                  className="cms-form__input"
                />
                <button
                  className="cms-btn--secondary cms-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedItem.url)
                  }}
                >
                  📋 Copier URL
                </button>
              </div>

              <button
                className="cms-btn--danger cms-btn"
                onClick={() => deleteMedia(selectedItem.id)}
              >
                🗑️ Supprimer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

