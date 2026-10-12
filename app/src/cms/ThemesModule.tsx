/**
 * Module CMS Thèmes (A1-A5)
 * 
 * Fonctionnalités :
 * - Édition thèmes personnalisés
 * - Bibliothèque prédéfinis
 * - Aperçu temps réel
 * - Publication vers GitHub (cms/themes.json)
 */

import { useState, useEffect, useRef } from 'react'
import { Theme, ThemeLibrary, ThemeColors } from './types'
import {
  loadThemeLibrary as loadThemeLibraryServer,
  saveThemeLibrary as saveThemeLibraryServer,
  CmsStorageError,
} from './cmsStorageClient'
import { applyTheme } from './ThemeManager'
import './ThemesModule.css'

const PREDEFINED_THEMES: Theme[] = [
  {
    id: 'light',
    name: 'Clair',
    description: 'Thème clair classique',
    colors: {
      bgMain: '#ffffff',
      bgCard: '#f5f5f5',
      bgSection: '#eeeeee',
      textPrimary: '#1a1a1a',
      textSecondary: '#4a4a4a',
      textMuted: '#8a8a8a',
      primary: '#d4af37',
      secondary: '#3b6fa8',
      accent: '#d84d00',
      success: '#4caf50',
      error: '#d32f2f',
      warning: '#ff9800',
      borderColor: '#cccccc',
      buttonText: '#ffffff',
      linkColor: '#0066cc',
    },
    typography: {
      fontPrimary: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      fontHeadings: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      sizeBase: 16,
      sizeSmall: 14,
      sizeLarge: 18,
      sizeXL: 24,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    borderRadius: 8,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    isPredefined: true,
  },
  {
    id: 'dark',
    name: 'Sombre',
    description: 'Thème sombre par défaut',
    colors: {
      bgMain: '#0f0f12',
      bgCard: '#1a1a1e',
      bgSection: '#242428',
      textPrimary: '#f2f2f2',
      textSecondary: '#b0b0b0',
      textMuted: '#707070',
      primary: '#d4af37',
      secondary: '#5e92b3',
      accent: '#ff6b6b',
      success: '#4caf50',
      error: '#ff5252',
      warning: '#ffb74d',
      borderColor: '#333333',
      buttonText: '#1a1a1a',
      linkColor: '#5eaaff',
    },
    typography: {
      fontPrimary: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      fontHeadings: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      sizeBase: 16,
      sizeSmall: 14,
      sizeLarge: 18,
      sizeXL: 24,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    borderRadius: 8,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    isPredefined: true,
  },
]

interface ThemesModuleProps {
  isAuthenticated?: boolean
}

export default function ThemesModule({ isAuthenticated = false }: ThemesModuleProps) {
  const [library, setLibrary] = useState<ThemeLibrary>({
    themes: PREDEFINED_THEMES,
    activeThemeId: 'dark',
    publishedThemeId: 'dark',
  })

  const [selectedThemeId, setSelectedThemeId] = useState<string>('dark')
  const [newThemeName, setNewThemeName] = useState('')
  const [newThemeBase, setNewThemeBase] = useState<'dark' | 'light'>('dark')
  const [showNewThemeForm, setShowNewThemeForm] = useState(false)
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error' | 'auth-required'>('idle')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [previewOn, setPreviewOn] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishingRef = useRef<{ themeId: string; revision: number } | null>(null)

  // Charger thèmes : cache local immédiat, puis serveur (source de vérité)
  useEffect(() => {
    const saved = localStorage.getItem('cms:theme:library')
    if (saved) {
      try {
        setLibrary(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing thèmes (cache local):', e)
      }
    }

    if (isAuthenticated) {
      setSyncStatus('loading')
      loadThemeLibraryServer()
        .then((serverLib) => {
          if (serverLib && Array.isArray(serverLib.themes)) {
            // Fusionner : toujours garder les prédéfinis + thèmes serveur
            const merged = mergeWithPredefined(serverLib)
            setLibrary(merged)
            localStorage.setItem('cms:theme:library', JSON.stringify(merged))
          }
          setSyncStatus('idle')
        })
        .catch((err) => {
          if (err instanceof CmsStorageError && err.status === 401) {
            setSyncStatus('idle')
          } else {
            console.error('Erreur chargement thèmes serveur:', err)
            setSyncStatus('error')
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // Garantir que les prédéfinis sont toujours présents dans la bibliothèque
  const mergeWithPredefined = (lib: ThemeLibrary): ThemeLibrary => {
    const byId = new Map<string, Theme>()
    for (const t of PREDEFINED_THEMES) byId.set(t.id, t)
    for (const t of lib.themes) byId.set(t.id, t) // thèmes serveur écrasent si même id
    return { ...lib, themes: [...byId.values()] }
  }

  // Sauvegarder : cache local immédiat + persistance serveur différée (debounce)
  const saveLibrary = (updatedLib: ThemeLibrary) => {
    setLibrary(updatedLib)
    localStorage.setItem('cms:theme:library', JSON.stringify(updatedLib))

    if (!isAuthenticated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSyncStatus('saving')
      // Ne persister côté serveur que les thèmes PERSONNALISÉS (les prédéfinis
      // sont fournis par le code), + les ids actif/publié
      const customOnly: ThemeLibrary = {
        ...updatedLib,
        themes: updatedLib.themes.filter((t) => !t.isPredefined),
      }
      saveThemeLibraryServer(customOnly)
        .then(() => {
          setSyncStatus('saved')
          setTimeout(() => setSyncStatus('idle'), 2000)
        })
        .catch((err) => {
          console.error('Erreur sauvegarde thèmes serveur:', err)
          setSyncStatus('error')
        })
    }, 1500)
  }

  const selectedTheme = library.themes.find((t) => t.id === selectedThemeId)

  // Prévisualisation live : applique le thème sélectionné au DOM quand activée.
  // Désactivée → restaure le thème publié courant (from state, not localStorage).
  useEffect(() => {
    if (previewOn && selectedTheme) {
      applyTheme(selectedTheme)
    } else if (!previewOn) {
      // Restaurer le thème publié DEPUIS L'ÉTAT (pas localStorage)
      // Cela garantit que c'est la dernière publication confirmée par le serveur
      const published = library.themes.find((t) => t.id === library.publishedThemeId)
      if (published) applyTheme(published)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOn, selectedThemeId, selectedTheme, library.publishedThemeId])

  // Renommer un thème personnalisé
  const renameTheme = (themeId: string, newName: string) => {
    if (!newName.trim()) return
    const theme = library.themes.find((t) => t.id === themeId)
    if (!theme || theme.isPredefined) return

    const updated = { ...theme, name: newName.trim(), modifiedAt: Date.now() }
    const updatedThemes = library.themes.map((t) => (t.id === themeId ? updated : t))
    saveLibrary({ ...library, themes: updatedThemes })
  }

  // Éditer couleur (copie profonde pour éviter mutations)
  const updateThemeColor = (colorKey: keyof ThemeColors, value: string) => {
    if (!selectedTheme) return
    const updated = {
      ...selectedTheme,
      colors: { ...selectedTheme.colors, [colorKey]: value },
      modifiedAt: Date.now(),
    }

    const updatedThemes = library.themes.map((t) => (t.id === updated.id ? updated : t))
    saveLibrary({ ...library, themes: updatedThemes })
  }

  // Dupliquer un thème (prédéfini ou personnalisé) en une copie modifiable
  const duplicateTheme = (source: Theme) => {
    const copy: Theme = {
      ...source,
      id: `theme-${Date.now()}`,
      name: `${source.name} (copie)`,
      description: `Copie de ${source.name}`,
      colors: { ...source.colors },
      typography: { ...source.typography },
      spacing: { ...source.spacing },
      isPredefined: false,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    }
    const updatedThemes = [...library.themes, copy]
    saveLibrary({ ...library, themes: updatedThemes })
    setSelectedThemeId(copy.id)
  }

  // Restaurer le thème sombre original (publier 'dark')
  const restoreOriginalTheme = async () => {
    const original = PREDEFINED_THEMES.find((t) => t.id === 'dark')
    if (!original) return
    
    setSelectedThemeId('dark')
    // Ne pas appliquer immédiatement — attendre la confirmation serveur
    
    if (!isAuthenticated) {
      setPublishStatus('auth-required')
      setTimeout(() => setPublishStatus('idle'), 4000)
      return
    }

    // Publier le thème original et attendre la confirmation
    const ok = await publishThemeObject(original)
    if (ok) {
      applyTheme(original)
      setPreviewOn(false)
    }
  }

  // Créer thème à partir d'une base
  const createThemeFromBase = () => {
    const base = library.themes.find((t) => t.id === newThemeBase)
    if (!base || !newThemeName.trim()) return

    const newTheme: Theme = {
      id: `theme-${Date.now()}`,
      name: newThemeName,
      description: `Basé sur ${base.name}`,
      colors: { ...base.colors },
      typography: { ...base.typography },
      spacing: { ...base.spacing },
      borderRadius: base.borderRadius,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      isPredefined: false,
    }

    const updatedThemes = [...library.themes, newTheme]
    setNewThemeName('')
    setNewThemeBase('dark')
    setShowNewThemeForm(false)
    setSelectedThemeId(newTheme.id)
    saveLibrary({ ...library, themes: updatedThemes })
  }

  // Publier un objet thème spécifique vers l'API GitHub publique avec vérification
  const publishThemeObject = async (theme: Theme): Promise<boolean> => {
    setPublishStatus('publishing')
    // NE PAS calculer la révision côté client
    // Laisser le serveur déterminer la vraie révision en lisant l'état publié
    const thisPublish = { themeId: theme.id }
    publishingRef.current = thisPublish as any

    try {
      const response = await fetch('/api/cms/themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'lma-admin',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          action: 'publish', 
          theme,
          // NE PAS envoyer de numéro de révision du client
        }),
      })

      console.info(`🎨 Thème publish: Status ${response.status}`)

      // Vérifier que c'est encore la publication actuelle (pas été remplacée)
      if (publishingRef.current !== thisPublish) {
        console.warn(`⚠️ Publication ${theme.id} remplacée par une plus récente`)
        return false
      }

      if (response.ok) {
        const result = await response.json()
        console.info(
          `✅ Thème publié: ${theme.name} (rev ${result.revisionNumber} confirmée par serveur)`
        )
        
        // Mettre à jour la révision publiée confirmée (depuis le serveur)
        const updated = {
          ...library,
          publishedThemeId: theme.id,
          activeThemeId: theme.id,
          publishedRevision: result.revisionNumber, // Du serveur, pas du calcul client
          publishedAt: Date.now(),
        }
        setLibrary(updated)
        localStorage.setItem('cms:theme:library', JSON.stringify(updated))
        
        setPublishStatus('success')
        setTimeout(() => setPublishStatus('idle'), 6000)
        publishingRef.current = null
        return true
      }

      const error = await response.text()
      console.error(`❌ Erreur publication thème: ${response.status}`)
      console.error(`📝 Réponse: ${error}`)
      setPublishStatus(response.status === 401 ? 'auth-required' : 'error')
      setTimeout(() => setPublishStatus('idle'), 4000)
      publishingRef.current = null
      return false
    } catch (e) {
      console.error('❌ Erreur publication thème (réseau):', e)
      setPublishStatus('error')
      setTimeout(() => setPublishStatus('idle'), 4000)
      publishingRef.current = null
      return false
    }
  }

  // Publier le thème sélectionné (prédéfini OU personnalisé)
  const publishTheme = async () => {
    if (!selectedTheme) return
    if (publishStatus === 'publishing') return // Éviter les clics multiples

    if (!isAuthenticated) {
      setPublishStatus('auth-required')
      setTimeout(() => setPublishStatus('idle'), 4000)
      return
    }

    const ok = await publishThemeObject(selectedTheme)
    if (ok) {
      applyTheme(selectedTheme) // appliquer immédiatement au site
      setPreviewOn(false)
    }
  }

  // Supprimer thème personnalisé
  const deleteTheme = (id: string) => {
    if (library.themes.find((t) => t.id === id)?.isPredefined) return // Pas suppr prédéfinis

    const updatedThemes = library.themes.filter((t) => t.id !== id)
    const newActive = selectedThemeId === id ? 'dark' : selectedThemeId
    setSelectedThemeId(newActive)
    saveLibrary({ ...library, themes: updatedThemes })
  }

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>🎨 Thèmes</h1>
        <p>Créez et gérez les thèmes visuels du site</p>
      </div>

      <div className="themes-container">
        <div className="themes-list">
          <h3>Bibliothèque</h3>
          <div className="themes-items">
            {library.themes.map((theme) => (
              <div key={theme.id} className="theme-item">
                <button
                  className={`theme-item__btn ${selectedThemeId === theme.id ? 'active' : ''}`}
                  onClick={() => setSelectedThemeId(theme.id)}
                >
                  <div className="theme-item__color-preview">
                    <div style={{ background: theme.colors.primary }} />
                    <div style={{ background: theme.colors.secondary }} />
                    <div style={{ background: theme.colors.bgMain }} />
                  </div>
                  <div className="theme-item__info">
                    <p className="theme-item__name">{theme.name}</p>
                    <p className="theme-item__meta">
                      {theme.isPredefined ? '📌 Prédéfini' : '✏️ Personnalisé'}
                    </p>
                  </div>
                </button>

                {!theme.isPredefined && (
                  <button
                    className="theme-item__delete"
                    onClick={() => deleteTheme(theme.id)}
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                )}

                {library.publishedThemeId === theme.id && (
                  <span className="theme-item__published">Publié</span>
                )}
              </div>
            ))}
          </div>

          {!showNewThemeForm ? (
            <button className="cms-btn" onClick={() => setShowNewThemeForm(true)}>
              ➕ Nouveau thème
            </button>
          ) : (
            <div className="new-theme-form">
              <input
                type="text"
                placeholder="Nom du thème"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                className="cms-form__input"
              />
              <select
                value={newThemeBase}
                onChange={(e) => setNewThemeBase(e.target.value as 'dark' | 'light')}
                className="cms-form__select"
              >
                <option value="dark">Basé sur Sombre</option>
                <option value="light">Basé sur Clair</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="cms-btn" onClick={createThemeFromBase}>
                  Créer
                </button>
                <button
                  className="cms-btn--secondary cms-btn"
                  onClick={() => {
                    setShowNewThemeForm(false)
                    setNewThemeName('')
                    setNewThemeBase('dark')
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedTheme && (
          <div className="theme-editor">
            <div style={{ marginBottom: '1.5rem' }}>
              <h3>Édition — {selectedTheme.name}</h3>
              {!selectedTheme.isPredefined && (
                <div className="cms-form__group" style={{ marginTop: '1rem' }}>
                  <label className="cms-form__label">Renommer ce thème</label>
                  <input
                    type="text"
                    value={selectedTheme.name}
                    onChange={(e) => renameTheme(selectedTheme.id, e.target.value)}
                    className="cms-form__input"
                    placeholder="Entrer un nouveau nom"
                  />
                </div>
              )}
            </div>

            <div className="color-grid">
              {(Object.entries(selectedTheme.colors) as Array<[keyof ThemeColors, string]>).map(
                ([key, value]) => (
                  <div key={key} className="color-field">
                    <label className="cms-form__label">{key}</label>
                    <div className="color-input-group">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => updateThemeColor(key, e.target.value)}
                        className="color-picker"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateThemeColor(key, e.target.value)}
                        className="cms-form__input"
                      />
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="theme-preview">
              <h4>Aperçu</h4>
              <div
                style={{
                  background: selectedTheme.colors.bgMain,
                  color: selectedTheme.colors.textPrimary,
                  padding: '20px',
                  borderRadius: `${selectedTheme.borderRadius}px`,
                  border: `1px solid ${selectedTheme.colors.borderColor}`,
                }}
              >
                <h5 style={{ marginTop: 0 }}>Titre d'exemple</h5>
                <p>Texte principal avec couleur {selectedTheme.colors.textPrimary}.</p>
                <p style={{ color: selectedTheme.colors.textSecondary }}>Texte secondaire.</p>
                <button
                  style={{
                    background: selectedTheme.colors.primary,
                    color: selectedTheme.colors.buttonText,
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Bouton
                </button>
              </div>
            </div>

            <div className="theme-actions">
              <button
                className={`cms-btn ${previewOn ? 'cms-btn--on' : 'cms-btn--secondary'}`}
                onClick={() => setPreviewOn((v) => !v)}
                title="Appliquer temporairement ce thème au site pour prévisualiser"
              >
                {previewOn ? '👁 Aperçu actif' : '👁 Prévisualiser'}
              </button>

              <button
                className="cms-btn cms-btn--secondary"
                onClick={() => duplicateTheme(selectedTheme)}
                title="Créer une copie modifiable de ce thème"
              >
                ⧉ Dupliquer
              </button>

              <button
                className="cms-btn"
                onClick={publishTheme}
                disabled={publishStatus === 'publishing' || !isAuthenticated}
                title={!isAuthenticated ? 'Authentification requise' : publishStatus === 'publishing' ? 'Publication en cours…' : 'Publier ce thème sur le site public'}
              >
                {publishStatus === 'publishing' ? '⏳ Publication…' : '📤 Publier'}
              </button>

              <button
                className="cms-btn cms-btn--secondary"
                onClick={restoreOriginalTheme}
                disabled={!isAuthenticated}
                title="Restaurer le thème sombre original Lords Academy"
              >
                ↩ Restaurer l'original
              </button>

              {publishStatus === 'success' && (
                <span className="status-success" style={{ display: 'block', marginTop: 8 }}>
                  ✅ Thème publié et appliqué. La propagation complète sur le site
                  public peut prendre quelques minutes (déploiement Cloudflare).
                </span>
              )}
              {publishStatus === 'error' && (
                <span className="status-error">❌ Erreur de publication (voir console)</span>
              )}
              {publishStatus === 'auth-required' && (
                <span className="status-warning">🔐 Authentification requise</span>
              )}
              {!isAuthenticated && (
                <p style={{ marginTop: 12, color: '#ff9800', fontSize: '0.9em' }}>
                  ℹ️ Connectez-vous pour pouvoir publier des thèmes
                </p>
              )}
              {isAuthenticated && (
                <p className="cms-sync-status" style={{ marginTop: 8, fontSize: '0.8em', opacity: 0.75 }}>
                  {syncStatus === 'loading' && '⏳ Chargement bibliothèque serveur…'}
                  {syncStatus === 'saving' && '💾 Enregistrement serveur…'}
                  {syncStatus === 'saved' && '✓ Bibliothèque enregistrée sur le serveur'}
                  {syncStatus === 'error' && '⚠️ Erreur de synchronisation serveur'}
                  {syncStatus === 'idle' && '☁️ Bibliothèque synchronisée'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

