import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { type ContentBlock, type ImageDisplaySettings, type Tutorial } from '../data/tutorials'
import { getTutorialById } from '../data/registry'
import {
  makeUid,
  type EditableBlock,
  type EditableSection,
  type EditableTutorial
} from './types'
import { adminApi, isRemoteConfigured } from './api/client'
import { getDraftStore } from './persistence'
import { createEmptyBlockSeed } from '../blocks/registry'

/**
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️  PROTOTYPE LOCAL D'ÉDITION — NON SÉCURISÉ
 * ──────────────────────────────────────────────────────────────────────────
 * Ce contexte gère un mode démonstration d'administration R4 entièrement
 * côté navigateur. Les modifications sont stockées dans localStorage et ne
 * sont visibles QUE sur ce navigateur. Rien n'est publié pour les autres
 * visiteurs. Il n'y a NI authentification, NI connexion à GitHub ou
 * Cloudflare à ce stade.
 *
 * L'architecture (interface `TutorialPersistence`) est volontairement
 * abstraite pour accueillir plus tard une persistance sécurisée
 * (mot de passe partagé → Cloudflare Worker → commit GitHub) sans réécrire
 * les composants d'édition.
 */

const STORAGE_KEY = (id: string) => `lma.r4.${id}.draft.v1`
const VERSIONS_KEY = (id: string) => `lma.r4.${id}.versions.v1`
const MAX_VERSIONS = 10

/** Une version sauvegardée (restaurable). */
export interface SavedVersion {
  id: string
  label: string
  savedAt: number
  tutorial: EditableTutorial
}

/* ─── Abstraction de persistance (remplaçable par un backend sécurisé) ─── */
export interface TutorialPersistence {
  load(tutorialId: string): EditableTutorial | null
  save(tutorialId: string, tutorial: EditableTutorial): void
  clear(tutorialId: string): void
  loadVersions(tutorialId: string): SavedVersion[]
  saveVersions(tutorialId: string, versions: SavedVersion[]): void
}

const localStoragePersistence: TutorialPersistence = {
  load(tutorialId) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(tutorialId))
      return raw ? (JSON.parse(raw) as EditableTutorial) : null
    } catch {
      return null
    }
  },
  save(tutorialId, tutorial) {
    try {
      localStorage.setItem(STORAGE_KEY(tutorialId), JSON.stringify(tutorial))
    } catch {
      /* quota ou mode privé : on ignore silencieusement en démo */
    }
  },
  clear(tutorialId) {
    try {
      localStorage.removeItem(STORAGE_KEY(tutorialId))
    } catch {
      /* ignore */
    }
  },
  loadVersions(tutorialId) {
    try {
      const raw = localStorage.getItem(VERSIONS_KEY(tutorialId))
      return raw ? (JSON.parse(raw) as SavedVersion[]) : []
    } catch {
      return []
    }
  },
  saveVersions(tutorialId, versions) {
    try {
      localStorage.setItem(VERSIONS_KEY(tutorialId), JSON.stringify(versions))
    } catch {
      /* ignore */
    }
  }
}

/* ─── Hydratation : ajoute des _uid stables sans toucher aux données source ─── */
/**
 * Valide un tutoriel pour la publication.
 * 
 * Vérifications :
 * - Métadonnées complètes (titre, catégorie, etc.)
 * - Au moins une section
 * - Chaque section a au moins un bloc
 * 
 * @returns { ok: boolean, error?: string }
 */
function validateTutorialForPublish(tutorial: EditableTutorial): { ok: boolean; error?: string } {
  // Métadonnées obligatoires
  if (!tutorial.id?.trim()) {
    return { ok: false, error: 'ID du tutoriel manquant' }
  }
  
  if (!tutorial.title?.trim()) {
    return { ok: false, error: 'Titre du tutoriel requis' }
  }
  
  if (!tutorial.category?.trim()) {
    return { ok: false, error: 'Catégorie du tutoriel requise' }
  }
  
  // Au moins une section
  if (!tutorial.sections || tutorial.sections.length === 0) {
    return { ok: false, error: 'Au moins une section est requise' }
  }
  
  // Chaque section a au moins un bloc
  const emptySections = tutorial.sections.filter((s) => !s.blocks || s.blocks.length === 0)
  if (emptySections.length > 0) {
    const count = emptySections.length
    return { 
      ok: false, 
      error: `${count} section(s) vide(s) — ajouter des blocs à chacune` 
    }
  }
  
  return { ok: true }
}

