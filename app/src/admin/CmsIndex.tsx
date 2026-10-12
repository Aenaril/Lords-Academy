/**
 * Répartiteur CMS principal — remplace AdminBar pour l'Étape 3
 * 
 * Navigation entre modules : Tutoriels, Thèmes, Médiathèque, Accueil, Annonces, Notifications, Paramètres
 */
import { useState } from 'react'
import { useAdmin } from './AdminContext'
import AdminBar from './AdminBar'
import MyTutorialsPanel from './MyTutorialsPanel'
import ThemesModule from '../cms/ThemesModule'
import MediaLibraryModule from '../cms/MediaLibraryModule'
import HomeCustomizationModule from '../cms/HomeCustomizationModule'
import AnnouncementsModule from '../cms/AnnouncementsModule'
import NotificationsModule from '../cms/NotificationsModule'
import SiteSettingsModule from '../cms/SiteSettingsModule'
import './CmsIndex.css'

type CmsSection = 'tutorials' | 'themes' | 'media' | 'home' | 'announcements' | 'notifications' | 'settings'

export default function CmsIndex({ onSelectTutorial }: { onSelectTutorial: (id: string) => void }) {
  const { isAdminMode } = useAdmin()
  const [activeSection, setActiveSection] = useState<CmsSection>('tutorials')
  const [showCms, setShowCms] = useState(false)

  if (!isAdminMode || !showCms) {
    return (
      <>
        <AdminBar onSelectTutorial={onSelectTutorial} />
        {isAdminMode && (
          <button 
            className="cms-toggle-btn"
            onClick={() => setShowCms(true)}
            title="Ouvrir CMS complet"
          >
            📊 CMS
          </button>
        )}
      </>
    )
  }

  return (
    <div className="cms-container">
      <div className="cms-sidebar">
        <h2>Administration</h2>
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
        <button 
          className="cms-close-btn"
          onClick={() => setShowCms(false)}
          title="Fermer CMS"
        >
          ✕
        </button>
      </div>

      <div className="cms-main">
        {activeSection === 'tutorials' && (
          <MyTutorialsPanel 
            onSelectTutorial={onSelectTutorial}
            onCreateNew={() => {}}
            onClose={() => setShowCms(false)}
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
