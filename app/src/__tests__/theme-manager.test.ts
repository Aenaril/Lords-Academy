/**
 * Tests — ThemeManager
 *
 * Vérifie :
 * - Génération correcte des variables CSS
 * - Mapping des variables historiques (--bg-dark, --primary-gold, etc.)
 * - Application au DOM
 */

import { describe, it, expect } from 'vitest'
import { generateThemeCss } from '../cms/ThemeManager'
import type { Theme } from '../cms/types'

const TEST_THEME: Theme = {
  id: 'test',
  name: 'Test',
  description: 'Test theme',
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
    fontPrimary: 'Inter, sans-serif',
    fontHeadings: 'Georgia, serif',
    sizeBase: 16,
    sizeSmall: 14,
    sizeLarge: 18,
    sizeXL: 24,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: 8,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
  isPredefined: false,
}

describe('ThemeManager — CSS Generation', () => {
  it('generates CSS for a valid theme', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain(':root {')
    expect(css).toContain('--bg-main:')
    expect(css).toContain('--primary:')
  })

  it('returns empty string for null theme', () => {
    const css = generateThemeCss(null)
    expect(css).toBe('')
  })

  it('maps bg-main to historical --bg-dark', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('--bg-dark: #0f0f12;')
  })

  it('maps text-primary to historical --text-light', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('--text-light: #f2f2f2;')
  })

  it('maps primary to historical --primary-gold', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('--primary-gold: #d4af37;')
  })

  it('maps border-color to historical --border-subtle', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('--border-subtle: #333333;')
  })

  it('includes typography variables', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('--font-primary: Inter, sans-serif;')
    expect(css).toContain('--font-headings: Georgia, serif;')
    expect(css).toContain('--size-base: 16px;')
  })

  it('includes spacing variables', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('--space-xs: 4px;')
    expect(css).toContain('--space-md: 16px;')
    expect(css).toContain('--space-xl: 32px;')
  })

  it('applies body styling with generated variables', () => {
    const css = generateThemeCss(TEST_THEME)
    expect(css).toContain('body {')
    expect(css).toContain('background-color: var(--bg-main);')
    expect(css).toContain('color: var(--text-primary);')
  })

  it('includes all historical variable mappings', () => {
    const css = generateThemeCss(TEST_THEME)
    const mappings = [
      { historical: '--bg-dark', source: '--bg-main' },
      { historical: '--text-light', source: '--text-primary' },
      { historical: '--primary-gold', source: '--primary' },
      { historical: '--border-subtle', source: '--border-color' },
    ]

    mappings.forEach(({ historical }) => {
      expect(css).toContain(historical)
    })
  })
})
