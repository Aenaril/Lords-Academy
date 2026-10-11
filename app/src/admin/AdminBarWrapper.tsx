import { useMemo } from 'react'
import AdminBar from './AdminBar'
import { isRemoteConfigured } from './api/client'

/**
 * Wrapper conditionnel pour AdminBar.
 * 
 * - En développement (local, DEV=true) : AdminBar toujours visible pour éditer.
 * - En production (DEV=false) :
 *   - Si API distante configurée (VITE_ADMIN_API_BASE non-vide) : AdminBar visible
 *     (les visiteurs sans session voient le formulaire de connexion)
 *   - Sinon : AdminBar masqué
 * 
 * L'interface de connexion sécurisée (mot de passe + cookie HttpOnly) reste
 * invisible jusqu'à ce qu'un R4 authentifié le souhaite.
 */
export default function AdminBarWrapper() {
  const remoteAvailable = useMemo(() => isRemoteConfigured(), [])
  
  // En développement : toujours afficher
  if (import.meta.env.DEV) {
    return <AdminBar />
  }
  
  // En production : afficher uniquement si API distante configurée
  if (!remoteAvailable) {
    return null
  }
  
  return <AdminBar />
}
