import { useState } from 'react'
import { useAdmin } from './AdminContext'
import ImagePicker from './ImagePicker'
import type { ImageDisplaySettings } from '../data/tutorials'
import './SectionSettings.css'

interface SectionSettingsProps {
  sectionUid: string
  backgroundImage?: string
  backgroundDisplay?: ImageDisplaySettings
  sourceSlide: number
  sourceTitle?: string
}

/**
 * Réglages de section en mode édition : image de fond immersive (avec cadrage
 * position + mode) + rappel de la traçabilité PowerPoint (lecture seule).
 */
export default function SectionSettings({
  sectionUid,
  backgroundImage,
  backgroundDisplay,
  sourceSlide,
  sourceTitle
}: SectionSettingsProps) {
  const { updateSectionBackground, updateSectionBackgroundDisplay } = useAdmin()
  const [open, setOpen] = useState(false)

  const d = backgroundDisplay ?? {}
  const posX = d.posX ?? 50
  const posY = d.posY ?? 50
  const fit = d.fit ?? 'cover'
  const setDisplay = (p: Partial<ImageDisplaySettings>) =>
    updateSectionBackgroundDisplay(sectionUid, { ...d, ...p })

  return (
    <div className="section-settings">
      <button className="section-settings__toggle" onClick={() => setOpen((v) => !v)}>
        ⚙️ Réglages de la section {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="section-settings__panel">
          <div className="section-settings__trace" title="Correspondance PowerPoint (préservée, non modifiable)">
            🔒 Diapositive source : <strong>{sourceSlide}</strong>
            {sourceTitle && <> — {sourceTitle}</>}
          </div>

          <ImagePicker
            label="Image de fond immersive (optionnelle)"
            value={backgroundImage ?? ''}
            onChange={(v) => updateSectionBackground(sectionUid, v || undefined)}
            allowClear
          />

          {backgroundImage && (
            <div className="section-settings__framing">
              <span className="section-settings__sub">Cadrage du fond</span>

              <div className="section-settings__chips">
                <button
                  className={`section-settings__chip ${fit === 'cover' ? 'is-active' : ''}`}
                  onClick={() => setDisplay({ fit: 'cover' })}
                >
                  Remplir le cadre
                </button>
                <button
                  className={`section-settings__chip ${fit === 'contain' ? 'is-active' : ''}`}
                  onClick={() => setDisplay({ fit: 'contain' })}
                >
                  Afficher entièrement
                </button>
              </div>

              <label className="section-settings__slider">
                <span>Position horizontale : {posX}%</span>
                <input type="range" min={0} max={100} value={posX} onChange={(e) => setDisplay({ posX: Number(e.target.value) })} />
              </label>
              <label className="section-settings__slider">
                <span>Position verticale : {posY}%</span>
                <input type="range" min={0} max={100} value={posY} onChange={(e) => setDisplay({ posY: Number(e.target.value) })} />
              </label>

              <button
                className="section-settings__chip"
                onClick={() => setDisplay({ posX: 50, posY: 50 })}
              >
                🎯 Recentrer le fond
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
