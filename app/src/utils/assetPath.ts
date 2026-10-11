/**
 * Résout un chemin d'image en tenant compte du base path de Vite (GitHub Pages ou local)
 * 
 * En local (dev) : base est '/'
 * Sur GitHub Pages : base est '/Lords-Academy/'
 * 
 * @param path - Chemin de l'image (ex: '/images/content/dragon-arena/15.jpeg')
 * @returns Chemin absolu correct pour l'environnement
 */
export function assetPath(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  if (path.startsWith('/')) {
    // Retirer le trailing slash du base et ajouter le chemin
    return base.replace(/\/$/, '') + path
  }
  return path
}
