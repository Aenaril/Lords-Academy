import './AdminModeChoice.css'

interface AdminModeChoiceProps {
  onChooseDemo: () => void
  onChooseLogin: () => void
  onClose: () => void
}

/**
 * Modale d'accueil : choisir entre mode démo local et connexion sécurisée.
 * 
 * ⚠️ DÉVELOPPEMENT LOCAL UNIQUEMENT (import.meta.env.DEV)
 * 
 * En production (Cloudflare Pages), cette modale ne doit pas apparaître.
 * Voir AdminBarWrapper pour la logique conditionnelle.
 * 
 * En développement :
 * - Mode démo local : édition sans authentification (localStorage)
 * - Connexion sécurisée : simulation de l'authentification R4
 */
export default function AdminModeChoice({
  onChooseDemo,
  onChooseLogin,
  onClose
}: AdminModeChoiceProps) {
  return (
    <div className="admin-mode-choice__overlay" onClick={onClose}>
      <div className="admin-mode-choice" onClick={(e) => e.stopPropagation()}>
        <div className="admin-mode-choice__head">
          <h2>🎛️ Mode d'administration (DEV)</h2>
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
              Testez l'édition sans authentification. Les modifications restent privées
              dans le stockage local (localStorage) de ce navigateur.
              <br />
              <strong>Développement uniquement.</strong>
            </span>
          </button>

          <button
            className="admin-mode-choice__btn admin-mode-choice__btn--secure"
            onClick={onChooseLogin}
          >
            <span className="admin-mode-choice__btn-title">🔐 Connexion sécurisée</span>
            <span className="admin-mode-choice__btn-desc">
              Testez le flux d'authentification en simulation. En production,
              cela nécessite le mot de passe partagé R4.
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
