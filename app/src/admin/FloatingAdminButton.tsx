/**
 * Bouton flottant de connexion R4 — Toujours visible pour les visiteurs non-authentifiés
 * 
 * Position : bas à droite
 * Visible : pour tous
 * Action : ouvre le formulaire de connexion R4 (si pas authentifié)
 * État : masqué si authentifié (AdminBar prend le relais)
 */

import { useAdmin } from './AdminContext'
import { openAdminLoginForm } from './AdminBarWrapper'
import './FloatingAdminButton.css'

export default function FloatingAdminButton() {
  const { isAuthenticated, remoteConfigured } = useAdmin()

  // Masquer si : non configuré OU déjà authentifié
  if (!remoteConfigured || isAuthenticated) {
    return null
  }

  return (
    <button
      className="floating-admin-btn"
      onClick={() => openAdminLoginForm()}
      title="Accès administration R4"
    >
      🔐 Admin
    </button>
  )
}