/**
 * Initialise un tutoriel éditable à partir de sa source
 * @param tutorialId identifiant du tutoriel
 * @returns tutoriel avec UIDs générés pour les sections et blocs, ou null si le tutoriel n'existe pas
 */
function hydrate(tutorialId: string): EditableTutorial | null {
  const source = getTutorialById(tutorialId)
  if (!source) return null
  
  const t = structuredClone(source)
  return {
    ...t,
    sections: (t.sections ?? []).map((s) => ({
      ...s,
      _uid: makeUid('s'),
      blocks: s.blocks.map((b) => ({ ...b, _uid: makeUid('b') }))
    }))
  }
}

/**
 * Charge le contenu de référence : en mode remote authentifié, charge la dernière
 * version publiée ; sinon, charge la source intégrée.
 * 
 * Retourne {content, error} où :
 * - content: contenu chargé ou null si pas d'erreur mais pas de contenu
 * - error: message d'erreur si vrai problème de récupération (erreur réseau, 404, 500, etc.)
 */
async function loadPublishedOrSource(
  tutorialId: string,
  remoteConfigured: boolean,
  isAuthenticated: boolean
): Promise<{ content: EditableTutorial | null; error?: string }> {
  // Mode remote authentifié : charger la version publiée avec gestion d'erreur stricte
  if (remoteConfigured && isAuthenticated) {
    try {
      // Utiliser getPublishedStrict() pour que les erreurs réseau/HTTP remontent
      // (contrairement à getPublished() qui les intercepte)
      const response = await adminApi.getPublishedStrict(tutorialId)
      
      if (response.content) {
        // Convertir Tutorial en EditableTutorial avec UIDs
        const t = structuredClone(response.content as Tutorial)
        const editable: EditableTutorial = {
          ...t,
          sections: (t.sections ?? []).map((s) => ({
            ...s,
            _uid: makeUid('s'),
            blocks: s.blocks.map((b) => ({ ...b, _uid: makeUid('b') }))
          }))
        }
        return { content: editable }
      }
      
      // Pas de contenu publié (cas valide: jamais publié)
      return { content: null }
    } catch (err) {
      // Erreur réelle (réseau, timeout, 404, 403, 500, etc.)
      const message = (err as any)?.message ?? 'Erreur serveur'
      return { content: null, error: message }
    }
  }

  // Mode démo ou non authentifié : charger la source
  const hydrated = hydrate(tutorialId)
  return { content: hydrated }
}

/* ─── Fabrique de blocs vierges par type ─── */
export function createEmptyBlock(type: ContentBlock['type']): EditableBlock {
  // La structure JSON de chaque type est définie une seule fois dans le
  // registre central (`app/src/blocks/registry.ts`). On n'ajoute ici que le
  // `_uid` runtime (clé React / cible de mutation), jamais persisté.
  return { ...createEmptyBlockSeed(type), _uid: makeUid('b') } as EditableBlock
}

