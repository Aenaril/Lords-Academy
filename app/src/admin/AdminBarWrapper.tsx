import { useEffect, useRef, useState } from 'react'
import AdminBar from './AdminBar'
import AdminLogin from './AdminLogin'
import AdminModeChoice from './AdminModeChoice'
import { useAdmin } from './AdminContext'
import { isRemoteConfigured } from './api/client'

/**
 * Wrapper conditionnel pour AdminBar + gestion du formulaire de connexion.
 * 
 * - En développement (local, DEV=true) : AdminBar toujours visible pour éditer.
 * - En production (DEV=false) :
 *   - Si API distante configurée (VITE_ADMIN_API_BASE non-vide) : AdminBar visible
 *   - Sinon : AdminBar masqué
 * 
 * La modale d'accueil (AdminModeChoice) est centralisée ici et permet à l'utilisateur
 * de choisir entre :
 * - Mode démo local (localStorage)
 * - Mode sécurisé (connexion + publication)
 * 
 * Le formulaire de connexion (AdminLogin) s'ouvre après le choix « Mode sécurisé ».
 */

// Ref globale pour permettre au pied de page d'ouvrir la modale d'accueil
const adminBarWrapperRef = {
  openAdminModeModal: (() => {}) as () => void
}

export function openAdminLoginForm() {
  // Alias maintenu pour compatibilité (ancien API)
  adminBarWrapperRef.openAdminModeModal()
}

export default function AdminBarWrapper() {
  const remoteAvailable = isRemoteConfigured()
  const {
    toggleAdminMode,
    refreshSession,
    showAdminModeModal,
    openAdminModeModal,
    closeAdminModeModal
  } = useAdmin()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const openAdminModeModalRef = useRef(() => openAdminModeModal())

  // Mettre à jour la ref avec la dernière fonction (cleanup approprié)
  useEffect(() => {
    adminBarWrapperRef.openAdminModeModal = openAdminModeModalRef.current
    return () => {
      // Cleanup : ne pas laisser de ref orpheline
      adminBarWrapperRef.openAdminModeModal = () => {}
    }
  }, [])

  // En développement : toujours afficher
  if (import.meta.env.DEV) {
    return <AdminBar />
  }

  // En production : afficher uniquement si API distante configurée
  if (!remoteAvailable) {
    return null
  }

  const handleChooseDemo = () => {
    closeAdminModeModal()
    toggleAdminMode()
  }

  const handleChooseLogin = () => {
    closeAdminModeModal()
    setShowLoginModal(true)
  }

  return (
    <>
      <AdminBar />
      
      {showAdminModeModal && (
        <AdminModeChoice
          remoteConfigured={remoteAvailable}
          onChooseDemo={handleChooseDemo}
          onChooseLogin={handleChooseLogin}
          onClose={closeAdminModeModal}
        />
      )}

      {showLoginModal && (
        <AdminLogin
          onSuccess={() => {
            setShowLoginModal(false)
            // Après connexion réussie : activer le mode édition
            toggleAdminMode()
          }}
          onRefreshSession={refreshSession}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </>
  )
}
