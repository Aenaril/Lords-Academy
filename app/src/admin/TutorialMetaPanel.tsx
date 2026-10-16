import { useState, useEffect, useRef } from 'react'
import { useAdmin } from './AdminContext'
import './TutorialMetaPanel.css'

interface TutorialMetaPanelProps {
  onClose: () => void
}

const DIFFICULTIES: { value: 'easy' | 'medium' | 'hard' | 'expert'; label: string }[] = [
  { value: 'easy', label: 'Facile' },
  { value: 'medium', label: 'Moyen' },
  { value: 'hard', label: 'Difficile' },
  { value: 'expert', label: 'Expert' }
]

const STATUSES: { value: 'draft' | 'in_progress' | 'published' | 'unpublished' | 'coming-soon'; label: string; description: string }[] = [
  { value: 'draft', label: 'Brouillon', description: 'En création, non visible' },
  { value: 'in_progress', label: 'En chantier', description: 'Modifié, non publié' },
  { value: 'published', label: 'Publié', description: 'Visible et consultable' },
  { value: 'unpublished', label: 'Dépublié', description: 'Retiré, contenu conservé' },
  { value: 'coming-soon', label: 'Bientôt disponible', description: 'Visible, accès désactivé' }
]

/**
 * Panneau modal : métadonnées du tutoriel
 * (titre, icône, description, difficulté, durée, statut).
 *
 * Gère le changement de statut avec confirmation pour publication/dépublication.
 */
