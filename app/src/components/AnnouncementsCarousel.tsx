/**
 * Carrousel d'annonces — animé, navigable, responsive
 *
 * - Défilement horizontal avec transition fluide
 * - Navigation : flèches précédent/suivant + points indicateurs
 * - Lecture automatique (pause au survol)
 * - Responsive : 1 carte visible à la fois sur mobile, centrée sur desktop
 * - Clic sur une annonce → ouverture du tutoriel ciblé ou lien externe
 * - Accessible : aria-labels, navigation clavier
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Announcement } from '../cms/types'
import './AnnouncementsCarousel.css'

interface AnnouncementsCarouselProps {
  announcements: Announcement[]
  onSelectTutorial: (tutorialId: string) => void
}

const AUTOPLAY_INTERVAL = 6000 // 6s

export default function AnnouncementsCarousel({
  announcements,
  onSelectTutorial,
}: AnnouncementsCarouselProps) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const count = announcements.length

  const goTo = useCallback(
    (index: number) => {
      setCurrent(((index % count) + count) % count) // wrap-around
    },
    [count]
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  // Lecture automatique
  useEffect(() => {
    if (paused || count <= 1) return
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % count)
    }, AUTOPLAY_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [paused, count])

  // Si le nombre d'annonces change, borner l'index courant
  useEffect(() => {
    if (current >= count) setCurrent(0)
  }, [count, current])

  if (count === 0) return null

  const handleActivate = (ann: Announcement) => {
    if (ann.linkType === 'tutorial' && ann.buttonLink) {
      onSelectTutorial(ann.buttonLink)
    } else if (ann.linkType === 'internal' && ann.buttonLink) {
      onSelectTutorial(ann.buttonLink)
    } else if (ann.linkType === 'external' && ann.buttonLink) {
      window.open(ann.buttonLink, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <section
      className="announcements-carousel"
      aria-roledescription="carrousel"
      aria-label="Annonces"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="carousel__viewport">
        <div
          className="carousel__track"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {announcements.map((ann, idx) => (
            <div
              className="carousel__slide"
              key={ann.id}
              aria-hidden={idx !== current}
              role="group"
              aria-roledescription="diapositive"
              aria-label={`${idx + 1} sur ${count}`}
            >
              <div
                className="announcement-card"
                style={{ backgroundColor: ann.bgColor, color: ann.textColor }}
                onClick={() => handleActivate(ann)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleActivate(ann)
                  }
                }}
                role="button"
                tabIndex={idx === current ? 0 : -1}
              >
                {ann.imageUrl && (
                  <div className="announcement-card__image">
                    <img src={ann.imageUrl} alt={ann.title} loading="lazy" />
                  </div>
                )}
                <div className="announcement-card__body">
                  <h3 className="announcement-card__title">{ann.title}</h3>
                  <p className="announcement-card__desc">{ann.description}</p>
                  {ann.buttonText && (
                    <span
                      className="announcement-card__btn"
                      style={{ backgroundColor: ann.textColor, color: ann.bgColor }}
                    >
                      {ann.buttonText}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            className="carousel__arrow carousel__arrow--prev"
            onClick={prev}
            aria-label="Annonce précédente"
            type="button"
          >
            ‹
          </button>
          <button
            className="carousel__arrow carousel__arrow--next"
            onClick={next}
            aria-label="Annonce suivante"
            type="button"
          >
            ›
          </button>

          <div className="carousel__dots" role="tablist" aria-label="Choisir une annonce">
            {announcements.map((_, idx) => (
              <button
                key={idx}
                className={`carousel__dot ${idx === current ? 'is-active' : ''}`}
                onClick={() => goTo(idx)}
                aria-label={`Aller à l'annonce ${idx + 1}`}
                aria-selected={idx === current}
                role="tab"
                type="button"
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
