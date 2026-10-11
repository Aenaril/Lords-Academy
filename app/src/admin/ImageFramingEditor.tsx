import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { ImageDisplaySettings } from '../data/tutorials'
import { resolveDisplay } from '../components/blocks/imageDisplay'
import './ImageFramingEditor.css'

interface ImageFramingEditorProps {
  imagePath: string
  alt?: string
  value?: ImageDisplaySettings
  onChange: (next: ImageDisplaySettings) => void
}

const ASPECTS: { value: NonNullable<ImageDisplaySettings['aspect']>; label: string }[] = [
  { value: 'auto', label: 'Naturel' },
  { value: 'banner', label: 'Bannière' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: 'Carré' },
  { value: 'custom', label: 'Hauteur perso.' }
]

const WIDTHS: { value: NonNullable<ImageDisplaySettings['width']>; label: string }[] = [
  { value: 'compact', label: 'Compacte' },
  { value: 'normal', label: 'Normale' },
  { value: 'full', label: 'Pleine' }
]

/**
 * Éditeur visuel de cadrage d'image : ratio/largeur/mode + repositionnement
 * par glisser (souris/doigt) et curseurs, zoom, recentrer, réinitialiser.
 * Aperçu en direct. N'enregistre que des paramètres d'affichage.
 */
export default function ImageFramingEditor({
  imagePath,
  alt,
  value,
  onChange
}: ImageFramingEditorProps) {
  const r = resolveDisplay(value)
  const frameRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const patch = useCallback(
    (p: Partial<ImageDisplaySettings>) => onChange({ ...value, ...p }),
    [value, onChange]
  )

  const hasFixedFrame = r.aspect !== 'auto'

  /* ─── Glisser pour repositionner le cadrage ─── */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasFixedFrame) return // en ratio naturel, pas de recadrage à déplacer
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: r.posX, baseY: r.posY }
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    // Déplacer le cadrage dans le sens inverse du glissement (on déplace l'image).
    const nextX = clamp(dragState.current.baseX - (dx / rect.width) * 100)
    const nextY = clamp(dragState.current.baseY - (dy / rect.height) * 100)
    patch({ posX: Math.round(nextX), posY: Math.round(nextY) })
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  /* ─── Styles de l'aperçu (identiques au rendu réel) ─── */
  const frameStyle: CSSProperties = { cursor: hasFixedFrame ? (dragging ? 'grabbing' : 'grab') : 'default' }
  if (r.aspect === 'custom' && r.customHeight) {
    frameStyle.height = `${r.customHeight}px`
  } else if (hasFixedFrame) {
    frameStyle.aspectRatio =
      r.aspect === 'banner' ? '21 / 9'
      : r.aspect === '16:9' ? '16 / 9'
      : r.aspect === '4:3' ? '4 / 3'
      : '1 / 1'
  }

  const imgStyle: CSSProperties = hasFixedFrame
    ? {
        width: '100%',
        height: '100%',
        objectFit: r.fit,
        objectPosition: `${r.posX}% ${r.posY}%`,
        transform: r.zoom !== 1 ? `scale(${r.zoom})` : undefined,
        transformOrigin: `${r.posX}% ${r.posY}%`
      }
    : {
        width: '100%',
        height: 'auto',
        display: 'block',
        transform: r.zoom !== 1 ? `scale(${r.zoom})` : undefined,
        transformOrigin: `${r.posX}% ${r.posY}%`
      }

  return (
    <div className="framing-editor">
      {/* Aperçu en direct */}
      <div
        ref={frameRef}
        className={`framing-editor__frame ${dragging ? 'is-dragging' : ''}`}
        style={frameStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img src={imagePath} alt={alt ?? ''} style={imgStyle} draggable={false} />
        {hasFixedFrame && (
          <span className="framing-editor__hint">
            {dragging ? 'Positionnement…' : '✋ Glissez pour recadrer'}
          </span>
        )}
      </div>

      {/* Dimensionnement */}
      <div className="framing-editor__group">
        <span className="framing-editor__label">Forme du cadre</span>
        <div className="framing-editor__chips">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              className={`framing-editor__chip ${r.aspect === a.value ? 'is-active' : ''}`}
              onClick={() => patch({ aspect: a.value })}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {r.aspect === 'custom' && (
        <label className="framing-editor__slider">
          <span>Hauteur : {r.customHeight ?? 320} px</span>
          <input
            type="range"
            min={120}
            max={720}
            step={10}
            value={r.customHeight ?? 320}
            onChange={(e) => patch({ customHeight: Number(e.target.value) })}
          />
        </label>
      )}

      <div className="framing-editor__group">
        <span className="framing-editor__label">Largeur</span>
        <div className="framing-editor__chips">
          {WIDTHS.map((w) => (
            <button
              key={w.value}
              className={`framing-editor__chip ${r.width === w.value ? 'is-active' : ''}`}
              onClick={() => patch({ width: w.value })}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode d'affichage */}
      <div className="framing-editor__group">
        <span className="framing-editor__label">Mode d'affichage</span>
        <div className="framing-editor__chips">
          <button
            className={`framing-editor__chip ${r.fit === 'cover' ? 'is-active' : ''}`}
            onClick={() => patch({ fit: 'cover' })}
            title="L'image remplit le cadre, quitte à être recadrée"
          >
            Remplir le cadre
          </button>
          <button
            className={`framing-editor__chip ${r.fit === 'contain' ? 'is-active' : ''}`}
            onClick={() => patch({ fit: 'contain' })}
            title="Toute l'image reste visible (idéal captures et schémas)"
          >
            Afficher entièrement
          </button>
        </div>
      </div>

      {/* Repositionnement par curseurs (alternative accessible au glisser) */}
      {hasFixedFrame && (
        <>
          <label className="framing-editor__slider">
            <span>Position horizontale : {r.posX}%</span>
            <input type="range" min={0} max={100} value={r.posX} onChange={(e) => patch({ posX: Number(e.target.value) })} />
          </label>
          <label className="framing-editor__slider">
            <span>Position verticale : {r.posY}%</span>
            <input type="range" min={0} max={100} value={r.posY} onChange={(e) => patch({ posY: Number(e.target.value) })} />
          </label>
        </>
      )}

      <label className="framing-editor__slider">
        <span>Zoom : {r.zoom.toFixed(2)}×</span>
        <input type="range" min={1} max={3} step={0.05} value={r.zoom} onChange={(e) => patch({ zoom: Number(e.target.value) })} />
      </label>

      {/* Actions */}
      <div className="framing-editor__actions">
        <button
          className="framing-editor__btn"
          onClick={() => patch({ posX: 50, posY: 50 })}
          title="Recentrer l'image dans le cadre"
        >
          🎯 Recentrer
        </button>
        <button
          className="framing-editor__btn framing-editor__btn--reset"
          onClick={() => onChange({})}
          title="Réinitialiser tous les paramètres de cadrage"
        >
          ↺ Réinitialiser
        </button>
      </div>
    </div>
  )
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}
