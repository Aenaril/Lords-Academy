import { useState } from 'react'
import { useAdmin } from './AdminContext'
import TutorialMetaPanel from './TutorialMetaPanel'
import AdminLogin from './AdminLogin'
import VersionHistory from './VersionHistory'
import './AdminBar.css'

/**
 * Barre flottante de contrôle de l'administration R4.
 * - Mode démo local (localStorage) : toujours disponible.
 * - Admin sécurisée (si Worker configuré) : connexion + publication.
 */
export default function AdminBar() {
  const {
    isAdminMode,
    toggleAdminMode,
    isPreview,
    setPreview,
    isDirty,
    canUndo,
    undoLastChange,
    discardDraft,
    remoteConfigured,
    isAuthenticated,
    refreshSession,
    logout,
    publish,
    isPublishing
  } = useAdmin()
  const [showMeta, setShowMeta] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const handlePublish = async () => {
    if (!confirm('Publier ce contenu pour tous les visiteurs ?')) return
    const res = await publish()
    if (res.ok) {
      alert('✅ Contenu publié.')
    } else if (res.conflict) {
      alert('⚠️ Conflit : une version plus récente existe sur le serveur. Rechargez avant de republier.')
    } else {
      alert(`❌ Publication impossible : ${res.error ?? 'erreur inconnue'}`)
    }
  }

  return (
    <>
      <div className={`admin-bar ${isAdminMode ? 'admin-bar--active' : ''}`}>
        <button
          className="admin-bar__toggle"
          onClick={toggleAdminMode}
          title="Activer / désactiver le mode d'édition"
        >
          {isAdminMode ? '🔓 Mode édition activé' : '🔧 Mode admin'}
        </button>

        {isAdminMode && (
          <>
            <button
              className={`admin-bar__btn ${isPreview ? 'admin-bar__btn--on' : ''}`}
              onClick={() => setPreview(!isPreview)}
              title="Aperçu : masquer les contrôles pour voir le rendu visiteur"
            >
              {isPreview ? '👁 Aperçu actif' : '👁 Aperçu'}
            </button>

            <button
              className="admin-bar__btn"
              onClick={() => setShowMeta(true)}
              title="Réglages du tutoriel et gestion des versions"
            >
              ⚙️ Réglages & versions
            </button>

            <button
              className="admin-bar__btn"
              onClick={() => setShowHistory(true)}
              title="Consulter et restaurer les versions publiées"
            >
              🕑 Historique des versions
            </button>

            <button
              className="admin-bar__btn"
              onClick={undoLastChange}
              disabled={!canUndo}
              title="Annuler uniquement la dernière modification"
            >
              ↶ Annuler la modification
            </button>

            <button
              className="admin-bar__btn admin-bar__btn--reset"
              onClick={() => {
                if (confirm('Abandonner tout le brouillon et revenir au contenu original ? Cette action efface toutes vos modifications locales.')) {
                  discardDraft()
                }
              }}
              disabled={!isDirty}
              title="Abandonner l'intégralité du brouillon local"
            >
              🗑 Abandonner le brouillon
            </button>

            {/* Admin sécurisée : connexion + publication (si configurée) */}
            {!isAuthenticated ? (
              <button
                className="admin-bar__btn admin-bar__btn--secure"
                onClick={() => setShowLogin(true)}
                title="Se connecter à l'administration sécurisée"
              >
                🔐 Admin sécurisée
              </button>
            ) : (
              <>
                <button
                  className="admin-bar__btn admin-bar__btn--publish"
                  onClick={handlePublish}
                  disabled={isPublishing}
                  title="Publier pour tous les visiteurs"
                >
                  {isPublishing ? '⏳ Publication…' : '🚀 Publier'}
                </button>
                <button
                  className="admin-bar__btn"
                  onClick={logout}
                  title="Se déconnecter de l'administration sécurisée"
                >
                  Déconnexion
                </button>
              </>
            )}

            <span className="admin-bar__status">
              {isDirty ? '● Brouillon non publié' : '○ Aucune modification'}
            </span>

            <span className="admin-bar__warn">
              {remoteConfigured
                ? isAuthenticated
                  ? '🔒 Session sécurisée active'
                  : '⚠️ Mode local — connectez-vous pour publier'
                : '⚠️ Démo locale — service sécurisé non configuré, rien n\'est publié'}
            </span>
          </>
        )}
      </div>

      {showMeta && <TutorialMetaPanel onClose={() => setShowMeta(false)} />}
      {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
      {showLogin && (
        <AdminLogin
          onSuccess={() => {
            setShowLogin(false)
            refreshSession()
          }}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  )
}
