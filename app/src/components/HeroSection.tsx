import './HeroSection.css'
import { assetPath } from '../utils/assetPath'

interface HeroSectionProps {
  backgroundImage?: string
  overlayOpacity?: number
  totalCount?: number
  availableCount?: number
  comingSoonCount?: number
}

export default function HeroSection({ 
  backgroundImage = assetPath('/images/content/dragon-arena/16.jpeg'),
  overlayOpacity = 0.5,
  totalCount = 8,
  availableCount = 1,
  comingSoonCount = 7
}: HeroSectionProps) {
  return (
    <section 
      className="hero-section"
      style={{
        backgroundImage: `url('${backgroundImage}')`,
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Overlay gradient */}
      <div 
        className="hero-section__overlay"
        style={{ opacity: overlayOpacity }}
      />
      
      {/* Content */}
      <div className="hero-section__content">
        <div className="hero-section__inner">
          <h1 className="hero-section__title">
            <span className="hero-section__icon">⚔️</span>
            Lords Mobile Academy
          </h1>
          <p className="hero-section__subtitle">
            Maîtrisez les tactiques, devenez un champion de votre guilde
          </p>
          <div className="hero-section__stats">
            <div className="hero-stat">
              <span className="hero-stat__number">{totalCount}</span>
              <span className="hero-stat__label">Tutoriels</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat__number">{availableCount}</span>
              <span className="hero-stat__label">Disponible{availableCount > 1 ? 's' : ''}</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat__number">{comingSoonCount}</span>
              <span className="hero-stat__label">À venir</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="hero-section__decoration hero-section__decoration--top-left" />
      <div className="hero-section__decoration hero-section__decoration--bottom-right" />
    </section>
  )
}
