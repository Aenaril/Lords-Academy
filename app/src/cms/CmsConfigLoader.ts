/**
 * CmsConfigLoader — Charge les configurations CMS au démarrage d'App
 * 
 * Fournit un contexte global pour les configs CMS :
 * - Thèmes
 * - Accueil (home.json)
 * - Annonces
 * - Paramètres site
 * - Événements
 * - Notifications
 */

import type { Theme, HomePageConfig, Announcement, SiteSettings, Event, EventNotificationSchedule } from './types'

export interface CmsConfig {
  theme: Theme | null
  homeConfig: HomePageConfig | null
  announcements: Announcement[]
  siteSettings: SiteSettings | null
  events: Event[]
  notificationSchedules: EventNotificationSchedule[]
  loadedAt: number
  errors: string[]
}

// État global CMS
let globalCmsConfig: CmsConfig | null = null
let isLoading = false
let loadPromise: Promise<CmsConfig> | null = null

// ─────────────────────────────────────────────────────────────
// Système d'abonnement — permet aux composants React de se
// re-render quand la config CMS est chargée ou rechargée.
// Corrige la race condition : loadCmsConfigs() est asynchrone,
// mais getActiveAnnouncements()/getActiveTheme() sont lues au
// render synchrone. Sans notification, HomePage n'affiche jamais
// les annonces chargées après le premier render.
// ─────────────────────────────────────────────────────────────
type CmsSubscriber = () => void
const subscribers = new Set<CmsSubscriber>()

/** S'abonner aux changements de config CMS. Retourne une fonction de désabonnement. */
export function subscribeCmsConfig(cb: CmsSubscriber): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

/** Notifier tous les abonnés d'un changement de config. */
function notifyCmsSubscribers(): void {
  for (const cb of subscribers) {
    try {
      cb()
    } catch (err) {
      console.error('Erreur notification abonné CMS:', err)
    }
  }
}

/** Version du cache — incrémentée à chaque changement (utilisé par useSyncExternalStore). */
let configVersion = 0
export function getCmsConfigVersion(): number {
  return configVersion
}

/**
 * Charger toutes les configs CMS depuis les fichiers publics
 */
export async function loadCmsConfigs(): Promise<CmsConfig> {
  // Si déjà chargé, retourner le cache
  if (globalCmsConfig && !isLoading) {
    return globalCmsConfig
  }

  // Si en cours de chargement, attendre
  if (isLoading && loadPromise) {
    return loadPromise
  }

  isLoading = true

  loadPromise = (async () => {
    const config: CmsConfig = {
      theme: null,
      homeConfig: null,
      announcements: [],
      siteSettings: null,
      events: [],
      notificationSchedules: [],
      loadedAt: Date.now(),
      errors: [],
    }

    try {
      // Charger thème
      try {
        const themeRes = await fetch('/cms/themes.json', { cache: 'no-store' })
        if (themeRes.ok) {
          const themeData = await themeRes.json()
          config.theme = themeData.theme || null
        }
      } catch (err) {
        config.errors.push(`Erreur chargement thème: ${(err as any).message}`)
      }

      // Charger config accueil
      try {
        const homeRes = await fetch('/cms/home.json', { cache: 'no-store' })
        if (homeRes.ok) {
          const homeData = await homeRes.json()
          config.homeConfig = homeData.config || null
        }
      } catch (err) {
        config.errors.push(`Erreur chargement accueil: ${(err as any).message}`)
      }

      // Charger annonces
      try {
        const annRes = await fetch('/cms/announcements.json', { cache: 'no-store' })
        if (annRes.ok) {
          const annData = await annRes.json()
          config.announcements = annData.announcements || []
        }
      } catch (err) {
        config.errors.push(`Erreur chargement annonces: ${(err as any).message}`)
      }

      // Charger paramètres site
      try {
        const settingsRes = await fetch('/cms/settings.json', { cache: 'no-store' })
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          config.siteSettings = settingsData.settings || null
        }
      } catch (err) {
        config.errors.push(`Erreur chargement paramètres: ${(err as any).message}`)
      }

      // Charger événements
      try {
        const eventsRes = await fetch('/cms/events.json', { cache: 'no-store' })
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json()
          config.events = eventsData.events || []
        }
      } catch (err) {
        config.errors.push(`Erreur chargement événements: ${(err as any).message}`)
      }

      // Charger planification notifications
      try {
        const notifRes = await fetch('/cms/notifications.json', { cache: 'no-store' })
        if (notifRes.ok) {
          const notifData = await notifRes.json()
          config.notificationSchedules = notifData.schedules || []
        }
      } catch (err) {
        config.errors.push(`Erreur chargement notifications: ${(err as any).message}`)
      }

      globalCmsConfig = config
      configVersion++
      console.info('✅ CMS configs chargés')
    } catch (err) {
      console.error('❌ Erreur critique chargement CMS:', err)
      globalCmsConfig = config
      configVersion++
    } finally {
      isLoading = false
      // Notifier les composants React abonnés (déclenche un re-render)
      notifyCmsSubscribers()
    }

    return config
  })()

  return loadPromise
}

/**
 * Obtenir la config CMS actuelle (cached)
 */
export function getCmsConfig(): CmsConfig | null {
  return globalCmsConfig
}

/**
 * Obtenir le thème actif
 */
export function getActiveTheme(): Theme | null {
  return globalCmsConfig?.theme || null
}

/**
 * Obtenir la config accueil
 */
export function getHomeConfig(): HomePageConfig | null {
  return globalCmsConfig?.homeConfig || null
}

/**
 * Obtenir les annonces actives (filtrées par date de visibilité)
 */
export function getActiveAnnouncements(): Announcement[] {
  if (!globalCmsConfig) return []

  const now = Date.now()
  return globalCmsConfig.announcements.filter(ann => {
    if (!ann.enabled) return false
    if (ann.visibilityStartAt && now < ann.visibilityStartAt) return false
    if (ann.visibilityEndAt && now > ann.visibilityEndAt) return false
    return true
  })
}

/**
 * Obtenir les paramètres site
 */
export function getSiteSettings(): SiteSettings | null {
  return globalCmsConfig?.siteSettings || null
}

/**
 * Invalider le cache — force un rechargement à la prochaine utilisation
 */
export function invalidateCmsCache(): void {
  globalCmsConfig = null
  loadPromise = null
}

/**
 * Recharger les configs immédiatement
 */
export async function reloadCmsConfigs(): Promise<CmsConfig> {
  invalidateCmsCache()
  const newConfig = await loadCmsConfigs()
  
  // ✅ Notifier les autres onglets du changement via storage event
  // (ce onglet se notifie via fonction directe, autres onglets via storage event)
  try {
    localStorage.setItem('cms:config:reloaded', JSON.stringify({
      timestamp: Date.now(),
      version: configVersion,
    }))
  } catch (err) {
    console.warn('Erreur localStorage broadcast:', err)
  }
  
  return newConfig
}

/**
 * Initialiser l'écoute des changements CMS d'autres onglets (cross-tab sync)
 * Appelé une fois au démarrage de l'app
 */
export function initCmsStorageListener(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === 'cms:config:reloaded' && event.newValue) {
      // Un autre onglet a reloadé les configs
      const incoming = JSON.parse(event.newValue)
      console.info(
        `📡 Autre onglet a reloadé CMS configs (v${incoming.version})`,
        `- reloading cette fenêtre...`
      )
      
      // Invalider le cache local et recharger
      invalidateCmsCache()
      loadCmsConfigs().then(() => {
        configVersion++
        notifyCmsSubscribers()
      })
    }
  })
}
