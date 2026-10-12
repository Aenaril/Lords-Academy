/**
 * Module CMS Thèmes (A1-A5)
 * 
 * Fonctionnalités :
 * - Édition thèmes personnalisés
 * - Bibliothèque prédéfinis
 * - Aperçu temps réel
 * - Publication vers GitHub (cms/themes.json)
 */

import { useState, useEffect } from 'react'
import { Theme, ThemeLibrary, ThemeColors } from './types'
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

export default function ThemesModule() {
  const [library, setLibrary] = useState<ThemeLibrary>({
    themes: PREDEFINED_THEMES,
    activeThemeId: 'dark',
    publishedThemeId: 'dark',
  })

  const [selectedThemeId, setSelectedThemeId] = useState<string>('dark')
  const [newThemeName, setNewThemeName] = useState('')
  const [showNewThemeForm, setShowNewThemeForm] = useState(false)
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle')

  // Charger thèmes depuis le localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cms:theme:library')
    if (saved) {
      try {
        const parsedLib = JSON.parse(saved)
        setLibrary(parsedLib)
      } catch (e) {
        console.error('Erreur parsing thèmes:', e)
      }
    }
  }, [])

  // Sauvegarder thèmes dans le localStorage
  const saveLibrary = (updatedLib: ThemeLibrary) => {
    setLibrary(updatedLib)
    localStorage.setItem('cms:theme:library', JSON.stringify(updatedLib))
  }

  const selectedTheme = library.themes.find((t) => t.id === selectedThemeId)

  // Éditer couleur
  const updateThemeColor = (colorKey: keyof ThemeColors, value: string) => {
    if (!selectedTheme) return
    const updated = { ...selectedTheme }
    updated.colors[colorKey] = value
    updated.modifiedAt = Date.now()

    const updatedThemes = library.themes.map((t) => (t.id === updated.id ? updated : t))
    saveLibrary({ ...library, themes: updatedThemes })
  }

  // Créer thème à partir d'une base
  const createThemeFromBase = (baseName: string) => {
    const base = library.themes.find((t) => t.name === baseName)
    if (!base || !newThemeName.trim()) return

    const newTheme: Theme = {
      id: `theme-${Date.now()}`,
      name: newThemeName,
      description: `Basé sur ${baseName}`,
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
    setShowNewThemeForm(false)
    setSelectedThemeId(newTheme.id)
    saveLibrary({ ...library, themes: updatedThemes })
  }

  // Publier thème
  const publishTheme = async () => {
    if (!selectedTheme || selectedTheme.isPredefined) return

    setPublishStatus('publishing')
    try {
      // Publier thème vers l'API
      const response = await fetch('/api/cms/themes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'lma-admin'  // ✅ CSRF token correct
        },
        credentials: 'include',  // ✅ Envoyer cookies (session)
        body: JSON.stringify({ action: 'publish', theme: selectedTheme }),
      })

      if (response.ok) {
        const updated = { ...library, publishedThemeId: selectedTheme.id }
        saveLibrary(updated)
        setPublishStatus('success')
        setTimeout(() => setPublishStatus('idle'), 3000)
      } else {
        const error = await response.text()
        console.error('Erreur publication thème:', response.status, error)
        setPublishStatus('error')
        setTimeout(() => setPublishStatus('idle'), 3000)
      }
    } catch (e) {
      console.error('Erreur publication thème:', e)
      setPublishStatus('error')
      setTimeout(() => setPublishStatus('idle'), 3000)
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
              <select className="cms-form__select">
                <option>Basé sur Sombre</option>
                <option>Basé sur Clair</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="cms-btn"
                  onClick={() => createThemeFromBase('Sombre')}
                >
                  Créer
                </button>
                <button
                  className="cms-btn--secondary cms-btn"
                  onClick={() => {
                    setShowNewThemeForm(false)
                    setNewThemeName('')
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
            <h3>Édition — {selectedTheme.name}</h3>

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
              {!selectedTheme.isPredefined && (
                <>
                  <button
                    className="cms-btn"
                    onClick={publishTheme}
                    disabled={publishStatus === 'publishing'}
                  >
                    {publishStatus === 'publishing' ? '⏳ Pub...' : '📤 Publier'}
                  </button>
                  {publishStatus === 'success' && <span className="status-success">✓ Publié!</span>}
                  {publishStatus === 'error' && <span className="status-error">✗ Erreur</span>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

