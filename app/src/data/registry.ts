/**
 * Registre centralisé de tous les tutoriels
 * 
 * Ce registre permet la gestion multi-tutoriels générique.
 * Chaque tutoriel est associé à un identifiant unique (`tutorialId`),
 * permettant au système d'édition et de publication de fonctionner
 * indépendamment pour chaque contenu.
 */

import { dragonArenaTutorial } from './tutorials'
import type { Tutorial } from './tutorials'

export const TUTORIALS_REGISTRY: Record<string, Tutorial> = {
  'dragon-arena': dragonArenaTutorial
  // Les tutoriels futurs seront ajoutés ici au fur et à mesure
}

/**
 * Récupère un tutoriel par son identifiant
 * @param id l'identifiant du tutoriel
 * @returns le tutoriel ou null s'il n'existe pas
 */
export function getTutorialById(id: string): Tutorial | null {
  return TUTORIALS_REGISTRY[id] ?? null
}

/**
 * Récupère la liste de tous les tutoriels disponibles
 */
export function getAllTutorials(): Tutorial[] {
  return Object.values(TUTORIALS_REGISTRY)
}

/**
 * Récupère la liste des identifiants de tous les tutoriels
 */
export function getTutorialIds(): string[] {
  return Object.keys(TUTORIALS_REGISTRY)
}

/**
 * Vérifie si un identifiant de tutoriel est valide
 */
export function isValidTutorialId(id: string): boolean {
  return id in TUTORIALS_REGISTRY
}