interface AdminContextValue {
  /** Mode démonstration admin activé (boutons crayon visibles). */
  isAdminMode: boolean
  toggleAdminMode: () => void
  /** Ouvrir la modale d'accueil : choisir entre démo local ou connexion sécurisée. */
  openAdminModeModal: () => void
  /** Fermer la modale d'accueil (utilisée pour les deux choix). */
  closeAdminModeModal: () => void
  /** État de la modale d'accueil. */
  showAdminModeModal: boolean
  /** Aperçu : masque temporairement les contrôles d'édition. */
  isPreview: boolean
  setPreview: (v: boolean) => void
  /** Le tutoriel éditable (source de vérité en mode démo). */
  tutorial: EditableTutorial
  /** Des modifications locales existent-elles ? */
  isDirty: boolean
  /** Un brouillon existe-t-il réellement sur le serveur (ou en local) ? */
  hasDraft: boolean
  /* Mutations — blocs */
  updateBlock: (sectionUid: string, blockUid: string, patch: Partial<EditableBlock>) => void
  addBlock: (sectionUid: string, type: ContentBlock['type'], afterBlockUid?: string) => void
  removeBlock: (sectionUid: string, blockUid: string) => void
  moveBlock: (sectionUid: string, blockUid: string, direction: -1 | 1) => void
  /* Mutations — section */
  updateSectionTitle: (sectionUid: string, title: string) => void
  updateSectionBackground: (sectionUid: string, backgroundImage: string | undefined) => void
  updateSectionBackgroundDisplay: (sectionUid: string, display: ImageDisplaySettings) => void
  addSection: (afterSectionUid?: string) => void
  removeSection: (sectionUid: string) => void
  duplicateSection: (sectionUid: string) => void
  moveSection: (sectionUid: string, direction: -1 | 1) => void
  /* Mutations — métadonnées du tutoriel */
  updateTutorialMeta: (patch: Partial<Pick<EditableTutorial, 'title' | 'description' | 'difficulty' | 'estimatedDuration' | 'coverIcon'>>) => void
  /* Session — distinction claire des 3 actions */
  undoLastChange: () => void          // Annuler la dernière modification
  canUndo: boolean
  discardDraft: () => void            // Abandonner tout le brouillon (retour à l'original)
  discardDraftAsync: () => Promise<{ ok: boolean; error?: string }>  // Abandonner brouillon + supprimer KV distant (avec confirmation)
  /* Versions */
  versions: SavedVersion[]
  saveVersion: (label: string) => void
  restoreVersion: (id: string) => void // Restaurer une version
  deleteVersion: (id: string) => void
  /* Admin sécurisée distante */
  remoteConfigured: boolean
  isAuthenticated: boolean
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
  /** Publie vers le backend (si configuré + authentifié). */
  publish: () => Promise<{ ok: boolean; conflict?: boolean; error?: string }>
  isPublishing: boolean
  publishLoadError: string | null  // Erreur lors du chargement de la version publiée (accès refusé, offline, etc.)
  /* Historique & restauration (GitHub en distant ; versions locales en démo) */
  fetchHistory: () => Promise<import('./api/contract').HistoryEntry[]>
  fetchVersionContent: (revision: string) => Promise<EditableTutorial | null>
  restorePublishedVersion: (revision: string) => Promise<{ ok: boolean; error?: string }>
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function AdminProvider({ children, tutorialId }: { children: ReactNode; tutorialId: string }) {
  // Sélectionner la store selon la configuration (local ou remote)
  const store = getDraftStore()
  
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [hasDraft, setHasDraft] = useState(false) // NOUVEAU : Un brouillon existe réellement (distant ou local)
  const [tutorial, setTutorial] = useState<EditableTutorial>(() => {
    return hydrate(tutorialId) ?? ({} as EditableTutorial)
  })
  // État pour la modale d'accueil (choisir : démo ou connexion)
  const [showAdminModeModal, setShowAdminModeModal] = useState(false)
  // Pile d'annulation (snapshots avant chaque modification)
  const [undoStack, setUndoStack] = useState<EditableTutorial[]>([])
  const [versions, setVersions] = useState<SavedVersion[]>([])
  // Session admin distante (cookie HttpOnly côté Worker)
  const remoteConfigured = isRemoteConfigured()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishLoadError, setPublishLoadError] = useState<string | null>(null) // Erreur de chargement version publiée
  
  // CORRECTION: Séparer draftRevision (UUID/KV) et publishedRevision (SHA/GitHub)
  const draftRevision = useRef<string | undefined>(undefined)
  const publishedRevision = useRef<string | undefined>(undefined)
  
  // CORRECTION: Vraie queue de sauvegarde sérialisée
  // - pendingModification : captures la dernière modif pendant une save en cours
  // - isSavingRef : true si une PUT est actuellement en vol
  // - saveSequence : marque les versions pour rejeter les réponses tardives
  const pendingModificationRef = useRef<EditableTutorial | null>(null)
  const isSavingRef = useRef<boolean>(false)
  const saveSequence = useRef<number>(0)
  const saveQueueRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAbandoningRef = useRef<boolean>(false) // Flag pour bloquer les nouvelles saves pendant abandon

  // ═══════════════════════════════════════════════════════════════
  // Charger le brouillon du tutorialId courant (local ou remote)
  // 
  // CORRECTION 1: Ajouter cleanup flag pour éviter contamination A→B→A
  // CORRECTION 2: Garde d'authentification avant loadDraft en mode distant
  // CORRECTION 3: Ne charger que si authentifié en mode remote
  // ═══════════════════════════════════════════════════════════════
  const localStore = localStoragePersistence  // Pour les versions locales
  
