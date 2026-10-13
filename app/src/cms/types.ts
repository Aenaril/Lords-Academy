/**
 * Types centralisés pour l'Étape 3 (CMS — Thèmes, Annonces, Événements, Notifications)
 *
 * Inclut les types métier complets + réexports des types publication API
 */

// ═══════════════════════════════════════════════════════════════
// TYPES PUBLICATION (réexportés depuis PublicationTypes)
// ═══════════════════════════════════════════════════════════════
export type { PublicationResponse, PublishUIStatus } from './PublicationTypes';
export { PublicationStatus } from './PublicationTypes';

// ═══════════════════════════════════════════════════════════════
// THÈMES ET PERSONNALISATION
// ═══════════════════════════════════════════════════════════════

export interface ThemeColors {
  // Fond et cartes
  bgMain: string;
  bgCard: string;
  bgSection: string;
  // Textes
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Accent
  primary: string;
  secondary: string;
  accent: string;
  // États
  success: string;
  error: string;
  warning: string;
  // Éléments
  borderColor: string;
  buttonText: string;
  linkColor: string;
}

export interface ThemeTypography {
  fontPrimary: string;
  fontHeadings: string;
  sizeBase: number;
  sizeSmall: number;
  sizeLarge: number;
  sizeXL: number;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  borderRadius: number;
  createdAt: number;
  modifiedAt: number;
  isPredefined: boolean; // Thème prédéfini : non modifiable
}

export interface ThemeLibrary {
  themes: Theme[];
  activeThemeId: string;
  publishedThemeId: string;
  /** Numéro de révision monotone du dernier thème publié (évite les retours arrière) */
  publishedRevision?: number;
  /** Timestamp de la dernière publication confirmée */
  publishedAt?: number;
}

export interface TutorialThemeOverrides {
  tutorialId: string;
  themeId?: string; // null → hérité du global
  colorOverrides?: Partial<ThemeColors>;
  modifiedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// ANNONCES ET ÉVÉNEMENTS
// ═══════════════════════════════════════════════════════════════

export interface Announcement {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  bgColor: string;
  textColor: string;
  buttonText: string;
  buttonLink: string; // Lien ou tutorialId
  linkType: 'tutorial' | 'internal' | 'external'; // Type de lien
  order: number;
  enabled: boolean;
  visibilityStartAt?: number; // Timestamp (UTC)
  visibilityEndAt?: number; // Timestamp (UTC)
  eventId?: string; // Associée à un événement
  createdAt: number;
  modifiedAt: number;
}

export interface Event {
  id: string;
  name: string;
  description: string;
  startAt: number; // Timestamp (UTC)
  endAt?: number; // Timestamp (UTC) — facultatif
  tutorialId: string; // Tutoriel associé
  status: 'active' | 'cancelled' | 'completed';
  createdAt: number;
  modifiedAt: number;
}

export interface NotificationReminder {
  id: string
  enabled: boolean
  // Timing : '-24h', '-12h', '-6h', '-3h', '-1h', '-30m'
  relativeDelay: string // ex: '-24h' — relatif à absoluteTime de la notification parente
  sentAt?: number // Timestamp d'envoi réel (si envoyé)
  status: 'pending' | 'sent' | 'failed'
}

export interface EventNotificationSchedule {
  id: string
  enabled: boolean
  // Contenu du rappel — indépendant d'un événement
  title: string
  message: string
  imageUrl?: string
  // Destination
  tutorialId?: string // Tutoriel de destination (optionnel)
  // Timing absolu : quand déclencher les rappels (heure belge → stocké UTC)
  absoluteTime: number // timestamp UTC — l'instant de base pour tous les rappels
  // Jusqu'à 3 rappels relatifs à absoluteTime
  relativeReminders: NotificationReminder[] // Max 3
  // Métadonnées
  createdAt: number
  modifiedAt: number
  // ⚠️ DÉPRÉCIÉ — pour migration seulement
  eventId?: string // Ancien lien (à supprimer après migration)
}

export interface NotificationSubscription {
  id: string;
  endpoint: string;
  p256dh: string; // Clé ECDH en Base64
  auth: string; // Clé d'authentification en Base64
  userAgent?: string;
  createdAt: number;
}

export interface NotificationSendLog {
  id: string;
  scheduleId: string;
  subscriptionId: string;
  sentAt: number;
  status: 'success' | 'failed' | 'invalid';
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// MÉDIATHÈQUE
// ═══════════════════════════════════════════════════════════════

export interface MediaItem {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  altText: string;
  description?: string;
  createdAt: number;
  usedBy?: {
    tutorialId?: string;
    homeCarouselId?: string;
    announcementId?: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// ACCUEIL ET PARAMÈTRES
// ═══════════════════════════════════════════════════════════════

export interface HomePageConfig {
  title: string;
  subtitle: string;
  introText: string;
  heroImageUrl?: string;
  heroBackgroundColor?: string;
  sections: {
    available: { visible: boolean; title: string };
    comingSoon: { visible: boolean; title: string };
    categories: { visible: boolean; title: string };
  };
}

export interface SiteSettings {
  siteName: string;
  siteDescription: string;
  logoUrl?: string;
  faviconUrl?: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
  contactEmail?: string;
}