export default function TutorialMetaPanel({ onClose }: TutorialMetaPanelProps) {
  const { tutorial, updateTutorialMeta } = useAdmin()
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isStatusSaving, setIsStatusSaving] = useState(false)
  const [displayedStatus, setDisplayedStatus] = useState(tutorial.status)
  
  // Référence actualisée au tutoriel courant pour vérifier les requêtes concurrentes
  const currentTutorialIdRef = useRef(tutorial.id)

  // Réinitialiser l'état quand on change de tutoriel
  useEffect(() => {
    // Sécurité : annuler tout changement de statut en cours
    if (isStatusSaving) {
      console.warn('Changement de tutoriel pendant une requête de statut en cours')
    }
    currentTutorialIdRef.current = tutorial.id
    setDisplayedStatus(tutorial.status)
    setPendingStatus(null)
    setShowConfirm(false)
    setIsStatusSaving(false)
  }, [tutorial.id])

  const handleStatusChange = (newStatus: string) => {
    // Confirmation requise pour les transitions sensibles
    // Utiliser displayedStatus (actualisé) plutôt que tutorial.status (peut être stale)
    const requiresConfirmation = 
      // Publication
      ((displayedStatus === 'draft' || displayedStatus === 'in_progress') && newStatus === 'published') ||
      // Dépublication
      (displayedStatus === 'published' && newStatus === 'unpublished') ||
      // Réactivation
      (displayedStatus === 'unpublished' && newStatus === 'published')
    
    if (requiresConfirmation) {
      setPendingStatus(newStatus)
      setShowConfirm(true)
    } else {
      // Tous les autres changements (draft ↔ in_progress, → coming-soon, etc.)
      // Appellent aussi l'API pour modifier index.json
      performStatusChange(newStatus)
    }
  }

  const performStatusChange = async (newStatus: string) => {
    setIsStatusSaving(true)
    const startingTutorialId = currentTutorialIdRef.current
    
    try {
      const response = await fetch('/api/tutorial/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'lma-admin'
        },
        body: JSON.stringify({
          tutorialId: startingTutorialId,
          newStatus
        })
      })

      if (!response.ok) {
        const error = await response.json()
        setIsStatusSaving(false)
        alert(`Erreur : ${error.error || 'Impossible de changer le statut'}`)
        return
      }

      // CRITIQUE : Vérifier qu'on est toujours sur le même tutoriel avant d'appliquer la réponse
      // Utiliser useRef pour garantir une valeur actualisée, pas une fermeture stale
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé pendant requête. Ignorer la réponse pour ${startingTutorialId}. Actuellement: ${currentTutorialIdRef.current}`)
        setIsStatusSaving(false)
        return
      }

      // Succès : actualiser l'état affiché avec le nouveau statut
      setDisplayedStatus(newStatus as 'draft' | 'in_progress' | 'published' | 'unpublished' | 'coming-soon')
      setIsStatusSaving(false)
    } catch (err) {
      setIsStatusSaving(false)
      alert(`Erreur réseau : ${err}`)
    }
  }

  const confirmStatusChange = async () => {
    if (!pendingStatus) return
    setShowConfirm(false)
    await performStatusChange(pendingStatus)
    setPendingStatus(null)
  }

  const getStatusDescription = () => {
    const newStatusObj = STATUSES.find((s) => s.value === pendingStatus)
    if (displayedStatus === 'published' && pendingStatus === 'unpublished') {
      return 'Le tutoriel disparaîtra du catalogue public. Son contenu sera conservé et accessible aux R4.'
    }
    if (pendingStatus === 'published' && (displayedStatus === 'draft' || displayedStatus === 'in_progress')) {
      return 'Le tutoriel sera visible et consultable par les joueurs immédiatement après confirmation.'
    }
    if (displayedStatus === 'unpublished' && pendingStatus === 'published') {
      return 'Le tutoriel dépublié sera reactivé et redevendra visible.'
    }
    return newStatusObj?.description || ''
  }

  return (
    <div className="meta-panel__overlay" onClick={onClose}>
      <div className="meta-panel" onClick={(e) => e.stopPropagation()}>
        <div className="meta-panel__head">
          <h3>Réglages du tutoriel</h3>
          <button className="meta-panel__close" onClick={onClose}>✕</button>
        </div>

        {/* Statut */}
        <section className="meta-panel__section">
          <h4>Statut de publication</h4>
          <p className="meta-panel__current-status">
            <strong>Statut actuel :</strong> {isStatusSaving && '(Enregistrement en cours...) '}{STATUSES.find((s) => s.value === displayedStatus)?.label || displayedStatus}
          </p>
          <div className="meta-panel__status-options" style={{ opacity: isStatusSaving ? 0.5 : 1, pointerEvents: isStatusSaving ? 'none' : 'auto' }}>
            {STATUSES.map((status) => (
              <label key={status.value} className="meta-panel__status-option">
                <input
                  type="radio"
                  name="tutorial-status"
                  value={status.value}
                  checked={displayedStatus === status.value}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={isStatusSaving}
                />
                <span className="meta-panel__status-label">{status.label}</span>
                <span className="meta-panel__status-desc">{status.description}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Métadonnées */}
        <section className="meta-panel__section">
          <h4>Informations</h4>
          <label className="meta-panel__field">
            <span>Icône</span>
            <input
              type="text"
              maxLength={4}
              value={tutorial.coverIcon}
              onChange={(e) => updateTutorialMeta({ coverIcon: e.target.value })}
            />
          </label>
          <label className="meta-panel__field">
            <span>Titre</span>
            <input
              type="text"
              value={tutorial.title}
              onChange={(e) => updateTutorialMeta({ title: e.target.value })}
            />
          </label>
          <label className="meta-panel__field">
            <span>Description</span>
            <textarea
              rows={2}
              value={tutorial.description}
              onChange={(e) => updateTutorialMeta({ description: e.target.value })}
            />
          </label>
          <div className="meta-panel__row">
            <label className="meta-panel__field">
              <span>Difficulté</span>
              <select
                value={tutorial.difficulty}
                onChange={(e) => updateTutorialMeta({ difficulty: e.target.value as any })}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="meta-panel__field">
              <span>Durée (min)</span>
              <input
                type="text"
                value={tutorial.estimatedDuration}
                placeholder="12-15"
                onChange={(e) => updateTutorialMeta({ estimatedDuration: e.target.value })}
              />
            </label>
          </div>
        </section>

        {/* Modal de confirmation */}
        {showConfirm && (
          <div className="meta-panel__confirm-overlay" onClick={() => setShowConfirm(false)}>
            <div className="meta-panel__confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h4>Confirmer le changement de statut</h4>
              <p className="meta-panel__confirm-message">
                {getStatusDescription()}
              </p>
              <div className="meta-panel__confirm-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowConfirm(false)}
                >
                  Annuler
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmStatusChange}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
