/**
 * Couche de persistance abstraite de l'éditeur R4.
 *
 * Deux implémentations :
 *  - `localDraftStore`  : localStorage (démo locale actuelle, hors ligne).
 *  - `remoteDraftStore` : Cloudflare Worker (brouillons privés + publication).
 *
 * L'interface est **asynchrone** pour accueillir le backend sans réécrire les
 * composants. Le mode effectif dépend de la configuration (URL du Worker) et
 * de l'état de session.
 */
import type { EditableTutorial } from './types'
import { adminApi, isRemoteConfigured } from './api/client'

export interface DraftStore {
  /** Mode courant, pour l'affichage et les garde-fous. */
  readonly mode: 'local' | 'remote'
  /** Charge le brouillon courant (ou null si aucun). */
  loadDraft(tutorialId: string): Promise<{ content: EditableTutorial | null; revision?: string }>
  /** Enregistre le brouillon (privé). */
  saveDraft(tutorialId: string, content: EditableTutorial, baseRevision?: string): Promise<{ revision?: string }>
  /** Publie le contenu pour tous les visiteurs (remote uniquement). */
  publish?(tutorialId: string, content: EditableTutorial, baseRevision?: string): Promise<{ revision?: string; conflict?: boolean }>
  /** Supprime le brouillon distant (KV). CORRECTION: Ajouter méthode pour abandonner le brouillon. */
  deleteDraft?(tutorialId: string): Promise<void>
  /** Supprime le brouillon local (le remote conserve l'historique). */
  clearLocal?(): void
}

const LOCAL_KEY = (id: string) => `lma.r4.${id}.draft.v1`

/* ─── Implémentation locale (démo) ─── */
export const localDraftStore: DraftStore = {
  mode: 'local',
  async loadDraft(tutorialId) {
    try {
      const raw = localStorage.getItem(LOCAL_KEY(tutorialId))
      return { content: raw ? (JSON.parse(raw) as EditableTutorial) : null }
    } catch {
      return { content: null }
    }
  },
  async saveDraft(tutorialId, content) {
    try {
      localStorage.setItem(LOCAL_KEY(tutorialId), JSON.stringify(content))
    } catch {
      /* ignore */
    }
    return {}
  },
  async deleteDraft(tutorialId) {
    // En local, "supprimer" = vider le localStorage
    try {
      localStorage.removeItem(LOCAL_KEY(tutorialId))
    } catch {
      /* ignore */
    }
  },
  clearLocal() {
    /* la clé effective dépend du tutoriel : géré par l'appelant */
  }
}

/* ─── Implémentation distante (Worker) ─── */
export const remoteDraftStore: DraftStore = {
  mode: 'remote',
  async loadDraft(tutorialId) {
    const res = await adminApi.getDraft(tutorialId)
    return { content: (res.content as EditableTutorial) ?? null, revision: res.revision }
  },
  async saveDraft(tutorialId, content, baseRevision) {
    const res = await adminApi.saveDraft(tutorialId, content, baseRevision)
    return { revision: res.revision }
  },
  async publish(tutorialId, content, baseRevision) {
    const res = await adminApi.publish(tutorialId, content, baseRevision)
    return { revision: res.revision, conflict: !!res.conflict }
  },
  async deleteDraft(tutorialId) {
    // CORRECTION: Appeler DELETE /api/draft pour supprimer le brouillon distant (KV)
    await adminApi.deleteDraft(tutorialId)
  }
}

/** Sélectionne l'implémentation selon la configuration. */
export function getDraftStore(): DraftStore {
  return isRemoteConfigured() ? remoteDraftStore : localDraftStore
}
