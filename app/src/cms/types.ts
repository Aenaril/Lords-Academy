/**
 * Types CMS (interfaces de base)
 * 
 * Note: Les types complets sont définis ailleurs dans chaque module.
 * Ce fichier contient les définitions minimales communes.
 */

// Import from PublicationTypes for API types
export type { PublicationResponse, PublishUIStatus } from './PublicationTypes'
export { PublicationStatus } from './PublicationTypes'

// Placeholder pour les types qui seront définis par les modules
// (utilisé par d'autres fichiers qui les importent)
export interface Theme {
  id: string
  name: string
  description?: string
  colors: Record<string, string>
  typography: Record<string, any>
  spacing: Record<string, number>
  borderRadius: number
  createdAt?: number
  modifiedAt?: number
  isPredefined: boolean
  [key: string]: any
}

export interface ThemeColors {
  bgMain: string
  bgCard: string
  bgSection: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  primary: string
  secondary: string
  accent: string
  success: string
  error: string
  warning: string
  borderColor: string
  buttonText: string
  linkColor: string
}

export interface ThemeLibrary {
  themes: Theme[]
  activeThemeId: string
  publishedThemeId: string
  publishedRevision?: number
  publishedAt?: number
}

export interface Announcement {
  id: string
  title: string
  description: string
  buttonText: string
  bgColor: string
  textColor?: string
  imageUrl?: string
  linkType?: 'internal' | 'external' | 'tutorial'
  buttonLink?: string
  isActive?: boolean
  enabled?: boolean
  order?: number
  visibilityStartAt?: number
  visibilityEndAt?: number
  createdAt?: number
  modifiedAt?: number
  [key: string]: any
}

export interface Event {
  id: string
  name: string
  startAt: number
  tutorialId: string
  status?: 'active' | 'inactive' | 'cancelled' | 'completed'
  isActive?: boolean
  description?: string
  endAt?: number
  createdAt?: number
  modifiedAt?: number
  [key: string]: any
}

export interface HomePageConfig {
  title: string
  subtitle: string
  introText?: string
  heroImageUrl?: string
  heroBackgroundColor?: string
  sections: Record<string, any>
}

export interface SiteSettings {
  siteName: string
  siteDescription: string
  contactEmail?: string
  privacyPolicyUrl?: string
  termsUrl?: string
  faviconUrl?: string
  logoUrl?: string
}

export interface EventNotificationSchedule {
  id: string
  eventId: string
  tutorialId?: string
  title: string
  message?: string
  imageUrl?: string
  scheduled?: number
  absoluteTime?: number
  timing?: 'relative' | 'absolute'
  relativeDelay?: string
  status?: 'pending' | 'sent' | 'failed'
  enabled?: boolean
  [key: string]: any
}

export interface MediaItem {
  id: string
  name?: string
  url: string
  type?: 'image' | 'video'
  filename?: string
  size?: number
  width?: number
  height?: number
  altText?: string
  description?: string
  mimeType?: string
  createdAt?: number
  [key: string]: any
}