  useEffect(() => {
    setIsPreview(false)
    setUndoStack([])
    setIsDirty(false)
    setHasDraft(false)
    draftRevision.current = undefined
    publishedRevision.current = undefined

    // Charger les versions locales
    if (store.mode === 'local') {
      const loadedVersions = (store as any).loadVersions?.() ?? []
      setVersions(loadedVersions)
    } else {
      setVersions([])
    }

    let cancelled = false

    const loadDraft = async () => {
      try {
        // Mode remote non authentifié : charger la source
        if (store.mode === 'remote' && !isAuthenticated) {
          const hydrated = hydrate(tutorialId)
          if (!cancelled) {
            setTutorial(hydrated ?? ({} as EditableTutorial))
            setHasDraft(false)
            setIsDirty(false)
            setPublishLoadError(null)
          }
          return
        }

        const result = await store.loadDraft(tutorialId)
        
        if (cancelled) return

        if (result.content) {
          // Brouillon existe
          setTutorial(result.content)
          draftRevision.current = result.revision
          setHasDraft(true)
          setIsDirty(false)
          setPublishLoadError(null)
        } else {
          // Pas de brouillon : charger version publiée (remote auth) ou source (local/non-auth)
          const published = await loadPublishedOrSource(
            tutorialId,
            remoteConfigured,
            isAuthenticated
          )
          
          if (cancelled) return
          
          if (published.error) {
            // Erreur récupération version publiée en mode remote auth
            // ⚠️ NE PAS FAIRE DE FALLBACK
            if (remoteConfigured && isAuthenticated) {
              console.error(`Erreur critique: impossible charger version publiée ${tutorialId}:`, published.error)
              setPublishLoadError(`Erreur accès version publiée: ${published.error}`)
              // Laisser UI avec message d'erreur, ne pas charger ancienne version
              setTutorial({} as EditableTutorial)
              setHasDraft(false)
              setIsDirty(false)
              return
            }
          }
          
          // Mode local ou non-auth : published.content est toujours disponible (hydrate)
          if (published.content) {
            setTutorial(published.content)
            setHasDraft(false)
            setIsDirty(false)
            setPublishLoadError(null)
          } else {
            // Aucun contenu publié en mode remote auth (cas rare)
            setTutorial({} as EditableTutorial)
            setHasDraft(false)
            setIsDirty(false)
            setPublishLoadError(null)
          }
        }
      } catch (err) {
        console.error(`Erreur chargement brouillon ${tutorialId}:`, err)
        if (!cancelled) {
          // Erreur réseau/API
          if (remoteConfigured && isAuthenticated) {
            // Mode remote auth : ne pas faire de fallback
            setPublishLoadError(`Erreur réseau lors du chargement: ${(err as any)?.message ?? 'erreur inconnue'}`)
            setTutorial({} as EditableTutorial)
          } else {
            // Mode local/non-auth : fallback acceptable
            const hydrated = hydrate(tutorialId)
            setTutorial(hydrated ?? ({} as EditableTutorial))
            setPublishLoadError(null)
          }
        }
      }
    }

    loadDraft()

    return () => {
      cancelled = true
    }
  }, [tutorialId, store, isAuthenticated, remoteConfigured])

  // Vérifie la session au montage si le backend est configuré.
  useEffect(() => {
    if (!remoteConfigured) return
    let cancelled = false
    adminApi.session().then((s) => {
      if (!cancelled) setIsAuthenticated(!!s.authenticated)
    })
    return () => {
      cancelled = true
    }
  }, [remoteConfigured])

  const refreshSession = useCallback(async () => {
    if (!remoteConfigured) return
    const s = await adminApi.session()
    setIsAuthenticated(!!s.authenticated)
  }, [remoteConfigured])

  const logout = useCallback(async () => {
    if (remoteConfigured) {
      try { await adminApi.logout() } catch { /* ignore */ }
    }
    setIsAuthenticated(false)
    // Désactiver immédiatement le mode édition après déconnexion
    setIsAdminMode(false)
  }, [remoteConfigured])

  const publish = useCallback(async () => {
    // Validation côté client avant envoi
    const validation = validateTutorialForPublish(tutorial)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    // Vérifier s'il y a une erreur de chargement de la version publiée
    if (publishLoadError) {
      return { ok: false, error: `Publication bloquée: ${publishLoadError}` }
    }
    
    const store = getDraftStore()
    if (store.mode !== 'remote' || !store.publish) {
      return { ok: false, error: 'Publication indisponible en mode local.' }
    }
    setIsPublishing(true)
    try {
      // CORRECTION: Utiliser publishedRevision (SHA GitHub) pour la publication,
      // pas draftRevision (UUID KV). La publication compare la version courante
      // sur GitHub pour détecter les conflits, donc on passe publishedRevision.
      const res = await store.publish(tutorialId, tutorial, publishedRevision.current)
      if (res.conflict) return { ok: false, conflict: true }
      if (res.revision) {
        // La réponse contient le new SHA from GitHub
        publishedRevision.current = res.revision
      }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Échec de publication' }
    } finally {
      setIsPublishing(false)
    }
  }, [tutorialId, tutorial, publishLoadError])

