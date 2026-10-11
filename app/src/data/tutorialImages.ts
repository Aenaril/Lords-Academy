import { assetPath } from '../utils/assetPath'

// Mapping des images de couverture pour chaque tutoriel
export const tutorialCoverImages: { [key: string]: string } = {
  'dragon-arena': assetPath('/images/content/dragon-arena/16.jpeg'),
  'attaque-defense': assetPath('/images/content/dragon-arena/17.jpeg'), // Utilisation temporaire
  'bataillons': assetPath('/images/content/dragon-arena/18.jpeg'),
  'epreuve-guilde': assetPath('/images/content/dragon-arena/19.jpeg'),
  'familiers-mono': assetPath('/images/content/dragon-arena/15.jpeg'),
  'phalanges-rangees': assetPath('/images/content/dragon-arena/16.jpeg'),
  'regles-generales': assetPath('/images/content/dragon-arena/17.jpeg'),
  'techniques-avancees': assetPath('/images/content/dragon-arena/19.jpeg')
}

// Configuration des images par section pour Dragon Arena
export const dragonArenaImages = {
  intro: {
    image: assetPath('/images/content/dragon-arena/15.jpeg'),
    caption: 'La carte de Dragon Arena : Hot Springs, Ancient Remains, Dragon Altar'
  },
  strategy: {
    image: assetPath('/images/content/dragon-arena/16.jpeg'),
    caption: 'Optimiser votre approche : améliorer vos troupes et vos talents'
  },
  gameplay: {
    image: assetPath('/images/content/dragon-arena/17.jpeg'),
    caption: 'Combat épique en Dragon Arena : mettez vos troupes en avant'
  },
  rewards: {
    image: assetPath('/images/content/dragon-arena/18.jpeg'),
    caption: 'Les châteaux de votre royaume reflètent votre puissance'
  },
  advanced: {
    image: assetPath('/images/content/dragon-arena/19.jpeg'),
    caption: 'Les héros au combat : exploitez leurs compétences spéciales'
  }
}
