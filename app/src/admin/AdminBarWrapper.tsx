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
 * 
 * Activation fiable après connexion :
 * - AdminLogin appelle refreshSession(), puis onSuccess()
 * - L'effet activateAfterAuth se déclenche quand isAuthenticated devient true
 * - Cela évite les closures obsolètes sur le state de isAuthenticated
 */

// Ref globale pour permettre au pied de page d'ouvrir la modale/formulaire
const adminBarWrapperRef = {
  openAdminForm: (() => {}) as () => void
}

export function openAdminLoginForm() {
  // Alias maintenu pour compatibilité (ancien API)
  adminBarWrapperRef.openAdminForm()
}

export default function AdminBarWrapper({ onSelectTutorial }: { onSelectTutorial?: (id: string) => void }) {
  const remoteAvailable = isRemoteConfigured()
  const {
    isAuthenticated,
    toggleAdminMode,
    refreshSession,
    showAdminModeModal,
    openAdminModeModal,
    closeAdminModeModal
  } = useAdmin()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [shouldActivateAfterAuth, setShouldActivateAfterAuth] = useState(false)
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

  // Effet : activation fiable après authentification réussie
  // Se déclenche quand isAuthenticated passe à true après une connexion
  useEffect(() => {
    if (shouldActivateAfterAuth && isAuthenticated) {
      // isAuthenticated est maintenant à jour (pas de fermeture obsolète)
      toggleAdminMode()
      setShouldActivateAfterAuth(false)
    }
  }, [isAuthenticated, shouldActivateAfterAuth, toggleAdminMode])

  // En développement : toujours afficher AdminBar
  if (isDev) {
    return <AdminBar onSelectTutorial={onSelectTutorial} />
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
      <AdminBar onSelectTutorial={onSelectTutorial} />

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
            // Marquer que l'édition doit s'activer après confirmation d'auth
            setShouldActivateAfterAuth(true)
          }}
          onRefreshSession={refreshSession}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </>
  )
}
