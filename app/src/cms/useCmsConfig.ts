/**
 * Hook React réactif pour les configurations CMS
 *
 * Corrige la race condition d'affichage : loadCmsConfigs() est asynchrone,
 * mais les composants lisent getActiveAnnouncements()/getActiveTheme() au
 * render synchrone. Ce hook s'abonne aux changements et déclenche un
 * re-render quand la config est chargée ou rechargée.
 *
 * Utilise useSyncExternalStore (React 18) pour une synchronisation correcte.
 */

import { useSyncExternalStore } from 'react'
import {
  subscribeCmsConfig,
  getCmsConfigVersion,
  getActiveAnnouncements,
  getActiveTheme,
  getHomeConfig,
  getSiteSettings,
} from './CmsConfigLoader'
import type { Announcement, Theme, HomePageConfig, SiteSettings } from './types'

/**
 * S'abonner à la version du cache CMS.
 * useSyncExternalStore re-render le composant quand getCmsConfigVersion() change.
 */
function useCmsVersion(): number {
  return useSyncExternalStore(
    subscribeCmsConfig,
    getCmsConfigVersion,
    getCmsConfigVersion // valeur côté serveur (SSR) — identique ici
  )
}

/** Annonces actives, réactives au chargement/rechargement de la config. */
export function useActiveAnnouncements(): Announcement[] {
  useCmsVersion()
  return getActiveAnnouncements()
}

/** Thème actif, réactif. */
export function useActiveTheme(): Theme | null {
  useCmsVersion()
  return getActiveTheme()
}

/** Config d'accueil, réactive. */
export function useHomeConfig(): HomePageConfig | null {
  useCmsVersion()
  return getHomeConfig()
}

/** Paramètres du site, réactifs. */
export function useSiteSettings(): SiteSettings | null {
  useCmsVersion()
  return getSiteSettings()
}
