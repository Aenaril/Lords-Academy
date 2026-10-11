import { useEffect, useState } from 'react'
import { useAdmin } from './AdminContext'
import ContentBlockComponent from '../components/ContentBlock'
import type { HistoryEntry } from './api/contract'
import type { EditableTutorial } from './types'
import './VersionHistory.css'

interface VersionHistoryProps {
  onClose: () => void
}

/**
 * Historique des versions publiées (commits GitHub en mode distant, versions
 * locales en démo). Permet de consulter, prévisualiser et restaurer une
 * version. La restauration crée un NOUVEAU commit sans effacer l'historique.
 */
export default function VersionHistory({ onClose }: VersionHistoryProps) {
  const { remoteConfigured, isAuthenticated, fetchHistory, fetchVersionContent, restorePublishedVersion } = useAdmin()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ revision: string; content: EditableTutorial } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const isRemote = remoteConfigured && isAuthenticated

  useEffect(() => {
    let cancelled = false
    fetchHistory()
      .then((e) => { if (!cancelled) setEntries(e) })
      .catch(() => {
        if (!cancelled) {
          setEntries([])
          setError('Impossible de charger l\'historique des publications. Vérifiez votre connexion, puis rouvrez cette fenêtre.')
        }
      })
    return () => { cancelled = true }
  }, [fetchHistory])

  const openPreview = async (revision: string) => {
    setLoadingPreview(true)
    setError(null)
    try {
      const content = await fetchVersionContent(revision)
      if (content) setPreview({ revision, content })
      else setError('Contenu de cette version indisponible.')
    } catch {
      setError('Échec du chargement de la version.')
    } finally {
      setLoadingPreview(false)
    }
  }

  const restore = async (revision: string) => {
    const label = isRemote
      ? 'Restaurer cette version ? Un nouveau commit sera créé ; l\'historique précédent reste intact.'
      : 'Restaurer cette version dans le brouillon local ?'
    if (!confirm(label)) return
    setRestoring(true)
    try {
      const res = await restorePublishedVersion(revision)
      if (res.ok) {
        alert(isRemote ? '✅ Version restaurée (nouveau commit créé).' : '✅ Version restaurée dans le brouillon.')
        onClose()
      } else {
        alert(`❌ Restauration impossible : ${res.error ?? 'erreur inconnue'}`)
      }
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="version-history__overlay" onClick={onClose}>
      <div className="version-history" onClick={(e) => e.stopPropagation()}>
        <div className="version-history__head">
          <h3>🕑 Historique des versions</h3>
          <button className="version-history__close" onClick={onClose}>✕</button>
        </div>

        <p className="version-history__source">
          {isRemote
            ? 'Source : historique GitHub (chaque publication = un commit horodaté).'
            : 'Mode démo local : versions enregistrées dans ce navigateur.'}
        </p>

        {error && (
          <p className="version-history__error" role="alert">⚠️ {error}</p>
        )}

        {/* Prévisualisation d'une version */}
        {preview ? (
          <div className="version-history__preview">
            <div className="version-history__preview-bar">
              <span>Aperçu de la version <code>{preview.revision.slice(0, 7)}</code></span>
              <div>
                <button
                  className="version-history__btn version-history__btn--restore"
                  onClick={() => restore(preview.revision)}
                  disabled={restoring}
                >
                  {restoring ? '⏳…' : '↶ Restaurer cette version'}
                </button>
                <button className="version-history__btn" onClick={() => setPreview(null)}>
                  ← Retour à la liste
                </button>
              </div>
            </div>
            <div className="version-history__preview-content">
              <h4>{preview.content.title}</h4>
              {preview.content.sections.map((s) => (
                <section key={s._uid ?? s.id} className="version-history__section">
                  <h5>{s.title}</h5>
                  {s.blocks.map((b, i) => (
                    <ContentBlockComponent key={i} block={b} />
                  ))}
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            {!entries && !error && (
              <p className="version-history__loading">⏳ Chargement de l'historique…</p>
            )}
            {entries && entries.length === 0 && !error && (
              <p className="version-history__empty">
                Aucune version publiée pour l'instant. Publiez le tutoriel pour créer la première version.
              </p>
            )}
            {entries && entries.length > 0 && (
              <ul className="version-history__list">
                {entries.map((e) => (
                  <li key={e.revision}>
                    <div className="version-history__entry-info">
                      <strong>{formatVersionLabel(e.date)}</strong>
                      <small>
                        Publication <code>{e.revision.slice(0, 7)}</code>
                      </small>
                    </div>
                    <div className="version-history__entry-actions">
                      <button
                        className="version-history__btn"
                        onClick={() => openPreview(e.revision)}
                        disabled={loadingPreview}
                      >
                        👁 Prévisualiser
                      </button>
                      <button
                        className="version-history__btn version-history__btn--restore"
                        onClick={() => restore(e.revision)}
                        disabled={restoring}
                      >
                        ↶ Restaurer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Libellé principal d'une version : « Version du JJ/MM/AAAA à HH:MM ».
 * Repli explicite si la date du commit est absente ou illisible.
 */
function formatVersionLabel(iso: string): string {
  if (!iso) return 'Version (date inconnue)'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Version (date inconnue)'
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `Version du ${date} à ${time}`
}
