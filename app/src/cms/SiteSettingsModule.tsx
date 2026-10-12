/**
 * Module CMS Paramètres Site (Module I)
 * 
 * Fonctionnalités :
 * - Informations générales du site
 * - Logo et favicon
 * - Politique/CGU
 * - Contact
 */

import { useState, useEffect } from 'react'
import { SiteSettings } from './types'
import './SiteSettingsModule.css'

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'Lords Mobile Academy',
  siteDescription: 'Plateforme gratuite d\'apprentissage pour Lords Mobile',
  logoUrl: '',
  faviconUrl: '',
  privacyPolicyUrl: '',
  termsUrl: '',
  contactEmail: '',
}

export default function SiteSettingsModule() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  // Charger settings
  useEffect(() => {
    const saved = localStorage.getItem('cms:site:settings')
    if (saved) {
      try {
        setSettings(JSON.parse(saved))
      } catch (e) {
        console.error('Erreur parsing settings:', e)
      }
    }
  }, [])

  // Sauvegarder
  const saveSettings = async () => {
    setSaveStatus('saving')
    try {
      localStorage.setItem('cms:site:settings', JSON.stringify(settings))

      // Publier vers l'API
      const response = await fetch('/api/cms/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'lma-admin'  // ✅ CSRF token correct
        },
        credentials: 'include',  // ✅ Envoyer cookies (session)
        body: JSON.stringify({ action: 'save', settings }),
      })

      if (response.ok) {
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        const error = await response.text()
        console.error('Erreur sauvegarde settings:', response.status, error)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (e) {
      console.error('Erreur sauvegarde settings:', e)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const updateField = <K extends keyof SiteSettings>(field: K, value: SiteSettings[K]) => {
    setSettings({ ...settings, [field]: value })
  }

  return (
    <div className="cms-module">
      <div className="cms-module__header">
        <h1>⚙️ Paramètres Site</h1>
        <p>Informations générales et configuration du site</p>
      </div>

      <div className="settings-container">
        <div className="settings-form">
          <div className="cms-form">
            <h3>Identité du site</h3>

            <div className="cms-form__group">
              <label className="cms-form__label">Nom du site</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => updateField('siteName', e.target.value)}
                className="cms-form__input"
              />
            </div>

            <div className="cms-form__group">
              <label className="cms-form__label">Description (meta tag)</label>
              <textarea
                value={settings.siteDescription}
                onChange={(e) => updateField('siteDescription', e.target.value)}
                className="cms-form__textarea"
                placeholder="Utilisée par les moteurs de recherche et réseaux sociaux"
              />
            </div>

            <h3>Ressources visuelles</h3>

            <div className="cms-form__group">
              <label className="cms-form__label">URL Logo</label>
              <input
                type="text"
                value={settings.logoUrl || ''}
                onChange={(e) => updateField('logoUrl', e.target.value)}
                className="cms-form__input"
                placeholder="https://..."
              />
            </div>

            {settings.logoUrl && (
              <div className="preview-box">
                <img src={settings.logoUrl} alt="Logo preview" className="logo-preview" />
              </div>
            )}

            <div className="cms-form__group">
              <label className="cms-form__label">URL Favicon</label>
              <input
                type="text"
                value={settings.faviconUrl || ''}
                onChange={(e) => updateField('faviconUrl', e.target.value)}
                className="cms-form__input"
                placeholder="https://..."
              />
            </div>

            {settings.faviconUrl && (
              <div className="preview-box">
                <img src={settings.faviconUrl} alt="Favicon preview" className="favicon-preview" />
              </div>
            )}

            <h3>Politiques & Légal</h3>

            <div className="cms-form__group">
              <label className="cms-form__label">URL Politique de confidentialité</label>
              <input
                type="text"
                value={settings.privacyPolicyUrl || ''}
                onChange={(e) => updateField('privacyPolicyUrl', e.target.value)}
                className="cms-form__input"
                placeholder="https://..."
              />
            </div>

            <div className="cms-form__group">
              <label className="cms-form__label">URL Conditions d'utilisation</label>
              <input
                type="text"
                value={settings.termsUrl || ''}
                onChange={(e) => updateField('termsUrl', e.target.value)}
                className="cms-form__input"
                placeholder="https://..."
              />
            </div>

            <h3>Contact</h3>

            <div className="cms-form__group">
              <label className="cms-form__label">Email de contact</label>
              <input
                type="email"
                value={settings.contactEmail || ''}
                onChange={(e) => updateField('contactEmail', e.target.value)}
                className="cms-form__input"
                placeholder="contact@example.com"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="cms-btn" onClick={saveSettings} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
              </button>
              {saveStatus === 'success' && <span className="status-success">✓ Sauvegardé!</span>}
              {saveStatus === 'error' && <span className="status-error">✗ Erreur</span>}
            </div>
          </div>
        </div>

        <div className="settings-info">
          <div className="info-card">
            <h4>📌 Conseils</h4>
            <ul>
              <li>Le nom du site apparaît dans l'onglet du navigateur</li>
              <li>La description est utilisée par Google dans les résultats</li>
              <li>Logo format: PNG/SVG carré (1:1 minimum 256px)</li>
              <li>Favicon: ICO/PNG 32px</li>
              <li>Les URLs doivent être complètes (https://...)</li>
            </ul>
          </div>

          <div className="info-card">
            <h4>🔗 Liens utiles</h4>
            <p>
              Les URLs de politique et CGU doivent pointer vers vos pages officielles. Utilisez des
              pages sécurisées.
            </p>
          </div>

          <div className="info-card">
            <h4>📧 Email de contact</h4>
            <p>
              Cet email peut être utilisé pour :
            </p>
            <ul>
              <li>Formulaires de contact</li>
              <li>Notifications administrateur</li>
              <li>Support utilisateur</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

