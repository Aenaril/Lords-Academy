/**
 * Registre central des types de blocs pédagogiques.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * OBJECTIF (Étape 0 du CMS)
 * ──────────────────────────────────────────────────────────────────────────
 * Centraliser, pour chaque type de bloc, ses métadonnées d'édition :
 *   - `type`       : identifiant du bloc (correspond à `ContentBlock['type']`)
 *   - `label`      : libellé affiché dans l'UI d'ajout de bloc
 *   - `icon`       : pictogramme affiché dans l'UI d'ajout de bloc
 *   - `createEmpty`: fabrique d'un bloc vierge (sans `_uid`, ajouté par l'appelant)
 *
 * Ce registre devient la SOURCE UNIQUE de vérité pour :
 *   - la liste des types proposés à l'ajout (`AddBlockBar`)
 *   - la fabrique de blocs vierges (`AdminContext.createEmptyBlock`)
 *
 * ⚠️ Compatibilité : le format JSON des blocs n'est PAS modifié. Les fabriques
 * produisent exactement la même structure qu'auparavant. Le rendu reste géré
 * par `ContentBlock.tsx` (switch typé) pour garantir un comportement identique.
 *
 * EXTENSIBILITÉ FUTURE : ajouter un nouveau type de bloc se fera en ajoutant
 * une entrée ici (+ son rendu/éditeur), sans toucher aux tutoriels existants.
 */
import type { ContentBlock } from '../data/tutorials'
import { assetPath } from '../utils/assetPath'

/** Un bloc « nu » (sans l'identifiant runtime `_uid`, ajouté par l'éditeur). */
export type BlockSeed = ContentBlock

/** Définition d'un type de bloc dans le registre. */
export interface BlockDefinition {
  /** Identifiant du type (clé de l'union `ContentBlock`). */
  type: ContentBlock['type']
  /** Libellé lisible affiché dans l'interface d'ajout. */
  label: string
  /** Pictogramme affiché dans l'interface d'ajout. */
  icon: string
  /** Fabrique d'un bloc vierge de ce type (format JSON identique à l'existant). */
  createEmpty: () => BlockSeed
}

/**
 * Déclaration des 6 types de blocs existants.
 *
 * L'ordre de ce tableau est l'ordre d'affichage dans le menu d'ajout. Il
 * reproduit l'ordre historique de `AddBlockBar` pour ne rien changer à l'UX.
 */
export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    type: 'text',
    label: 'Paragraphe',
    icon: '📝',
    createEmpty: () => ({ type: 'text', content: 'Nouveau paragraphe à éditer…' })
  },
  {
    type: 'image',
    label: 'Image',
    icon: '🖼',
    createEmpty: () => ({
      type: 'image',
      imagePath: assetPath('/images/content/dragon-arena/15.jpeg'),
      alt: 'Image',
      caption: ''
    })
  },
  {
    type: 'memo',
    label: 'Mémo',
    icon: '📌',
    createEmpty: () => ({ type: 'memo', title: 'Mémo', content: 'Contenu du mémo.', icon: '📌' })
  },
  {
    type: 'quiz',
    label: 'Quiz',
    icon: '❓',
    createEmpty: () => ({
      type: 'quiz',
      question: 'Nouvelle question ?',
      options: ['Réponse A', 'Réponse B'],
      correctAnswerIndex: 0,
      explanation: 'Explication de la bonne réponse.'
    })
  },
  {
    type: 'comparison',
    label: 'Comparaison',
    icon: '⚖️',
    createEmpty: () => ({
      type: 'comparison',
      title: 'Comparaison',
      items: [{ name: 'Élément', description: 'Description', pros: ['Avantage'], cons: ['Inconvénient'] }]
    })
  },
  {
    type: 'hero-image',
    label: 'Image immersive',
    icon: '🌄',
    createEmpty: () => ({
      type: 'hero-image',
      imagePath: assetPath('/images/content/dragon-arena/17.jpeg'),
      alt: 'Image',
      heading: 'Titre',
      content: 'Texte superposé',
      align: 'left',
      caption: ''
    })
  }
]

/** Index par type pour un accès direct O(1). */
const BY_TYPE: Record<string, BlockDefinition> = Object.fromEntries(
  BLOCK_DEFINITIONS.map((d) => [d.type, d])
)

/** Récupère la définition d'un type de bloc (ou `undefined` si inconnu). */
export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BY_TYPE[type]
}

/**
 * Fabrique un bloc vierge du type demandé (sans `_uid`).
 *
 * Pour un type connu : renvoie la structure JSON exacte attendue par le rendu.
 * Pour un type inconnu : repli neutre sur un bloc texte vide, afin de ne jamais
 * produire de donnée invalide.
 */
export function createEmptyBlockSeed(type: ContentBlock['type']): BlockSeed {
  const def = BY_TYPE[type]
  if (def) return def.createEmpty()
  return { type: 'text', content: '' }
}

/** Libellé lisible d'un type (pour l'UI). Repli sur le type brut si inconnu. */
export function getBlockLabel(type: string): string {
  return BY_TYPE[type]?.label ?? type
}
