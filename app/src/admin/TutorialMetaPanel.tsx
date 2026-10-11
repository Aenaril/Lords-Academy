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

/**
 * Panneau modal : métadonnées du tutoriel uniquement
 * (titre, icône, description, difficulté, durée).
 *
 * L'historique des publications n'est PAS géré ici : il est accessible
 * directement depuis la barre R4 (bouton « Historique des versions »).
 */
export default function TutorialMetaPanel({ onClose }: TutorialMetaPanelProps) {
  const { tutorial, updateTutorialMeta } = useAdmin()

  return (
    <div className="meta-panel__overlay" onClick={onClose}>
      <div className="meta-panel" onClick={(e) => e.stopPropagation()}>
        <div className="meta-panel__head">
          <h3>Réglages du tutoriel</h3>
          <button className="meta-panel__close" onClick={onClose}>✕</button>
        </div>

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
      </div>
    </div>
  )
}
