import { useEffect, useRef, useState } from 'react'
import AdminBar from './AdminBar'
import AdminLogin from './AdminLogin'
import AdminModeChoice from './AdminModeChoice'
import { useAdmin } from './AdminContext'
import { isRemoteConfigured } from './api/client'

/**
 * Wrapper conditionnel pour AdminBar + gestion du formulaire de connexion.
 * 
 * DÉVELOPPEMENT LOCAL (import.meta.env.DEV) :
 * - Mode démo local disponible : édition sans authentification
 * - Mode sécurisé disponible : simulation du flux d'authentification
 * - Modale d'accueil : choix entre démo et connexion
 * - AdminBar toujours visible
 * 
 * PRODUCTION (Cloudflare Pages) :
 * - Mode démo local INDISPONIBLE (jamais montré aux visiteurs publics)
 * - Clic « Mode admin » ou « Accès administration » → AdminLogin directement
 * - AdminBar visible seulement si API distante configurée
 * 
 * Sécurité côté navigateur :
 * - toggleAdminMode() vérifie (remoteConfigured && !isAuthenticated)
 *   → bloque l'activation directe sans authentification
 * - En production : aucune route vers le mode démo local
 */

// Ref globale pour permettre au pied de page d'ouvrir la modale/formulaire
const adminBarWrapperRef = {
  openAdminForm: (() => {}) as () => void
}

export function openAdminLoginForm() {
  // Alias maintenu pour compatibilité (ancien API)
  adminBarWrapperRef.openAdminForm()
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
  const isDev = import.meta.env.DEV

  // Décide quel formulaire afficher selon le contexte
  const openAdminForm = useRef(() => {
    if (isDev) {
      // DÉVELOPPEMENT : proposer le choix démo vs connexion
      openAdminModeModal()
    } else {
      // PRODUCTION : ouvrir directement le formulaire de connexion
      setShowLoginModal(true)
    }
  })

  // Mettre à jour la ref avec la dernière fonction (cleanup approprié)
  useEffect(() => {
    adminBarWrapperRef.openAdminForm = openAdminForm.current
    return () => {
      adminBarWrapperRef.openAdminForm = () => {}
    }
  }, [isDev])

  // En développement : toujours afficher AdminBar
  if (isDev) {
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

      {/* DÉVELOPPEMENT UNIQUEMENT : modale d'accueil avec choix */}
      {isDev && showAdminModeModal && (
        <AdminModeChoice
          onChooseDemo={handleChooseDemo}
          onChooseLogin={handleChooseLogin}
          onClose={closeAdminModeModal}
        />
      )}

      {/* PRODUCTION ET DÉVELOPPEMENT : formulaire de connexion */}
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
