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
import { type ContentBlock, type ImageDisplaySettings } from '../data/tutorials'
import { getTutorialById } from '../data/registry'
import {
  makeUid,
  type EditableBlock,
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
  /* Mutations — blocs */
  updateBlock: (sectionUid: string, blockUid: string, patch: Partial<EditableBlock>) => void
  addBlock: (sectionUid: string, type: ContentBlock['type'], afterBlockUid?: string) => void
  removeBlock: (sectionUid: string, blockUid: string) => void
  moveBlock: (sectionUid: string, blockUid: string, direction: -1 | 1) => void
  /* Mutations — section */
  updateSectionTitle: (sectionUid: string, title: string) => void
  updateSectionBackground: (sectionUid: string, backgroundImage: string | undefined) => void
  updateSectionBackgroundDisplay: (sectionUid: string, display: ImageDisplaySettings) => void
  /* Mutations — métadonnées du tutoriel */
  updateTutorialMeta: (patch: Partial<Pick<EditableTutorial, 'title' | 'description' | 'difficulty' | 'estimatedDuration' | 'coverIcon'>>) => void
  /* Session — distinction claire des 3 actions */
  undoLastChange: () => void          // Annuler la dernière modification
  canUndo: boolean
  discardDraft: () => void            // Abandonner tout le brouillon (retour à l'original)
  discardDraftAsync: () => Promise<void>  // Abandonner brouillon + supprimer KV distant (avec confirmation)
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
    draftRevision.current = undefined
    publishedRevision.current = undefined

    // Charger les versions locales
    if (store.mode === 'local') {
      const loadedVersions = (store as any).loadVersions?.() ?? []
      setVersions(loadedVersions)
    } else {
      // En mode remote, les versions viennent de l'API historique
      setVersions([])
    }

    // Flag de cleanup pour éviter que une réponse tardive de loadDraft(A)
    // ne contamienne le contenu du tutoriel B après un changement de tutorialId
    let cancelled = false

    // Charger le brouillon
    const loadDraft = async () => {
      try {
        // CORRECTION 2: Garde d'authentification — ne charger que si prêt
        // En mode remote, vérifier que l'utilisateur est authentifié AVANT de lancer
        // une requête asynchrone. Si pas authentifié en mode remote, charger la
        // source (hydrate) et sortir.
        if (store.mode === 'remote' && !isAuthenticated) {
          // Pas encore authentifié — charger la source de démonstration
          const hydrated = hydrate(tutorialId)
          if (!cancelled) {
            setTutorial(hydrated ?? ({} as EditableTutorial))
            setIsDirty(false)
          }
          return
        }

        const result = await store.loadDraft(tutorialId)
        
        // CORRECTION 1: Vérifier le flag cancelled avant de mettre à jour l'état
        // Si loadDraft(A) était en cours et l'utilisateur passe à B, on ignore
        // la réponse de A.
        if (cancelled) return

        if (result.content) {
          setTutorial(result.content)
          draftRevision.current = result.revision
          setIsDirty(false)
        } else {
          // Pas de brouillon, charger la source
          const hydrated = hydrate(tutorialId)
          setTutorial(hydrated ?? ({} as EditableTutorial))
          setIsDirty(false)
        }
      } catch (err) {
        console.error(`Erreur chargement brouillon ${tutorialId}:`, err)
        // En cas d'erreur (ex: 401 Non authentifié, 403 Accès refusé), charger
        // la source plutôt que laisser la UI vide.
        if (!cancelled) {
          const hydrated = hydrate(tutorialId)
          setTutorial(hydrated ?? ({} as EditableTutorial))
        }
      }
    }

    loadDraft()

    // Cleanup : marquer comme cancelled si tutorialId change ou si le composant est unmounté
    return () => {
      cancelled = true
    }
  }, [tutorialId, store, isAuthenticated])

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
  }, [tutorialId, tutorial])

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
    if (!isDirty) return

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
    setIsPreview(false)
    draftRevision.current = undefined
  }, [tutorialId])

  /* ─── Action 2b : Abandonner brouillon distant (avec confirmation) ─── */
  const discardDraftAsync = useCallback(async () => {
    // CORRECTION: Supprimer aussi le brouillon distant (KV) après confirmation
    // Cette fonction est async et supporte le mode remote.
    
    // Étape 1 : Confirmation utilisateur
    const confirmed = window.confirm(
      'Êtes-vous sûr ? Cette action supprimera le brouillon distant et ne peut pas être annulée.'
    )
    if (!confirmed) return

    try {
      // Étape 2 : Supprimer localement d'abord
      localStore.clear(tutorialId)
      const hydrated = hydrate(tutorialId)
      setTutorial(hydrated ?? ({} as EditableTutorial))
      setUndoStack([])
      setIsDirty(false)
      setIsPreview(false)
      draftRevision.current = undefined

      // Étape 3 : Si en mode remote, appeler DELETE /api/draft (côté backend)
      if (store.mode === 'remote' && store.deleteDraft) {
        await store.deleteDraft(tutorialId)
      }
    } catch (err) {
      console.error(`Erreur suppression brouillon ${tutorialId}:`, err)
      throw err
    }
  }, [tutorialId, store])

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
      updateBlock,
      addBlock,
      removeBlock,
      moveBlock,
      updateSectionTitle,
      updateSectionBackground,
      updateSectionBackgroundDisplay,
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
      updateBlock,
      addBlock,
      removeBlock,
      moveBlock,
      updateSectionTitle,
      updateSectionBackground,
      updateSectionBackgroundDisplay,
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
