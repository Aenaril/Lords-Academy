/**
 * Hook : liste des tutoriels publiés (pour sélecteurs de destination)
 *
 * Utilisé par les modules Annonces, Événements et Notifications pour permettre
 * de choisir une destination/tutoriel associé parmi les tutoriels réellement
 * publiés (pas de saisie libre d'ID).
 *
 * Fusionne les tutoriels statiques et ceux publiés via l'API, comme HomePage.
 */

import { useState, useEffect } from 'react'
import { tutorials as staticTutorials } from '../data/tutorials'

export interface PublishedTutorialRef {
  id: string
  title: string
}

export function usePublishedTutorials(): PublishedTutorialRef[] {
  const [list, setList] = useState<PublishedTutorialRef[]>(() =>
    staticTutorials
      .filter((t) => t.status === 'published')
      .map((t) => ({ id: t.id, title: t.title }))
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/tutorials/published', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!data?.tutorials || !Array.isArray(data.tutorials)) return

        const publishedMap = new Map<string, any>(
          data.tutorials.map((t: any) => [t.id, t])
        )

        // Fusion : statiques publiés + dynamiques publiés, sans doublon
        const merged = new Map<string, PublishedTutorialRef>()
        for (const t of staticTutorials) {
          const pub = publishedMap.get(t.id)
          const effective = pub ?? t
          if (effective.status === 'published') {
            merged.set(t.id, { id: t.id, title: effective.title ?? t.title })
          }
        }
        for (const [id, t] of publishedMap) {
          if (!merged.has(id) && t.status === 'published') {
            merged.set(id, { id, title: t.title ?? id })
          }
        }

        if (!cancelled) setList([...merged.values()])
      } catch {
        // Garder la liste statique en fallback
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return list
}
