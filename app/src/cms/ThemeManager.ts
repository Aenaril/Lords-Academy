/**
 * ThemeManager — Applique les thèmes CMS au DOM et génère CSS dynamique
 * 
 * Convertit les configurations thème en variables CSS pour injection au DOM
 */

import type { Theme } from './types'

/**
 * Générer CSS depuis une configuration de thème
 */
export function generateThemeCss(theme: Theme | null): string {
  if (!theme) return ''

  const colors = theme.colors
  const typo = theme.typography
  const spacing = theme.spacing

  return `
    :root {
      /* Couleurs — Variables CMS standard */
      --bg-main: ${colors.bgMain};
      --bg-card: ${colors.bgCard};
      --bg-section: ${colors.bgSection};
      --text-primary: ${colors.textPrimary};
      --text-secondary: ${colors.textSecondary};
      --text-muted: ${colors.textMuted};
      --primary: ${colors.primary};
      --secondary: ${colors.secondary};
      --accent: ${colors.accent};
      --success: ${colors.success};
      --error: ${colors.error};
      --warning: ${colors.warning};
      --border-color: ${colors.borderColor};
      --button-text: ${colors.buttonText};
      --link-color: ${colors.linkColor};

      /* Couleurs — Mapping vers variables CSS historiques du site */
      --bg-dark: ${colors.bgMain};
      --text-light: ${colors.textPrimary};
      --primary-gold: ${colors.primary};
      --border-subtle: ${colors.borderColor};

      /* Typographie */
      --font-primary: ${typo.fontPrimary};
      --font-headings: ${typo.fontHeadings};
      --size-base: ${typo.sizeBase}px;
      --size-small: ${typo.sizeSmall}px;
      --size-large: ${typo.sizeLarge}px;
      --size-xl: ${typo.sizeXL}px;

      /* Espacements */
      --space-xs: ${spacing.xs}px;
      --space-sm: ${spacing.sm}px;
      --space-md: ${spacing.md}px;
      --space-lg: ${spacing.lg}px;
      --space-xl: ${spacing.xl}px;

      /* Bordures */
      --border-radius: ${theme.borderRadius}px;
    }

    /* Appliquer les couleurs génériques */
    body {
      background-color: var(--bg-main);
      color: var(--text-primary);
      font-family: var(--font-primary);
      font-size: var(--size-base);
    }

    a {
      color: var(--link-color);
    }

    button, .btn {
      background-color: var(--primary);
      color: var(--button-text);
      border-radius: var(--border-radius);
    }

    .container {
      background-color: var(--bg-card);
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-headings);
      color: var(--text-primary);
    }

    .intro-section {
      background-color: var(--bg-section);
    }

    .intro-title {
      color: var(--text-primary);
    }

    .intro-text {
      color: var(--text-secondary);
    }
  `
}

/**
 * Injecter les styles thème dans le DOM
 */
export function applyTheme(theme: Theme | null): void {
  // Supprimer l'ancien style s'il existe
  const existingStyle = document.getElementById('cms-theme-styles')
  if (existingStyle) {
    existingStyle.remove()
  }

  // Créer et injecter le nouveau style
  const css = generateThemeCss(theme)
  if (css.trim()) {
    const styleEl = document.createElement('style')
    styleEl.id = 'cms-theme-styles'
    styleEl.textContent = css
    document.head.appendChild(styleEl)

    console.info('✅ Thème appliqué au DOM')
  }
}

/**
 * Mettre à jour les propriétés CSS personnalisées (CSS variables)
 */
export function updateCssVariables(variables: Record<string, string>): void {
  const root = document.documentElement
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value)
  })
}

/**
 * Observer les changements de thème (pour les changements en temps réel)
 */
const themeObservers: Set<(theme: Theme | null) => void> = new Set()

export function subscribeToThemeChanges(callback: (theme: Theme | null) => void): () => void {
  themeObservers.add(callback)
  return () => {
    themeObservers.delete(callback)
  }
}

export function notifyThemeChanged(theme: Theme | null): void {
  applyTheme(theme)
  themeObservers.forEach(callback => {
    try {
      callback(theme)
    } catch (err) {
      console.error('Erreur observer thème:', err)
    }
  })
}
