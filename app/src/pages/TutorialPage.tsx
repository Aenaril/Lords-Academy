import { useState, useEffect, useRef } from 'react'
import { getTutorialById } from '../data/registry'
import { type Tutorial } from '../data/tutorials'
import ContentBlockComponent from '../components/ContentBlock'
import { useAdmin } from '../admin/AdminContext'
import { adminApi } from '../admin/api/client'
import type { EditableSection } from '../admin/types'
import EditableBlockWrapper from '../admin/EditableBlockWrapper'
import AddBlockBar from '../admin/AddBlockBar'
import SectionSettings from '../admin/SectionSettings'
import './TutorialPage.css'

interface TutorialPageProps {
  tutorialId: string
  onReturnHome: () => void
}

export default function TutorialPage({ tutorialId, onReturnHome }: TutorialPageProps) {
  const { isAdminMode, isPreview, tutorial: editableTutorial, updateSectionTitle, addSection, removeSection, duplicateSection, moveSection } = useAdmin()
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [publishedTutorial, setPublishedTutorial] = useState<Tutorial | null>(null)
  const [isLoadingPublished, setIsLoadingPublished] = useState(true)
  const [currentTutorialId, setCurrentTutorialId] = useState<string>(tutorialId)
  const sectionHeaderRef = useRef<HTMLDivElement>(null)

  // Réinitialiser l'index de section quand le tutoriel change
  useEffect(() => {
    if (tutorialId !== currentTutorialId) {
      setCurrentTutorialId(tutorialId)
      setCurrentSectionIndex(0)
      setPublishedTutorial(null)
      setIsLoadingPublished(true)
    }
  }, [tutorialId, currentTutorialId])

  // Charger le tutoriel publié depuis GitHub (si disponible)
  useEffect(() => {
    let refreshTimeout: number
    let isMounted = true

    const loadPublished = async () => {
      if (!isMounted) return
      try {
        setIsLoadingPublished(true)
        const res = await adminApi.getPublished(tutorialId)
        if (isMounted) {
          if (res.content) {
            setPublishedTutorial(res.content as Tutorial)
          }
          setIsLoadingPublished(false)
        }
      } catch {
        // Ignorer silencieusement les erreurs (fallback au contenu statique)
        if (isMounted) {
          setIsLoadingPublished(false)
        }
      }
    }

    // Charger immédiatement au montage
    loadPublished()

    // Vérifier toutes les 5 minutes si une nouvelle version est disponible
    refreshTimeout = window.setInterval(loadPublished, 5 * 60 * 1000)

    // Recharger aussi quand le Service Worker se met à jour
    if (navigator.serviceWorker) {
      const handleSWUpdate = () => {
        loadPublished()
      }

      navigator.serviceWorker.addEventListener('controllerchange', handleSWUpdate)
      return () => {
        isMounted = false
        window.clearInterval(refreshTimeout)
        navigator.serviceWorker.removeEventListener('controllerchange', handleSWUpdate)
      }
    }

    return () => {
      isMounted = false
      window.clearInterval(refreshTimeout)
    }
  }, [tutorialId])

  // Scroll vers le haut + fade in smooth lors du changement de section
  useEffect(() => {
    if (sectionHeaderRef.current) {
      // Scroll vers le titre avec décalage pour le header sticky
      sectionHeaderRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [currentSectionIndex])

  // Source de vérité : le tutoriel peut venir de trois sources :
  // 1. Brouillon en édition (editableTutorial, si connecté en admin)
  // 2. Version publiée sur GitHub (publishedTutorial)
  // 3. Fallback statique depuis le registre
  const sourceTutorial = getTutorialById(tutorialId)
  const tutorial: Tutorial | undefined =
    isAdminMode && editableTutorial
      ? editableTutorial
      : publishedTutorial ?? sourceTutorial ?? undefined
  const fallback = sourceTutorial ?? undefined

  const resolved = tutorial ?? fallback

  // Cas 1 : En cours de chargement d'un tutoriel dynamique (pas de fallback statique)
  if (isLoadingPublished && !sourceTutorial && !editableTutorial && !resolved) {
    return (
      <div className="tutorial-page tutorial-page--empty">
        <div className="container">
          <button className="btn btn-primary" onClick={onReturnHome}>
            ← Retour à l'accueil
          </button>
          <h2>Chargement du tutoriel…</h2>
          <p>Veuillez patienter.</p>
        </div>
      </div>
    )
  }

  // Cas 2 : Tutoriel inexistant (ni brouillon, ni publié, ni statique)
  if (!resolved) {
    return (
      <div className="tutorial-page tutorial-page--empty">
        <div className="container">
          <button className="btn btn-primary" onClick={onReturnHome}>
            ← Retour à l'accueil
          </button>
          <h2>Tutoriel non disponible</h2>
          <p>Ce tutoriel n'existe pas.</p>
        </div>
      </div>
    )
  }

  // Cas 3 : Brouillon vide en édition (admin connecté)
  if (isAdminMode && editableTutorial && (!resolved.sections || resolved.sections.length === 0)) {
    return (
      <div className="tutorial-page tutorial-page--empty">
        <div className="container">
          <button className="btn btn-secondary" onClick={onReturnHome}>
            ← Retour à l'accueil
          </button>
          <h2>Brouillon vide</h2>
          <p>Ce tutoriel est nouveau. Commencez par ajouter une première section.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              addSection()
              // La section sera ajoutée et le composant se re-rendra
            }}
          >
            + Ajouter la première section
          </button>
        </div>
      </div>
    )
  }

  // Cas 4 : Tutoriel vide mais pas en édition (visiteur non-admin)
  if (!resolved.sections || resolved.sections.length === 0) {
    return (
      <div className="tutorial-page tutorial-page--empty">
        <div className="container">
          <button className="btn btn-primary" onClick={onReturnHome}>
            ← Retour à l'accueil
          </button>
          <h2>Tutoriel non disponible</h2>
          <p>Ce tutoriel n'est pas encore implémenté dans ce prototype.</p>
        </div>
      </div>
    )
  }

  const sections = resolved.sections
  const safeIndex = Math.min(currentSectionIndex, sections.length - 1)
  const currentSection = sections[safeIndex]
  // En mode admin, la section porte un `_uid` (via le store éditable).
  const editableSection = currentSection as Partial<EditableSection>
  const sectionUid = editableSection._uid

  const progress = Math.round(((safeIndex + 1) / sections.length) * 100)
  const hasPrevious = safeIndex > 0
  const hasNext = safeIndex < sections.length - 1

  const editing = isAdminMode && !isPreview && !!sectionUid

  return (
    <div className="tutorial-page">
      {/* Header */}
      <header className="tutorial-header">
        <div className="tutorial-header__top">
          <button className="btn btn-secondary btn-small" onClick={onReturnHome}>
            ← Retour
          </button>
          <div className="tutorial-header__progress">
            <div className="progress-bar">
              <div className="progress-bar__fill" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="progress-text">{progress}%</span>
          </div>
        </div>
      </header>

      <div className="tutorial-container">
        {/* Sidebar Navigation (Desktop) */}
        <aside className="tutorial-sidebar">
          <nav className="tutorial-nav">
            <h3 className="tutorial-nav__title">Table des matières</h3>
            <ul className="tutorial-nav__list">
              {sections.map((section: any, idx: number) => (
                <li key={section.id} className="tutorial-nav__item">
                  <button
                    className={`tutorial-nav__link ${idx === safeIndex ? 'tutorial-nav__link--active' : ''}`}
                    onClick={() => setCurrentSectionIndex(idx)}
                  >
                    {idx + 1}. {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="tutorial-main">
          {/* Section Title */}
          <div className="section-header" ref={sectionHeaderRef}>
            {editing ? (
              <div className="section-title-edit">
                <span className="section-title-edit__pencil" title="Modifier le titre de la section">✏️</span>
                <input
                  className="section-title-edit__input"
                  value={currentSection.title}
                  onChange={(e) => updateSectionTitle(sectionUid!, e.target.value)}
                  aria-label="Titre de la section"
                />
                {/* Section action buttons */}
                <div className="section-actions">
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => addSection(sectionUid)}
                    title="Ajouter une section après celle-ci"
                  >
                    ➕
                  </button>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => duplicateSection(sectionUid)}
                    title="Dupliquer cette section"
                  >
                    📋
                  </button>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => {
                      if (sections.length > 1 && window.confirm(`Êtes-vous sûr de vouloir supprimer la section "${currentSection.title}" ? Cette action est irréversible.`)) {
                        removeSection(sectionUid)
                        // Ajuster l'index si nécessaire
                        if (currentSectionIndex >= sections.length - 1) {
                          setCurrentSectionIndex(Math.max(0, sections.length - 2))
                        }
                      }
                    }}
                    title="Supprimer cette section"
                    disabled={sections.length <= 1}
                  >
                    🗑️
                  </button>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => moveSection(sectionUid, -1)}
                    title="Déplacer vers le haut"
                    disabled={currentSectionIndex === 0}
                  >
                    ▲
                  </button>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => moveSection(sectionUid, 1)}
                    title="Déplacer vers le bas"
                    disabled={currentSectionIndex >= sections.length - 1}
                  >
                    ▼
                  </button>
                </div>
              </div>
            ) : (
              <h1>{currentSection.title}</h1>
            )}
            <p className="section-meta">
              Section {safeIndex + 1} de {sections.length}
            </p>
          </div>

          {/* Réglages de section (mode édition) */}
          {editing && sectionUid && (
            <SectionSettings
              sectionUid={sectionUid}
              backgroundImage={currentSection.backgroundImage}
              backgroundDisplay={currentSection.backgroundDisplay}
              sourceSlide={currentSection.sourceSlide}
              sourceTitle={currentSection.sourceTitle}
            />
          )}

          {/* Content Blocks */}
          <div
            className={`section-content ${currentSection.backgroundImage ? 'section-content--immersive' : ''}`}
          >
            {currentSection.backgroundImage && (
              <div
                className="section-content__bg"
                style={{
                  backgroundImage: `url('${currentSection.backgroundImage}')`,
                  backgroundPosition: `${currentSection.backgroundDisplay?.posX ?? 50}% ${currentSection.backgroundDisplay?.posY ?? 50}%`,
                  backgroundSize: currentSection.backgroundDisplay?.fit === 'contain' ? 'contain' : 'cover'
                }}
                aria-hidden="true"
              />
            )}
            <div className="section-content__blocks">
              {editing && sectionUid
                ? (currentSection as EditableSection).blocks.map((block, idx, arr) => (
                    <EditableBlockWrapper
                      key={block._uid}
                      sectionUid={sectionUid}
                      block={block}
                      isFirst={idx === 0}
                      isLast={idx === arr.length - 1}
                    />
                  ))
                : currentSection.blocks.map((block: any, idx: number) => (
                    <ContentBlockComponent
                      key={(block as any)._uid ?? idx}
                      block={block}
                    />
                  ))}
            </div>
            {sectionUid && <AddBlockBar sectionUid={sectionUid} />}
          </div>

          {/* Navigation */}
          <div className="section-navigation">
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentSectionIndex(Math.max(0, safeIndex - 1))}
              disabled={!hasPrevious}
            >
              ← Section Précédente
            </button>

            {hasNext ? (
              <button
                className="btn btn-primary"
                onClick={() => setCurrentSectionIndex(Math.min(sections.length - 1, safeIndex + 1))}
              >
                Section Suivante →
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  alert('🎉 Bravo ! Vous avez complété ce tutoriel !')
                  onReturnHome()
                }}
              >
                ✓ Tutoriel Terminé
              </button>
            )}
          </div>

          {/* Memos section (lecture visiteur uniquement — masquée en édition pour éviter la double saisie) */}
          {!editing && currentSection.blocks.some((b: any) => b.type === 'memo') && (
            <div className="memos-section">
              <h3>Fiches Essentielles</h3>
              <div className="memos-list">
                {currentSection.blocks
                  .filter((b: any) => b.type === 'memo')
                  .map((block: any, idx: number) => (
                    <div key={idx} className="memo-card-inline">
                      <span className="memo-icon">{(block as any).icon}</span>
                      <div>
                        <strong>{(block as any).title}</strong>
                        <p>{(block as any).content}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
