import AdminBar from './AdminBar'

/**
 * Wrapper conditionnel pour AdminBar.
 * 
 * - En développement (local) : Affiche AdminBar pour éditer en mode démo.
 * - En production (GitHub Pages) : AdminBar est masqué.
 * 
 * L'architecture admin reste fonctionnelle pour permettre l'authentification
 * sécurisée lorsque le Worker Cloudflare sera configuré.
 * 
 * Les visiteurs voient uniquement le contenu pédagogique ; l'authentification
 * passera par le Worker (par exemple en détectant une clé admin en cookie)
 * sans exposer de boutons au navigateur.
 */
export default function AdminBarWrapper() {
  // import.meta.env.DEV est true en local, false en production (GitHub Pages)
  if (!import.meta.env.DEV) {
    return null
  }
  return <AdminBar />
}
