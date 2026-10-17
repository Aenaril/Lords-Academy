import { useState, useEffect, useRef, useCallback } from 'react'
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

type StatusLoadingState = 'idle' | 'loading' | 'loaded' | 'auth_error' | 'server_error' | 'network_error'

/**
 * Panneau modal : métadonnées du tutoriel
 * (titre, icône, description, difficulté, durée, statut).
 *
 * Gère le changement de statut avec confirmation pour publication/dépublication.
 * 
 * ✅ CORRECTIF : Statut officiel chargé depuis l'API (/api/tutorial/status)
 * plutôt que depuis le brouillon KV. Cela assure la synchronisation avec
 * index.json public, même après changements via API.
 * 
 * Gère les erreurs d'API directement dans le panneau (messages visibles, retry, désactivation des contrôles).
 */
export default function TutorialMetaPanel({ onClose }: TutorialMetaPanelProps) {
  const { tutorial, updateTutorialMeta, isAuthenticated } = useAdmin()
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isStatusSaving, setIsStatusSaving] = useState(false)
  const [displayedStatus, setDisplayedStatus] = useState(tutorial.status)
  const [statusLoadingState, setStatusLoadingState] = useState<StatusLoadingState>('loading')
  const [statusErrorMessage, setStatusErrorMessage] = useState<string | null>(null)
  
  // Référence actualisée au tutoriel courant pour vérifier les requêtes concurrentes
  const currentTutorialIdRef = useRef(tutorial.id)

  /**
   * ✅ NOUVEAU : Charger le statut officiel depuis l'API
   * Source de vérité : index.json public via /api/tutorial/status
   * 
   * Gère tous les cas d'erreur (401/403, 404, 5xx, réseau) de manière explicite.
   * Aucun fallback silencieux. Les erreurs sont affichées et permettent un retry.
   */
  const fetchOfficialStatus = useCallback(async () => {
    if (!isAuthenticated) return
    
    setStatusLoadingState('loading')
    setStatusErrorMessage(null)
    
    const startingTutorialId = currentTutorialIdRef.current
    
    try {
      const response = await fetch(
        `/api/tutorial/status?tutorialId=${encodeURIComponent(startingTutorialId)}`,
        {
          headers: { 'X-Requested-With': 'lma-admin' },
          credentials: 'include'
        }
      )

      // ✅ SÉCURITÉ : Vérifier immédiatement après fetch (avant traitement)
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé. Ignorer réponse pour ${startingTutorialId}`)
        return
      }

      if (response.ok) {
        // ✅ SÉCURITÉ : Vérifier avant json()
        if (currentTutorialIdRef.current !== startingTutorialId) {
          console.warn(`Tutoriel changé avant json(). Ignorer pour ${startingTutorialId}`)
          return
        }

        const data = await response.json()

        // ✅ SÉCURITÉ : Vérifier APRÈS json() (étape finale avant setState)
        if (currentTutorialIdRef.current !== startingTutorialId) {
          console.warn(`Tutoriel changé après json(). Ignorer setState pour ${startingTutorialId}`)
          return
        }

        // ✅ Tutoriel existe dans index.json public → utiliser son statut officiel
        setDisplayedStatus(data.status)
        setStatusLoadingState('loaded')
      } else if (response.status === 401 || response.status === 403) {
        // ⚠️ ERREUR D'AUTHENTIFICATION
        // ✅ Vérifier même pour les erreurs
        if (currentTutorialIdRef.current !== startingTutorialId) {
          console.warn(`Tutoriel changé (erreur 401/403). Ignorer pour ${startingTutorialId}`)
          return
        }
        console.error(`Erreur d'authentification: HTTP ${response.status}`)
        setStatusErrorMessage(`Erreur d'authentification. Impossible de charger le statut officiel. Veuillez vous reconnecter.`)
        setStatusLoadingState('auth_error')
      } else if (response.status === 404) {
        // ✅ Vérifier pour le 404
        if (currentTutorialIdRef.current !== startingTutorialId) {
          console.warn(`Tutoriel changé (404). Ignorer pour ${startingTutorialId}`)
          return
        }
        // ✅ Tutoriel n'existe pas dans index.json public
        // → C'est un brouillon pur ou pas encore publié → afficher le statut du brouillon
        setDisplayedStatus(tutorial.status)
        setStatusLoadingState('loaded')
      } else {
        // ⚠️ ERREUR SERVEUR (5xx, etc.)
        // ✅ Vérifier pour les erreurs serveur
        if (currentTutorialIdRef.current !== startingTutorialId) {
          console.warn(`Tutoriel changé (erreur serveur). Ignorer pour ${startingTutorialId}`)
          return
        }
        console.warn(`Erreur API statut: HTTP ${response.status}`)
        setStatusErrorMessage(`Erreur serveur (${response.status}). Impossible de charger le statut officiel.`)
        setStatusLoadingState('server_error')
      }
    } catch (err) {
      // ⚠️ ERREUR RÉSEAU
      // ✅ Vérifier même en cas d'erreur réseau
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé (erreur réseau). Ignorer pour ${startingTutorialId}`)
        return
      }
      console.warn('Erreur réseau lors du fetch du statut officiel:', err)
      setStatusErrorMessage('Erreur réseau. Impossible de charger le statut officiel.')
      setStatusLoadingState('network_error')
    }
  }, [isAuthenticated, tutorial.status])

  // Réinitialiser l'état quand on change de tutoriel
  useEffect(() => {
    // Sécurité : annuler tout changement de statut en cours
    if (isStatusSaving) {
      console.warn('Changement de tutoriel pendant une requête de statut en cours')
    }
    currentTutorialIdRef.current = tutorial.id
    // ✅ CORRECTION : Réinitialiser au statut du brouillon d'abord
    // puis charger le statut officiel via API
    setDisplayedStatus(tutorial.status)
    setPendingStatus(null)
    setShowConfirm(false)
    setIsStatusSaving(false)
    setStatusLoadingState('loading')
    setStatusErrorMessage(null)
    
    // ✅ NOUVEAU : Charger le statut officiel
    fetchOfficialStatus()
  }, [tutorial.id, fetchOfficialStatus])

  const handleStatusChange = (newStatus: string) => {
    // ✅ NOUVEAU : Ne pas permettre de changement si erreur d'API en cours
    if (statusLoadingState !== 'loaded') {
      return
    }
    
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
        credentials: 'include',
        body: JSON.stringify({
          tutorialId: startingTutorialId,
          newStatus
        })
      })

      // ✅ SÉCURITÉ : Vérifier immédiatement après fetch (avant json())
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé après fetch. Ignorer réponse pour ${startingTutorialId}`)
        setIsStatusSaving(false)
        return
      }

      if (!response.ok) {
        const error = await response.json()
        // ✅ SÉCURITÉ : Vérifier à nouveau après json() (même tutoriel?)
        if (currentTutorialIdRef.current !== startingTutorialId) {
          console.warn(`Tutoriel changé après json(). Ignorer erreur pour ${startingTutorialId}`)
          setIsStatusSaving(false)
          return
        }
        setIsStatusSaving(false)
        alert(`Erreur : ${error.error || 'Impossible de changer le statut'}`)
        return
      }

      // ✅ SÉCURITÉ : Vérifier avant json() sur réponse réussie
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé avant json() (succès). Ignorer pour ${startingTutorialId}`)
        setIsStatusSaving(false)
        return
      }

      const result = await response.json()

      // ✅ SÉCURITÉ : Vérifier APRÈS json() (étape finale)
      // Cela garantit qu'aucun setState ne modifie le mauvais panneau
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé après json() (succès). Ignorer setState pour ${startingTutorialId}`)
        setIsStatusSaving(false)
        return
      }

      const actualNewStatus = result.newStatus || newStatus
      
      // ✅ FINAL : Actualiser l'état uniquement si on est encore sur le bon tutoriel
      setDisplayedStatus(actualNewStatus as 'draft' | 'in_progress' | 'published' | 'unpublished' | 'coming-soon')
      setIsStatusSaving(false)
    } catch (err) {
      // ✅ SÉCURITÉ : Vérifier même en cas d'erreur
      if (currentTutorialIdRef.current !== startingTutorialId) {
        console.warn(`Tutoriel changé pendant erreur. Ignorer pour ${startingTutorialId}`)
        setIsStatusSaving(false)
        return
      }
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
          
          {/* Affichage du statut ou erreur de chargement */}
          {statusLoadingState === 'loading' && (
            <p className="meta-panel__status-message meta-panel__status-loading">
              ⏳ Chargement du statut officiel...
            </p>
          )}
          {statusLoadingState === 'loaded' && (
            <p className="meta-panel__current-status">
              <strong>Statut actuel :</strong> {isStatusSaving && '(Enregistrement en cours...) '}{STATUSES.find((s) => s.value === displayedStatus)?.label || displayedStatus}
            </p>
          )}
          {(statusLoadingState === 'auth_error' || statusLoadingState === 'server_error' || statusLoadingState === 'network_error') && (
            <div className="meta-panel__status-error">
              <p className="meta-panel__error-message">⚠️ {statusErrorMessage}</p>
              <button 
                className="btn btn-secondary btn-small"
                onClick={fetchOfficialStatus}
              >
                Réessayer
              </button>
            </div>
          )}
          
          {/* Sélecteur de statut (désactivé si erreur ou en cours de chargement) */}
          <div 
            className="meta-panel__status-options" 
            style={{ 
              opacity: (isStatusSaving || statusLoadingState !== 'loaded') ? 0.5 : 1, 
              pointerEvents: (isStatusSaving || statusLoadingState !== 'loaded') ? 'none' : 'auto' 
            }}
          >
            {STATUSES.map((status) => (
              <label key={status.value} className="meta-panel__status-option">
                <input
                  type="radio"
                  name="tutorial-status"
                  value={status.value}
                  checked={displayedStatus === status.value}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={isStatusSaving || statusLoadingState !== 'loaded'}
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
