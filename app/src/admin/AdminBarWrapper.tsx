import { useMemo, useState } from 'react'
import AdminBar from './AdminBar'
import AdminLogin from './AdminLogin'
import { isRemoteConfigured } from './api/client'

/**
 * Wrapper conditionnel pour AdminBar + gestion du formulaire de connexion.
 * 
 * - En développement (local, DEV=true) : AdminBar toujours visible pour éditer.
 * - En production (DEV=false) :
 *   - Si API distante configurée (VITE_ADMIN_API_BASE non-vide) : AdminBar visible
 *     (les visiteurs sans session voient le formulaire de connexion)
 *   - Sinon : AdminBar masqué
 * 
 * Cette modale expose aussi un callback pour que le lien du pied de page
 * ouvre directement le formulaire de connexion.
 */

export interface AdminBarHandle {
  openLoginForm: () => void
}

let globalAdminHandle: AdminBarHandle | null = null

export function setAdminBarHandle(handle: AdminBarHandle) {
  globalAdminHandle = handle
}

export function openAdminLoginForm() {
  globalAdminHandle?.openLoginForm()
}

export default function AdminBarWrapper() {
  const remoteAvailable = useMemo(() => isRemoteConfigured(), [])
  const [showLoginModal, setShowLoginModal] = useState(false)

  // Expose le callback pour que le lien du footer puisse l'appeler
  useMemo(() => {
    setAdminBarHandle({
      openLoginForm: () => setShowLoginModal(true)
    })
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
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </>
  )
}
