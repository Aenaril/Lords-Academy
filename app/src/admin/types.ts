/**
 * Types internes de l'édition R4.
 *
 * On enrichit à l'exécution chaque bloc et chaque section d'un identifiant
 * stable (`_uid`) utilisé comme clé React et pour cibler les mutations.
 * Ces identifiants ne sont PAS persistés dans les données source : ils sont
 * régénérés à l'hydratation. Les champs de traçabilité PowerPoint
 * (sourceSlide / sourceTitle / slideType) restent, eux, intacts.
 */
import type { ContentBlock, Section, Tutorial } from '../data/tutorials'

export type EditableBlock = ContentBlock & { _uid: string }

export interface EditableSection extends Omit<Section, 'blocks'> {
  _uid: string
  blocks: EditableBlock[]
}

export interface EditableTutorial extends Omit<Tutorial, 'sections'> {
  sections: EditableSection[]
}

let counter = 0
export function makeUid(prefix = 'b'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter}`
}
