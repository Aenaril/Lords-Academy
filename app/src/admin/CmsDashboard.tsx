/**
 * Tableau de Bord CMS — Page d'accueil de l'administration
 * 
 * Affiche un aperçu rapide des modules CMS disponibles
 * et de l'état du site
 */

import { getCmsConfig, getActiveAnnouncements, getActiveTheme } from '../cms/CmsConfigLoader'
import './CmsDashboard.css'

export default function CmsDashboard() {
  const cmsConfig = getCmsConfig()
  const theme = getActiveTheme()
  const announcements = getActiveAnnouncements()

  const moduleCards = [
    {
      id: 'home',
      icon: '🏠',
      title: 'Accueil',
      description: 'Gérer le titre, sous-titre, image héro de la page d\'accueil',
      color: '#667eea'
    },
    {
      id: 'themes',
      icon: '🎨',
      title: 'Thèmes',
      description: 'Créer et gérer les thèmes visuels du site',
      color: '#764ba2'
    },
    {
      id: 'announcements',
      icon: '📢',
      title: 'Annonces',
      description: `Créer des annonces (${announcements.length} actif${announcements.length !== 1 ? 's' : ''})`,
      color: '#f093fb'
    },
    {
      id: 'media',
      icon: '🖼️',
      title: 'Médiathèque',
      description: 'Gérer les images et ressources du site',
      color: '#4facfe'
    },
    {
      id: 'notifications',
      icon: '🔔',
      title: 'Notifications',
      description: 'Configurer les notifications push',
      color: '#fa709a'
    },
    {
      id: 'settings',
      icon: '⚙️',
      title: 'Paramètres',
      description: 'Informations du site et configuration générale',
      color: '#30cfd0'
    }
  ]

  return (
    <div className="cms-dashboard">
      <div className="cms-dashboard__header">
        <h1>📊 Administration du Site</h1>
        <p className="cms-dashboard__subtitle">
          Gestion centralisée des thèmes, annonces, accueil et notifications
        </p>
      </div>

      <div className="cms-dashboard__status">
        <div className="status-item">
          <span className="status-label">Thème actif :</span>
          <span className="status-value">{theme?.name || 'Défaut'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Annonces :</span>
          <span className="status-value">{announcements.length} active{announcements.length !== 1 ? 's' : ''}</span>
        </div>
        {cmsConfig?.errors && cmsConfig.errors.length > 0 && (
          <div className="status-item status-item--warning">
            <span className="status-label">⚠️ Avertissements :</span>
            <span className="status-value">{cmsConfig.errors.length}</span>
          </div>
        )}
      </div>

      <div className="cms-dashboard__modules">
        <h2>Modules d'Administration</h2>
        <div className="modules-grid">
          {moduleCards.map(card => (
            <div key={card.id} className="module-card" style={{ borderTopColor: card.color }}>
              <div className="module-card__icon">{card.icon}</div>
              <h3 className="module-card__title">{card.title}</h3>
              <p className="module-card__description">{card.description}</p>
              <p className="module-card__hint">
                Cliquez sur le bouton « {card.title} » dans le menu à gauche
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="cms-dashboard__help">
        <h3>💡 Guide Rapide</h3>
        <ul>
          <li><strong>Accueil</strong> : Personnalisez le titre, le sous-titre et l'image de la page d'accueil</li>
          <li><strong>Thèmes</strong> : Créez de nouveaux thèmes visuels ou modifiez les couleurs</li>
          <li><strong>Annonces</strong> : Publiez des annonces qui s'affichent en haut de la page d'accueil</li>
          <li><strong>Médiathèque</strong> : Gérez les images et ressources du site</li>
          <li><strong>Notifications</strong> : Configurez les notifications push pour les utilisateurs</li>
          <li><strong>Paramètres</strong> : Modifiez le nom, la description et les logos du site</li>
        </ul>
      </div>
    </div>
  )
}
