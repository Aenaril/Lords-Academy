import { useEffect, useRef, useState } from 'react'
import AdminBar from './AdminBar'
import AdminLogin from './AdminLogin'
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
 * Le formulaire de connexion est piloté par l'état local showLoginModal
 * et exposé via un ref que le pied de page peut appeler.
 */

// Ref globale pour permettre au pied de page d'ouvrir la modale
const adminBarWrapperRef = {
  openLoginForm: (() => {}) as () => void
}

export function openAdminLoginForm() {
  adminBarWrapperRef.openLoginForm()
}

export default function AdminBarWrapper() {
  const remoteAvailable = isRemoteConfigured()
  const { refreshSession } = useAdmin()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const openLoginFormRef = useRef(() => setShowLoginModal(true))

  // Mettre à jour la ref avec la dernière fonction (cleanup approprié)
  useEffect(() => {
    adminBarWrapperRef.openLoginForm = openLoginFormRef.current
    return () => {
      // Cleanup : ne pas laisser de ref orpheline
      adminBarWrapperRef.openLoginForm = () => {}
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

  return (
    <>
      <AdminBar />
      {showLoginModal && (
        <AdminLogin
          onSuccess={() => {
            setShowLoginModal(false)
          }}
          onRefreshSession={refreshSession}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </>
  )
}
