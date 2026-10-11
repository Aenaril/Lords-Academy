import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageDisplaySettings } from '../../data/tutorials'
import { resolveDisplay } from './imageDisplay'
import './HeroImageBlock.css'

interface HeroImageBlockProps {
  imagePath: string
  alt: string
  heading?: string
  content: string
  align?: 'left' | 'center' | 'right'
  caption?: string
  display?: ImageDisplaySettings
}

export default function HeroImageBlock({
  imagePath,
  alt,
  heading,
  content,
  align = 'left',
  caption,
  display
}: HeroImageBlockProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const r = resolveDisplay(display)

  // Dans l'image immersive, l'image est un fond plein cadre : on pilote le
  // cadrage via object-fit / object-position / zoom. La hauteur du cadre peut
  // suivre un ratio ou une hauteur personnalisée.
  const frameStyle: CSSProperties = {}
  if (r.aspect === 'custom' && r.customHeight) {
    frameStyle.height = `${r.customHeight}px`
  } else if (r.aspect !== 'auto') {
    frameStyle.aspectRatio =
      r.aspect === 'banner' ? '21 / 9'
      : r.aspect === '16:9' ? '16 / 9'
      : r.aspect === '4:3' ? '4 / 3'
      : '1 / 1'
  }

  const imgStyle: CSSProperties = {
    objectFit: r.fit,
    objectPosition: `${r.posX}% ${r.posY}%`,
    transform: r.zoom !== 1 ? `scale(${r.zoom})` : undefined,
    transformOrigin: `${r.posX}% ${r.posY}%`
  }

  return (
    <figure className="hero-image-block">
      <div
        className={`hero-image-block__frame hero-image-block__frame--${align}`}
        style={frameStyle}
      >
        {/* Image complète, proportions conservées, estompée en arrière-plan */}
        <img
          src={imagePath}
          alt={alt}
          className={`hero-image-block__img ${isLoaded ? 'hero-image-block__img--loaded' : ''}`}
          style={imgStyle}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
        />
        {!isLoaded && <div className="hero-image-block__skeleton" />}

        {/* Voile sombre pour estomper l'image et garantir la lisibilité */}
        <div className="hero-image-block__scrim" />

        {/* Texte superposé par-dessus */}
        <div className="hero-image-block__overlay">
          {heading && <h3 className="hero-image-block__heading">{heading}</h3>}
          <p className="hero-image-block__text">{content}</p>
        </div>
      </div>

      {caption && (
        <figcaption className="hero-image-block__caption">📸 {caption}</figcaption>
      )}
    </figure>
  )
}
