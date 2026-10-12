/**
 * Répartiteur CMS principal — intégré dans AdminBar pour l'Étape 3
 * 
 * Navigation entre modules : Tutoriels, Thèmes, Médiathèque, Accueil, Annonces, Notifications, Paramètres
 * 
 * ⚠️ Appelé directement depuis AdminBar quand authentifié
 * Pas d'AdminBar redondant ni de bouton toggle ici
 */
import { useState } from 'react'
import MyTutorialsPanel from './MyTutorialsPanel'
import ThemesModule from '../cms/ThemesModule'
import MediaLibraryModule from '../cms/MediaLibraryModule'
import HomeCustomizationModule from '../cms/HomeCustomizationModule'
import AnnouncementsModule from '../cms/AnnouncementsModule'
import NotificationsModule from '../cms/NotificationsModule'
import SiteSettingsModule from '../cms/SiteSettingsModule'
import './CmsIndex.css'

type CmsSection = 'tutorials' | 'themes' | 'media' | 'home' | 'announcements' | 'notifications' | 'settings'

interface CmsIndexProps {
  onSelectTutorial: (id: string) => void
  onClose?: () => void
}

export default function CmsIndex({ onSelectTutorial, onClose }: CmsIndexProps) {
  const [activeSection, setActiveSection] = useState<CmsSection>('tutorials')

  return (
    <div className="cms-container">
      <div className="cms-sidebar">
        <h2>Administration CMS</h2>
        <nav className="cms-nav">
          <button
            className={`cms-nav__item ${activeSection === 'tutorials' ? 'active' : ''}`}
            onClick={() => setActiveSection('tutorials')}
          >
            📚 Mes tutoriels
          </button>
          <button
            className={`cms-nav__item ${activeSection === 'themes' ? 'active' : ''}`}
            onClick={() => setActiveSection('themes')}
          >
            🎨 Thèmes
          </button>
          <button
            className={`cms-nav__item ${activeSection === 'media' ? 'active' : ''}`}
            onClick={() => setActiveSection('media')}
          >
            🖼️ Médiathèque
          </button>
          <button
            className={`cms-nav__item ${activeSection === 'home' ? 'active' : ''}`}
            onClick={() => setActiveSection('home')}
          >
            🏠 Accueil
          </button>
          <button
            className={`cms-nav__item ${activeSection === 'announcements' ? 'active' : ''}`}
            onClick={() => setActiveSection('announcements')}
          >
            📢 Annonces
          </button>
          <button
            className={`cms-nav__item ${activeSection === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveSection('notifications')}
          >
            🔔 Notifications
          </button>
          <button
            className={`cms-nav__item ${activeSection === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveSection('settings')}
          >
            ⚙️ Paramètres
          </button>
        </nav>
        {onClose && (
          <button 
            className="cms-close-btn"
            onClick={onClose}
            title="Fermer CMS"
          >
            ✕
          </button>
        )}
      </div>

      <div className="cms-main">
        {activeSection === 'tutorials' && (
          <MyTutorialsPanel 
            onSelectTutorial={onSelectTutorial}
            onCreateNew={() => setActiveSection('tutorials')}
            onClose={onClose ?? (() => {})}
          />
        )}
        {activeSection === 'themes' && <ThemesModule />}
        {activeSection === 'media' && <MediaLibraryModule />}
        {activeSection === 'home' && <HomeCustomizationModule />}
        {activeSection === 'announcements' && <AnnouncementsModule />}
        {activeSection === 'notifications' && <NotificationsModule />}
        {activeSection === 'settings' && <SiteSettingsModule />}
      </div>
    </div>
  )
}
