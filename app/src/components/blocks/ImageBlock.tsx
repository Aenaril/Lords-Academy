import { useState } from 'react'
import type { ImageDisplaySettings } from '../../data/tutorials'
import { frameStyle, imageStyle, resolveDisplay } from './imageDisplay'
import './ImageBlock.css'

interface ImageBlockProps {
  imagePath: string
  caption?: string
  alt: string
  display?: ImageDisplaySettings
}

export default function ImageBlock({ imagePath, caption, alt, display }: ImageBlockProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const r = resolveDisplay(display)
  const hasFixedFrame = r.aspect !== 'auto'

  return (
    <div className="image-block">
      <div
        className={`image-block__container ${hasFixedFrame ? 'image-block__container--framed' : ''}`}
        style={frameStyle(display)}
      >
        <img
          src={imagePath}
          alt={alt}
          className={`image-block__img ${isLoaded ? 'image-block__img--loaded' : ''}`}
          style={imageStyle(display)}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
        />
        {!isLoaded && <div className="image-block__skeleton" />}
      </div>

      {caption && (
        <p className="image-block__caption">
          📸 {caption}
        </p>
      )}
    </div>
  )
}