  /* ─── Historique & restauration ───
   * En distant : historique natif GitHub (commits).
   * En local (démo) : on expose les versions localStorage existantes sous la
   * même forme, pour une UI unique.
   */
  const fetchHistory = useCallback(async () => {
    if (remoteConfigured && isAuthenticated) {
      const res = await adminApi.history(tutorialId)
      return res.entries
    }
    // Démo locale : map des versions enregistrées → entrées d'historique.
    return versions.map((v) => ({
      revision: v.id,
      date: new Date(v.savedAt).toISOString(),
      message: v.label,
      authorLabel: 'local'
    }))
  }, [tutorialId, remoteConfigured, isAuthenticated, versions])

  const fetchVersionContent = useCallback(
    async (revision: string): Promise<EditableTutorial | null> => {
      if (remoteConfigured && isAuthenticated) {
        const res = await adminApi.version(tutorialId, revision)
        return (res.content as EditableTutorial) ?? null
      }
      const v = versions.find((x) => x.id === revision)
      return v ? v.tutorial : null
    },
    [tutorialId, remoteConfigured, isAuthenticated, versions]
  )

  const restorePublishedVersion = useCallback(
    async (revision: string): Promise<{ ok: boolean; error?: string }> => {
      if (remoteConfigured && isAuthenticated) {
        try {
          const res = await adminApi.restore(tutorialId, revision)
          if (res.ok && res.revision) publishedRevision.current = res.revision
          return { ok: res.ok, error: res.error }
        } catch (e: any) {
          return { ok: false, error: e?.message ?? 'Échec de restauration' }
        }
      }
      // Démo locale : restaurer = recharger la version dans le brouillon.
      const v = versions.find((x) => x.id === revision)
      if (!v) return { ok: false, error: 'Version introuvable' }
      setTutorial((cur) => {
        setUndoStack((stack) => [...stack.slice(-29), cur])
        return structuredClone(v.tutorial)
      })
      setIsDirty(true)
      return { ok: true }
    },
    [tutorialId, remoteConfigured, isAuthenticated, versions]
  )

  // ═══════════════════════════════════════════════════════════════
  // Persistance automatique avec queue sérialisée
  //
  // Vraie queue de sauvegardes :
  //  - pendingModification : capture modif pendant une save
  //  - isSaving : true si PUT en vol
  //  - Ne remettre isDirty=false QUE si aucune modif en attente
  // ═══════════════════════════════════════════════════════════════

  const performSave = useCallback(async () => {
    if (!pendingModificationRef.current) {
      setIsDirty(false)
      return
    }
    if (!tutorialId || !store) return

    isSavingRef.current = true
    const toSave = pendingModificationRef.current
    pendingModificationRef.current = null
    saveSequence.current++
    const currentSeq = saveSequence.current

    try {
      const result = await store.saveDraft(tutorialId, toSave, draftRevision.current)
      
      if (currentSeq !== saveSequence.current) {
        console.warn(`Ignoring late save response (seq ${currentSeq})`)
        return
      }
      
      // CORRECTION : Gérer le conflit multi-R4 retourné par handleSaveDraft
      if ((result as any).conflict) {
        console.warn(`Conflit détecté : brouillon modifié par un autre R4. serverRevision:`, (result as any).serverRevision)
        // Charger la version serveur pour informer l'utilisateur
        draftRevision.current = (result as any).serverRevision
        setIsDirty(true)  // Marquer comme dirty pour que l'UI affiche l'alerte
        alert(`⚠️ Conflit : Le brouillon a été modifié par un autre administrateur.\nRechargez la page pour voir les derniers changements.`)
        return
      }
      
      if (result.revision) {
        draftRevision.current = result.revision
        setHasDraft(true) // NOUVEAU : La sauvegarde a créé/mis à jour le brouillon
      }
    } catch (err) {
      console.error(`Erreur sauvegarde brouillon ${tutorialId}:`, err)
    } finally {
      isSavingRef.current = false
      if (pendingModificationRef.current) {
        setTimeout(() => performSave(), 50)
      } else {
        setIsDirty(false)
      }
    }
  }, [tutorialId, store])

  useEffect(() => {
    if (!isDirty || isAbandoningRef.current) return

    if (saveQueueRef.current) clearTimeout(saveQueueRef.current)

    if (isSavingRef.current) {
      // Save déjà en vol → juste capturer la modif
      pendingModificationRef.current = tutorial
    } else {
      // Pas de save en vol → débouncer
      saveQueueRef.current = setTimeout(() => {
        pendingModificationRef.current = tutorial
        performSave()
      }, 500)
    }
  }, [isDirty, tutorial, tutorialId, performSave])

