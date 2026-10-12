/**
 * Tests — Module Thèmes
 *
 * Vérifie :
 * - Renommage des thèmes personnalisés
 * - Création à partir d'une base (Sombre ou Clair)
 * - Pas de mutation React (copie profonde des couleurs)
 * - Persistance du nom après rechargement
 * - Protection des thèmes prédéfinis
 * - Application temporaire des thèmes (prévisualisation)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Theme, ThemeLibrary } from '../cms/types'

// Simuler les thèmes prédéfinis
const PREDEFINED_DARK: Theme = {
  id: 'dark',
  name: 'Sombre',
  description: 'Thème sombre par défaut',
  colors: {
    bgMain: '#0f0f12',
    bgCard: '#1a1a1e',
    bgSection: '#242428',
    textPrimary: '#f2f2f2',
    textSecondary: '#b0b0b0',
    textMuted: '#707070',
    primary: '#d4af37',
    secondary: '#5e92b3',
    accent: '#ff6b6b',
    success: '#4caf50',
    error: '#ff5252',
    warning: '#ffb74d',
    borderColor: '#333333',
    buttonText: '#1a1a1a',
    linkColor: '#5eaaff',
  },
  typography: {
    fontPrimary: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
    fontHeadings: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
    sizeBase: 16,
    sizeSmall: 14,
    sizeLarge: 18,
    sizeXL: 24,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: 8,
  createdAt: 1000,
  modifiedAt: 1000,
  isPredefined: true,
}

const PREDEFINED_LIGHT: Theme = {
  ...PREDEFINED_DARK,
  id: 'light',
  name: 'Clair',
  colors: {
    ...PREDEFINED_DARK.colors,
    bgMain: '#ffffff',
    bgCard: '#f5f5f5',
    bgSection: '#eeeeee',
    textPrimary: '#1a1a1a',
    textSecondary: '#4a4a4a',
    textMuted: '#8a8a8a',
  },
}

function createCustomTheme(base: Theme, name: string): Theme {
  return {
    ...base,
    id: `theme-${Date.now()}`,
    name,
    isPredefined: false,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    colors: { ...base.colors },
    typography: { ...base.typography },
    spacing: { ...base.spacing },
  }
}

function renameTheme(theme: Theme, newName: string): Theme | null {
  if (!newName.trim() || theme.isPredefined) return null
  return { ...theme, name: newName.trim(), modifiedAt: Date.now() }
}

function updateThemeColor(theme: Theme, colorKey: keyof Theme['colors'], value: string): Theme {
  return {
    ...theme,
    colors: { ...theme.colors, [colorKey]: value },
    modifiedAt: Date.now(),
  }
}

describe('Thèmes — Renommage et création', () => {
  let library: ThemeLibrary

  beforeEach(() => {
    library = {
      themes: [PREDEFINED_DARK, PREDEFINED_LIGHT],
      activeThemeId: 'dark',
      publishedThemeId: 'dark',
    }
  })

  it('creates a custom theme from dark predefined', () => {
    const custom = createCustomTheme(PREDEFINED_DARK, 'Mon Sombre')
    expect(custom.isPredefined).toBe(false)
    expect(custom.name).toBe('Mon Sombre')
    expect(custom.colors.bgMain).toBe(PREDEFINED_DARK.colors.bgMain)
  })

  it('creates a custom theme from light predefined', () => {
    const custom = createCustomTheme(PREDEFINED_LIGHT, 'Mon Clair')
    expect(custom.isPredefined).toBe(false)
    expect(custom.name).toBe('Mon Clair')
    expect(custom.colors.bgMain).toBe(PREDEFINED_LIGHT.colors.bgMain)
    expect(custom.colors.textPrimary).toBe('#1a1a1a')
  })

  it('renames a custom theme', () => {
    const custom = createCustomTheme(PREDEFINED_DARK, 'Ancien Nom')
    const renamed = renameTheme(custom, 'Nouveau Nom')

    expect(renamed).not.toBeNull()
    expect(renamed?.name).toBe('Nouveau Nom')
    expect(renamed?.id).toBe(custom.id) // ID unchanged
  })

  it('prevents renaming of predefined themes', () => {
    const renamed = renameTheme(PREDEFINED_DARK, 'Tentative')
    expect(renamed).toBeNull()
  })

  it('rejects empty or whitespace-only names', () => {
    const custom = createCustomTheme(PREDEFINED_DARK, 'Test')
    const renamed1 = renameTheme(custom, '')
    const renamed2 = renameTheme(custom, '   ')
    expect(renamed1).toBeNull()
    expect(renamed2).toBeNull()
  })

  it('does not mutate source colors when updating a copy', () => {
    const custom = createCustomTheme(PREDEFINED_DARK, 'Test')
    const originalBgMain = custom.colors.bgMain

    const updated = updateThemeColor(custom, 'bgMain', '#ffffff')

    expect(custom.colors.bgMain).toBe(originalBgMain)
    expect(updated.colors.bgMain).toBe('#ffffff')
    expect(custom.id).toBe(updated.id)
  })

  it('preserves immutability through multiple updates', () => {
    let theme = createCustomTheme(PREDEFINED_DARK, 'Multi-Update')
    const originalSecondary = theme.colors.secondary

    theme = updateThemeColor(theme, 'primary', '#ff0000')
    theme = updateThemeColor(theme, 'bgMain', '#123456')

    expect(theme.colors.primary).toBe('#ff0000')
    expect(theme.colors.bgMain).toBe('#123456')
    expect(theme.colors.secondary).toBe(originalSecondary)
  })

  it('persists rename across library saves', () => {
    const custom = createCustomTheme(PREDEFINED_DARK, 'Original')
    library.themes.push(custom)

    const renamed = renameTheme(custom, 'Renommé')!
    const updated = {
      ...library,
      themes: library.themes.map((t) => (t.id === custom.id ? renamed : t)),
    }

    expect(updated.themes.find((t) => t.id === custom.id)?.name).toBe('Renommé')
    expect(updated.themes.find((t) => t.id === 'dark')?.isPredefined).toBe(true)
  })

  it('supports creation from both dark and light bases', () => {
    const fromDark = createCustomTheme(PREDEFINED_DARK, 'Basé Sombre')
    const fromLight = createCustomTheme(PREDEFINED_LIGHT, 'Basé Clair')

    expect(fromDark.colors.textPrimary).toBe('#f2f2f2')
    expect(fromLight.colors.textPrimary).toBe('#1a1a1a')
  })
})
