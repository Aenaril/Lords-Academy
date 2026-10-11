import { useState } from 'react'
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

/** Panneau modal : métadonnées du tutoriel + gestion des versions. */
export default function TutorialMetaPanel({ onClose }: TutorialMetaPanelProps) {
  const {
    tutorial,
    updateTutorialMeta,
    versions,
    saveVersion,
    restoreVersion,
    deleteVersion
  } = useAdmin()
  const [versionLabel, setVersionLabel] = useState('')

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

        {/* Versions */}
        <section className="meta-panel__section">
          <h4>Versions enregistrées</h4>
          <div className="meta-panel__save-version">
            <input
              type="text"
              placeholder="Nom de la version (ex. avant refonte quiz)"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
            />
            <button
              onClick={() => {
                saveVersion(versionLabel)
                setVersionLabel('')
              }}
            >
              💾 Enregistrer une version
            </button>
          </div>

          {versions.length === 0 ? (
            <p className="meta-panel__empty">Aucune version enregistrée pour l'instant.</p>
          ) : (
            <ul className="meta-panel__versions">
              {versions.map((v) => (
                <li key={v.id}>
                  <div className="meta-panel__version-info">
                    <strong>{v.label}</strong>
                    <small>{new Date(v.savedAt).toLocaleString('fr-FR')}</small>
                  </div>
                  <div className="meta-panel__version-actions">
                    <button
                      onClick={() => {
                        if (confirm(`Restaurer « ${v.label} » ? Le contenu actuel sera remplacé (annulable).`)) {
                          restoreVersion(v.id)
                        }
                      }}
                    >
                      ↶ Restaurer
                    </button>
                    <button
                      className="meta-panel__del"
                      onClick={() => {
                        if (confirm('Supprimer définitivement cette version ?')) deleteVersion(v.id)
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
