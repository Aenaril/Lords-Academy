import { useState } from 'react'
import { useAdmin } from './AdminContext'
import { openAdminLoginForm } from './AdminBarWrapper'
import TutorialMetaPanel from './TutorialMetaPanel'
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
    openAdminModeModal,
    isPreview,
    setPreview,
    isDirty,
    hasDraft, // NOUVEAU : Ajouter hasDraft
    canUndo,
    undoLastChange,
    discardDraft,
    discardDraftAsync,
    remoteConfigured,
    isAuthenticated,
    logout,
    publish,
    isPublishing
  } = useAdmin()
  const [showMeta, setShowMeta] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const isDev = import.meta.env.DEV

  const handleDiscard = async () => {
    // CORRECTION : Utiliser discardDraftAsync pour aussi supprimer le KV distant si en mode remote
    if (remoteConfigured && isAuthenticated) {
      // Mode sécurisé : appeller async pour DELETE /api/draft
      try {
        const result = await discardDraftAsync()
        // Vérifier result.ok avant d'afficher le message de succès
        if (result.ok) {
          alert('✅ Brouillon abandonné (local et distant).')
        } else {
          // Si annulation ou erreur, afficher le message d'erreur
          const errorMsg = result.error || 'erreur inconnue'
          alert(`❌ ${errorMsg}`)
        }
      } catch (err) {
        // Fallback : catch les erreurs non gérées
        alert(`❌ Erreur lors de l'abandon : ${(err as any)?.message ?? 'erreur inconnue'}`)
      }
    } else {
      // Mode local : juste discardDraft synchrone
      if (confirm('Abandonner tout le brouillon et revenir au contenu original ? Cette action efface toutes vos modifications.')) {
        discardDraft()
      }
    }
  }

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
          onClick={() => {
            // DÉVELOPPEMENT : ouvrir la modale d'accueil si non-authentifié
            if (isDev && remoteConfigured && !isAuthenticated) {
              openAdminModeModal()
            } else if (remoteConfigured && !isAuthenticated) {
              // PRODUCTION : ouvrir le formulaire de connexion si non-authentifié
              openAdminLoginForm()
            } else {
              // Déjà authentifié (dev ou prod) : activer/désactiver l'édition
              toggleAdminMode()
            }
          }}
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
              title="Réglages du tutoriel (titre, icône, description, difficulté, durée)"
            >
              ⚙️ Réglages
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
              onClick={handleDiscard}
              disabled={!isDirty && !hasDraft} // CORRIGÉ : Activer si modifications locales OU brouillon existe
              title="Abandonner l'intégralité du brouillon (local et distant si sécurisé)"
            >
              🗑 Abandonner le brouillon
            </button>

            {/* Admin sécurisée : connexion + publication (si configurée) */}
            {!isAuthenticated ? (
              <button
                className="admin-bar__btn admin-bar__btn--secure"
                onClick={openAdminLoginForm}
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
              {isDirty ? '● Modifications en cours' : (hasDraft ? '● Brouillon enregistré' : '○ Aucune modification')}
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
    </>
  )
}
