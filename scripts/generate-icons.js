#!/usr/bin/env node

/**
 * Script pour générer les icônes PNG PWA
 * Utilise la librairie sharp si disponible, sinon affiche les instructions
 */

const fs = require('fs')
const path = require('path')

const iconsDir = path.join(__dirname, '../app/public/icons')

// Vérifier si sharp est installé
let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('❌ sharp n\'est pas installé')
  console.log('\nPour générer les icônes PNG automatiquement:')
  console.log('  npm install --save-dev sharp')
  console.log('  node scripts/generate-icons.js')
  process.exit(1)
}

// Couleurs du branding
const PRIMARY_COLOR = '#C41E3A'
const WHITE = '#FFFFFF'
const SYMBOL = '⚔️'

// Configurations des icônes
const icons = [
  {
    name: 'icon-192.png',
    size: 192,
    bgColor: PRIMARY_COLOR,
    textColor: WHITE
  },
  {
    name: 'icon-512.png',
    size: 512,
    bgColor: PRIMARY_COLOR,
    textColor: WHITE
  },
  {
    name: 'apple-touch-icon-180.png',
    size: 180,
    bgColor: WHITE,
    textColor: PRIMARY_COLOR,
    hasBorder: true
  }
]

async function generateIcons() {
  for (const icon of icons) {
    try {
      // Créer une image SVG inline et la convertir en PNG
      const svgImage = `
        <svg width="${icon.size}" height="${icon.size}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${icon.size}" height="${icon.size}" fill="${icon.bgColor}" />
          ${icon.hasBorder ? `<rect x="8" y="8" width="${icon.size - 16}" height="${icon.size - 16}" fill="none" stroke="${icon.textColor}" stroke-width="8" />` : ''}
          <text x="${icon.size / 2}" y="${icon.size / 2 + icon.size / 8}" 
                text-anchor="middle" 
                font-size="${icon.size * 0.5}" 
                font-weight="bold"
                fill="${icon.textColor}"
                font-family="Arial, sans-serif">
            ⚔
          </text>
        </svg>
      `

      const buffer = Buffer.from(svgImage)
      const outputPath = path.join(iconsDir, icon.name)

      await sharp(buffer, { density: 150 })
        .png()
        .resize(icon.size, icon.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .toFile(outputPath)

      console.log(`✓ ${icon.name} généré (${icon.size}×${icon.size})`)
    } catch (err) {
      console.error(`✗ Erreur lors de la génération de ${icon.name}:`, err.message)
      process.exit(1)
    }
  }

  console.log('\n✅ Toutes les icônes ont été générées avec succès!')
  console.log(`   Dossier : ${iconsDir}`)
}

generateIcons().catch((err) => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
