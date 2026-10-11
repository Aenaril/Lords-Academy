import './AdminModeChoice.css'

interface AdminModeChoiceProps {
  remoteConfigured: boolean
  onChooseDemo: () => void
  onChooseLogin: () => void
  onClose: () => void
}

/**
 * Modale d'accueil : offrir à l'utilisateur un choix clair
 * - Mode démo local (localStorage, pas de publication)
 * - Mode sécurisé (connexion, publication vers GitHub)
 */
export default function AdminModeChoice({
  remoteConfigured,
  onChooseDemo,
  onChooseLogin,
  onClose
}: AdminModeChoiceProps) {
  return (
    <div className="admin-mode-choice__overlay" onClick={onClose}>
      <div className="admin-mode-choice" onClick={(e) => e.stopPropagation()}>
        <div className="admin-mode-choice__head">
          <h2>🎛️ Mode d'administration</h2>
          <button
            className="admin-mode-choice__close"
            onClick={onClose}
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <p className="admin-mode-choice__intro">
          Choisissez votre mode d'administration :
        </p>

        <div className="admin-mode-choice__buttons">
          <button
            className="admin-mode-choice__btn admin-mode-choice__btn--demo"
            onClick={onChooseDemo}
          >
            <span className="admin-mode-choice__btn-title">🏠 Mode démo local</span>
            <span className="admin-mode-choice__btn-desc">
              Testez l'édition sur ce navigateur. Les modifications restent privées
              dans le stockage local (localStorage) et ne sont visibles que par vous.
              <br />
              <strong>Rien n'est publié.</strong>
            </span>
          </button>

          {remoteConfigured && (
            <button
              className="admin-mode-choice__btn admin-mode-choice__btn--secure"
              onClick={onChooseLogin}
            >
              <span className="admin-mode-choice__btn-title">🔐 Connexion sécurisée</span>
              <span className="admin-mode-choice__btn-desc">
                Connectez-vous avec le mot de passe partagé. Vos modifications
                peuvent être <strong>publiées vers tous les visiteurs</strong> via GitHub.
                <br />
                Session signée et sécurisée.
              </span>
            </button>
          )}

          {!remoteConfigured && (
            <div className="admin-mode-choice__notice">
              <p>
                <strong>Note :</strong> L'administration sécurisée (connexion distante)
                n'est pas configurée sur cet environnement. Vous pouvez utiliser le mode
                démo local pour tester l'édition.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
