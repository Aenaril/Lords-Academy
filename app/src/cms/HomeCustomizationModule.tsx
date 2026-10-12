/**
 * Module CMS Accueil (Module D)
 * 
 * Fonctionnalités :
 * - Édition titre, sous-titre, intro
 * - Héro image et couleur
 * - Visibilité sections
 */

import { useState, useEffect } from 'react'
import { HomePageConfig } from './types'
import './HomeCustomizationModule.css'

const DEFAULT_HOME_CONFIG: HomePageConfig = {
  title: 'Lords Mobile Academy',
  subtitle: 'Maîtrisez la stratégie',
  introText: 'Bienvenue sur l\'académie gratuite Lords Mobile. Apprenez à dominer le jeu avec des guides experts.',
  heroImageUrl: '',
  heroBackgroundColor: '#0f0f12',
  sections: {
    available: { visible: true, title: 'Tutoriels disponibles' },
    comingSoon: { visible: true, title: 'À venir' },
    categories: { visible: true, title: 'Par catégorie' },
  },
}

export default function HomeCustomizationModule() {
  const [config, setConfig] = useState<HomePageConfig>(DEFAULT_HOME_CONFIG)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  // Charger config
  useEffect(() => {
    const saved = localStorage.getItem('cms:home:config')
    if (saved) {
      try {
        setConfig(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing home config:', e)
      }
    }
  }, [])

  // Sauvegarder config
  const saveConfig = async () => {
    setSaveStatus('saving')
    try {
      localStorage.setItem('cms:home:config', JSON.stringify(config))

      // Publier vers l'API
      const response = await fetch('/api/cms/home', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', config }),
      })

      if (response.ok) {
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (e) {
      console.error('Erreur sauvegarde config accueil:', e)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const updateTextField = (field: keyof HomePageConfig, value: string) => {
    setConfig({ ...config, [field]: value })
  }

  const updateSectionVisibility = (section: keyof typeof config.sections, visible: boolean) => {
    setConfig({
      ...config,
      sections: {
        ...config.sections,
        [section]: { ...config.sections[section], visible },
      },
    })
  }

  const updateSectionTitle = (section: keyof typeof config.sections, title: string) => {
    setConfig({
      ...config,
      sections: {
        ...config.sections,
        [section]: { ...config.sections[section], title },
      },
    })
  }

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>🏠 Personnalisation Accueil</h1>
        <p>Modifiez le contenu et l'apparence de la page d'accueil</p>
      </div>

      <div className="home-container">
        <div className="home-editor">
          <div className="cms-form">
            <h3>Texte principal</h3>

            <div className="cms-form__group">
              <label className="cms-form__label">Titre</label>
              <input
                type="text"
                value={config.title}
                onChange={(e) => updateTextField('title', e.target.value)}
                className="cms-form__input"
              />
            </div>

            <div className="cms-form__group">
              <label className="cms-form__label">Sous-titre</label>
              <input
                type="text"
                value={config.subtitle}
                onChange={(e) => updateTextField('subtitle', e.target.value)}
                className="cms-form__input"
              />
            </div>

            <div className="cms-form__group">
              <label className="cms-form__label">Texte introduction</label>
              <textarea
                value={config.introText}
                onChange={(e) => updateTextField('introText', e.target.value)}
                className="cms-form__textarea"
              />
            </div>

            <h3>Héro</h3>

            <div className="cms-form__group">
              <label className="cms-form__label">URL image héro</label>
              <input
                type="text"
                value={config.heroImageUrl || ''}
                onChange={(e) => updateTextField('heroImageUrl', e.target.value)}
                className="cms-form__input"
                placeholder="https://..."
              />
            </div>

            <div className="cms-form__group">
              <label className="cms-form__label">Couleur de fond (si pas d'image)</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="color"
                  value={config.heroBackgroundColor || '#0f0f12'}
                  onChange={(e) => updateTextField('heroBackgroundColor', e.target.value)}
                  className="color-picker"
                />
                <input
                  type="text"
                  value={config.heroBackgroundColor || '#0f0f12'}
                  onChange={(e) => updateTextField('heroBackgroundColor', e.target.value)}
                  className="cms-form__input"
                />
              </div>
            </div>

            <h3>Sections</h3>

            {(
              Object.entries(config.sections) as Array<
                [keyof typeof config.sections, (typeof config.sections)[keyof typeof config.sections]]
              >
            ).map(([sectionKey, section]) => (
              <div key={sectionKey} className="section-config">
                <div className="section-config__header">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={section.visible}
                      onChange={(e) => updateSectionVisibility(sectionKey, e.target.checked)}
                    />
                    <span>
                      {sectionKey === 'available' && '📚 Tutoriels disponibles'}
                      {sectionKey === 'comingSoon' && '🔜 À venir'}
                      {sectionKey === 'categories' && '🏷️ Par catégorie'}
                    </span>
                  </label>
                </div>

                {section.visible && (
                  <div className="section-config__title">
                    <label className="cms-form__label">Titre de section</label>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSectionTitle(sectionKey, e.target.value)}
                      className="cms-form__input"
                    />
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="cms-btn" onClick={saveConfig} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
              </button>
              {saveStatus === 'success' && <span className="status-success">✓ Sauvegardé!</span>}
              {saveStatus === 'error' && <span className="status-error">✗ Erreur</span>}
            </div>
          </div>
        </div>

        <div className="home-preview">
          <div className="preview-header">
            <h4>Aperçu</h4>
          </div>

          <div
            className="preview-hero"
            style={{
              backgroundImage: config.heroImageUrl ? `url(${config.heroImageUrl})` : 'none',
              backgroundColor: config.heroBackgroundColor,
            }}
          >
            <div className="preview-hero__content">
              <h1 className="preview-hero__title">{config.title}</h1>
              <p className="preview-hero__subtitle">{config.subtitle}</p>
            </div>
          </div>

          <div className="preview-intro">
            <p>{config.introText}</p>
          </div>

          {config.sections.available.visible && (
            <div className="preview-section">
              <h3>{config.sections.available.title}</h3>
              <p className="placeholder">📚 Section tutoriels</p>
            </div>
          )}

          {config.sections.comingSoon.visible && (
            <div className="preview-section">
              <h3>{config.sections.comingSoon.title}</h3>
              <p className="placeholder">🔜 Section à venir</p>
            </div>
          )}

          {config.sections.categories.visible && (
            <div className="preview-section">
              <h3>{config.sections.categories.title}</h3>
              <p className="placeholder">🏷️ Section catégories</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