  const mutate = useCallback(
    (updater: (prev: EditableTutorial) => EditableTutorial) => {
      setTutorial((prev) => {
        // Mémorise l'état précédent pour permettre l'annulation
        setUndoStack((stack) => [...stack.slice(-29), prev])
        return updater(prev)
      })
      setIsDirty(true)
    },
    []
  )

  const updateBlock = useCallback(
    (sectionUid: string, blockUid: string, patch: Partial<EditableBlock>) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s._uid !== sectionUid
            ? s
            : {
                ...s,
                blocks: s.blocks.map((b) =>
                  b._uid === blockUid ? ({ ...b, ...patch } as EditableBlock) : b
                )
              }
        )
      }))
    },
    [mutate]
  )

  const updateSectionTitle = useCallback(
    (sectionUid: string, title: string) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s._uid === sectionUid ? { ...s, title } : s
        )
      }))
    },
    [mutate]
  )

  const addBlock = useCallback(
    (sectionUid: string, type: ContentBlock['type'], afterBlockUid?: string) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s._uid !== sectionUid) return s
          const newBlock = createEmptyBlock(type)
          const blocks = [...s.blocks]
          const idx = afterBlockUid
            ? blocks.findIndex((b) => b._uid === afterBlockUid)
            : blocks.length - 1
          blocks.splice(idx + 1, 0, newBlock)
          return { ...s, blocks }
        })
      }))
    },
    [mutate]
  )

  const removeBlock = useCallback(
    (sectionUid: string, blockUid: string) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s._uid !== sectionUid
            ? s
            : { ...s, blocks: s.blocks.filter((b) => b._uid !== blockUid) }
        )
      }))
    },
    [mutate]
  )

  const moveBlock = useCallback(
    (sectionUid: string, blockUid: string, direction: -1 | 1) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s._uid !== sectionUid) return s
          const blocks = [...s.blocks]
          const i = blocks.findIndex((b) => b._uid === blockUid)
          const j = i + direction
          if (i < 0 || j < 0 || j >= blocks.length) return s
          ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
          return { ...s, blocks }
        })
      }))
    },
    [mutate]
  )

  const updateSectionBackground = useCallback(
    (sectionUid: string, backgroundImage: string | undefined) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s._uid === sectionUid ? { ...s, backgroundImage } : s
        )
      }))
    },
    [mutate]
  )

  const updateSectionBackgroundDisplay = useCallback(
    (sectionUid: string, backgroundDisplay: ImageDisplaySettings) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s._uid === sectionUid ? { ...s, backgroundDisplay } : s
        )
      }))
    },
    [mutate]
  )

  const updateTutorialMeta = useCallback(
    (patch: Partial<Pick<EditableTutorial, 'title' | 'description' | 'difficulty' | 'estimatedDuration' | 'coverIcon'>>) => {
      mutate((prev) => ({ ...prev, ...patch }))
    },
    [mutate]
  )

  /* ─── Mutations section management ─── */
  const addSection = useCallback(
    (afterSectionUid?: string) => {
      mutate((prev) => {
        const newSection: EditableSection = {
          id: crypto.randomUUID(),
          _uid: makeUid('s'),
          title: 'Nouvelle section',
          sourceSlide: 0,
          sourceTitle: 'Source',
          blocks: []
        }
        const sections = [...prev.sections]
        if (afterSectionUid) {
          const idx = sections.findIndex((s) => s._uid === afterSectionUid)
          if (idx >= 0) {
            sections.splice(idx + 1, 0, newSection)
            return { ...prev, sections }
          }
        }
        sections.push(newSection)
        return { ...prev, sections }
      })
    },
    [mutate]
  )

  const removeSection = useCallback(
    (sectionUid: string) => {
      mutate((prev) => ({
        ...prev,
        sections: prev.sections.filter((s) => s._uid !== sectionUid)
      }))
    },
    [mutate]
  )

  const duplicateSection = useCallback(
    (sectionUid: string) => {
      mutate((prev) => {
        const sections = [...prev.sections]
        const idx = sections.findIndex((s) => s._uid === sectionUid)
        if (idx < 0) return prev
        
        const source = sections[idx]
        const clone: EditableSection = {
          ...structuredClone(source),
          id: crypto.randomUUID(),
          _uid: makeUid('s'),
          blocks: source.blocks.map((b) => ({
            ...structuredClone(b),
            _uid: makeUid('b')
          }))
        }
        sections.splice(idx + 1, 0, clone)
        return { ...prev, sections }
      })
    },
    [mutate]
  )

  const moveSection = useCallback(
    (sectionUid: string, direction: -1 | 1) => {
      mutate((prev) => {
        const sections = [...prev.sections]
        const i = sections.findIndex((s) => s._uid === sectionUid)
        const j = i + direction
        if (i < 0 || j < 0 || j >= sections.length) return prev
        ;[sections[i], sections[j]] = [sections[j], sections[i]]
        return { ...prev, sections }
      })
    },
    [mutate]
  )

  /* ─── Action 1 : Annuler la dernière modification ─── */
  const undoLastChange = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack
      const previous = stack[stack.length - 1]
      setTutorial(previous)
      setIsDirty(true)
      return stack.slice(0, -1)
    })
  }, [])

  /* ─── Action 2 : Abandonner tout le brouillon (retour à l'original) ─── */
  const discardDraft = useCallback(() => {
    // Version locale/synchrone : effacer localStorage
    localStore.clear(tutorialId)
    const hydrated = hydrate(tutorialId)
    setTutorial(hydrated ?? ({} as EditableTutorial))
    setUndoStack([])
    setIsDirty(false)
    setHasDraft(false) // NOUVEAU : Le brouillon a été abandonné
    setIsPreview(false)
    draftRevision.current = undefined
  }, [tutorialId])

  /* ─── Action 2b : Abandonner brouillon distant (avec confirmation) ─── */
  const discardDraftAsync = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    // Supprimer le brouillon distant (DO) après confirmation
    // Retourne { ok: true } si succès, { ok: false } si annulation silencieuse, { ok: false, error } si erreur
    
    // Étape 1 : Confirmation utilisateur
    const confirmed = window.confirm(
      'Êtes-vous sûr ? Cette action supprimera le brouillon distant et ne peut pas être annulée.'
    )
    if (!confirmed) return { ok: false } // Annulation silencieuse (pas de error)

    try {
      // Étape 2 : Bloquer toute nouvelle sauvegarde automatique
      isAbandoningRef.current = true // Flag pour interdire nouvelles saves
      if (saveQueueRef.current) clearTimeout(saveQueueRef.current)
      pendingModificationRef.current = null
      
      // Étape 3 : Attendre la fin d'une sauvegarde en cours (max 5s)
      const spinStart = Date.now()
      while (isSavingRef.current && Date.now() - spinStart < 5000) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      // Étape 4 : Si save toujours en cours après timeout, ANNULER l'abandon
      if (isSavingRef.current) {
        isAbandoningRef.current = false // Restaurer flag
        // Réactiver le timer de sauvegarde (au cas où des modifications attendraient)
        if (isDirty) {
          saveQueueRef.current = setTimeout(() => {
            pendingModificationRef.current = tutorial
            performSave()
          }, 500)
        }
        return { ok: false, error: 'Sauvegarde en cours, merci de patienter et de réessayer' }
      }
      
      // Étape 5 : AVANT suppression du brouillon distant, valider et mémoriser
      // la version publiée (en mode remote auth uniquement)
      let publishedContent: EditableTutorial | null = null
      if (remoteConfigured && isAuthenticated) {
        const published = await loadPublishedOrSource(
          tutorialId,
          remoteConfigured,
          isAuthenticated
        )
        if (published.error) {
          // Erreur : impossible charger version publiée de remplacement
          // Ne pas supprimer le brouillon en mode remote auth
          isAbandoningRef.current = false
          return { ok: false, error: `Impossible valider version publiée avant suppression: ${published.error}` }
        }
        // Mémoriser la version validée (content peut être null si jamais publié)
        publishedContent = published.content
      }
      
      // Étape 6 : Si en mode remote, appeler DELETE /api/draft
      if (store.mode === 'remote' && store.deleteDraft) {
        await store.deleteDraft(tutorialId)
      }
      
      // Étape 7 : DELETE a réussi — utiliser version publiée validée en étape 5
      localStore.clear(tutorialId)
      
      // En mode remote auth: utiliser la version mémorisée (déjà validée)
      // En mode local: charger la source
      let contentToLoad: EditableTutorial
      if (remoteConfigured && isAuthenticated) {
        // Ne jamais faire de fallback hydrate() en mode remote auth
        contentToLoad = publishedContent ?? ({} as EditableTutorial)
      } else {
        // Mode local/non-auth: fallback acceptable
        contentToLoad = hydrate(tutorialId) ?? ({} as EditableTutorial)
      }
      
      setTutorial(contentToLoad)
      setUndoStack([])
      setIsDirty(false)
      setHasDraft(false)
      setIsPreview(false)
      setPublishLoadError(null)
      draftRevision.current = undefined
      isAbandoningRef.current = false
      
      return { ok: true }
    } catch (err) {
      // Erreur de suppression distant — laisser l'état local accessible
      console.error(`Erreur suppression brouillon ${tutorialId}:`, err)
      isAbandoningRef.current = false // Restaurer flag
      // Réactiver la sauvegarde automatique si des modifications existaient
      if (isDirty && !saveQueueRef.current) {
        saveQueueRef.current = setTimeout(() => {
          pendingModificationRef.current = tutorial
          performSave()
        }, 500)
      }
      return { ok: false, error: (err as any)?.message ?? 'Erreur serveur lors de la suppression' }
    }
  }, [tutorialId, store, tutorial, isDirty, performSave, remoteConfigured, isAuthenticated])

  /* ─── Action 3 : Versions (sauvegarder / restaurer / supprimer) ─── */
  const saveVersion = useCallback(
    (label: string) => {
      setVersions((prev) => {
        const next: SavedVersion[] = [
          {
            id: makeUid('v'),
            label: label.trim() || `Version du ${new Date().toLocaleString('fr-FR')}`,
            savedAt: Date.now(),
            tutorial: structuredClone(tutorial)
          },
          ...prev
        ].slice(0, MAX_VERSIONS)
        localStore.saveVersions(tutorialId, next)
        return next
      })
    },
    [tutorial, tutorialId]
  )

  const restoreVersion = useCallback((id: string) => {
    setVersions((prev) => {
      const v = prev.find((x) => x.id === id)
      if (v) {
        setTutorial((cur) => {
          setUndoStack((stack) => [...stack.slice(-29), cur])
          return structuredClone(v.tutorial)
        })
        setIsDirty(true)
      }
      return prev
    })
  }, [])

  const deleteVersion = useCallback((id: string) => {
    setVersions((prev) => {
      const next = prev.filter((x) => x.id !== id)
      localStore.saveVersions(tutorialId, next)
      return next
    })
  }, [tutorialId])

  const toggleAdminMode = useCallback(() => {
    // En mode distant (production) : exiger l'authentification pour activer l'édition
    if (remoteConfigured && !isAuthenticated) {
      // Ne pas afficher d'alerte : laisser les composants gérer la modale
      return
    }
    
    setIsAdminMode((v) => {
      if (v) setIsPreview(false)
      return !v
    })
  }, [remoteConfigured, isAuthenticated])

  const openAdminModeModal = useCallback(() => {
    setShowAdminModeModal(true)
  }, [])

  const closeAdminModeModal = useCallback(() => {
    setShowAdminModeModal(false)
  }, [])

  const value = useMemo<AdminContextValue>(
    () => ({
      isAdminMode,
      toggleAdminMode,
      openAdminModeModal,
      closeAdminModeModal,
      showAdminModeModal,
      isPreview,
      setPreview: setIsPreview,
      tutorial,
      isDirty,
      hasDraft, // NOUVEAU : Exposer hasDraft au contexte
      updateBlock,
      addBlock,
      removeBlock,
      moveBlock,
      updateSectionTitle,
      updateSectionBackground,
      updateSectionBackgroundDisplay,
      addSection,
      removeSection,
      duplicateSection,
      moveSection,
      updateTutorialMeta,
      undoLastChange,
      canUndo: undoStack.length > 0,
      discardDraft,
      discardDraftAsync,
      versions,
      saveVersion,
      restoreVersion,
      deleteVersion,
      remoteConfigured,
      isAuthenticated,
      refreshSession,
      logout,
      publish,
      isPublishing,
      publishLoadError,
      fetchHistory,
      fetchVersionContent,
      restorePublishedVersion
    }),
    [
      isAdminMode,
      toggleAdminMode,
      openAdminModeModal,
      closeAdminModeModal,
      showAdminModeModal,
      isPreview,
      tutorial,
      isDirty,
      hasDraft,
      updateBlock,
      addBlock,
      removeBlock,
      moveBlock,
      updateSectionTitle,
      updateSectionBackground,
      updateSectionBackgroundDisplay,
      addSection,
      removeSection,
      duplicateSection,
      moveSection,
      updateTutorialMeta,
      undoLastChange,
      undoStack.length,
      discardDraft,
      discardDraftAsync,
      versions,
      saveVersion,
      restoreVersion,
      deleteVersion,
      remoteConfigured,
      isAuthenticated,
      refreshSession,
      logout,
      publish,
      isPublishing,
      publishLoadError,
      fetchHistory,
      fetchVersionContent,
      restorePublishedVersion
    ]
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin doit être utilisé dans <AdminProvider>')
  return ctx
}
