import type { CSSProperties } from 'react'
import type { ImageDisplaySettings } from '../../data/tutorials'

export const DEFAULT_DISPLAY: Required<Omit<ImageDisplaySettings, 'customHeight'>> & {
  customHeight?: number
} = {
  aspect: 'auto',
  width: 'normal',
  fit: 'cover',
  posX: 50,
  posY: 50,
  zoom: 1,
  customHeight: undefined
}

/** Fusionne des réglages partiels avec les valeurs par défaut. */
export function resolveDisplay(d?: ImageDisplaySettings) {
  return { ...DEFAULT_DISPLAY, ...(d ?? {}) }
}

const ASPECT_RATIO: Record<string, string | undefined> = {
  auto: undefined,
  banner: '21 / 9',
  '16:9': '16 / 9',
  '4:3': '4 / 3',
  '1:1': '1 / 1',
  custom: undefined
}

const WIDTH_MAX: Record<string, string> = {
  compact: '480px',
  normal: '100%',
  full: '100%'
}

/** Style du conteneur (cadre) qui fixe la forme et la largeur. */
export function frameStyle(d?: ImageDisplaySettings): CSSProperties {
  const r = resolveDisplay(d)
  const style: CSSProperties = {
    maxWidth: WIDTH_MAX[r.width],
    marginLeft: r.width === 'compact' ? 'auto' : undefined,
    marginRight: r.width === 'compact' ? 'auto' : undefined
  }
  if (r.aspect === 'custom' && r.customHeight) {
    style.height = `${r.customHeight}px`
  } else if (r.aspect !== 'auto') {
    style.aspectRatio = ASPECT_RATIO[r.aspect]
  }
  // En ratio naturel (auto) sans hauteur fixe, le cadre épouse l'image.
  return style
}

/** Style de l'image à l'intérieur du cadre. */
export function imageStyle(d?: ImageDisplaySettings): CSSProperties {
  const r = resolveDisplay(d)
  const hasFixedFrame = r.aspect !== 'auto'
  if (!hasFixedFrame) {
    // Ratio naturel : l'image s'affiche entière, le zoom reste applicable.
    return {
      width: '100%',
      height: 'auto',
      display: 'block',
      transform: r.zoom !== 1 ? `scale(${r.zoom})` : undefined,
      transformOrigin: `${r.posX}% ${r.posY}%`
    }
  }
  return {
    width: '100%',
    height: '100%',
    objectFit: r.fit,
    objectPosition: `${r.posX}% ${r.posY}%`,
    transform: r.zoom !== 1 ? `scale(${r.zoom})` : undefined,
    transformOrigin: `${r.posX}% ${r.posY}%`
  }
}
