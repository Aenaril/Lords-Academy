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
import { dragonArenaTutorial, type ContentBlock, type ImageDisplaySettings } from '../data/tutorials'
import {
  makeUid,
  type EditableBlock,
  type EditableTutorial
} from './types'
import { adminApi, isRemoteConfigured } from './api/client'
import { getDraftStore } from './persistence'
import { assetPath } from '../utils/assetPath'

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

const STORAGE_KEY = 'lma.r4.dragon-arena.draft.v1'
const VERSIONS_KEY = 'lma.r4.dragon-arena.versions.v1'
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
  load(): EditableTutorial | null
  save(tutorial: EditableTutorial): void
  clear(): void
  loadVersions(): SavedVersion[]
  saveVersions(versions: SavedVersion[]): void
}

const localStoragePersistence: TutorialPersistence = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as EditableTutorial) : null
    } catch {
      return null
    }
  },
  save(tutorial) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tutorial))
    } catch {
      /* quota ou mode privé : on ignore silencieusement en démo */
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  },
  loadVersions() {
    try {
      const raw = localStorage.getItem(VERSIONS_KEY)
      return raw ? (JSON.parse(raw) as SavedVersion[]) : []
    } catch {
      return []
    }
  },
  saveVersions(versions) {
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions))
    } catch {
      /* ignore */
    }
  }
}

/* ─── Hydratation : ajoute des _uid stables sans toucher aux données source ─── */
function hydrate(): EditableTutorial {
  const t = structuredClone(dragonArenaTutorial)
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
  const base = { _uid: makeUid('b') }
  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Nouveau paragraphe à éditer…' }
    case 'image':
      return { ...base, type: 'image', imagePath: assetPath('/images/content/dragon-arena/15.jpeg'), alt: 'Image', caption: '' }
    case 'hero-image':
      return { ...base, type: 'hero-image', imagePath: assetPath('/images/content/dragon-arena/17.jpeg'), alt: 'Image', heading: 'Titre', content: 'Texte superposé', align: 'left', caption: '' }
    case 'quiz':
      return { ...base, type: 'quiz', question: 'Nouvelle question ?', options: ['Réponse A', 'Réponse B'], correctAnswerIndex: 0, explanation: 'Explication de la bonne réponse.' }
    case 'comparison':
      return { ...base, type: 'comparison', title: 'Comparaison', items: [{ name: 'Élément', description: 'Description', pros: ['Avantage'], cons: ['Inconvénient'] }] }
    case 'memo':
      return { ...base, type: 'memo', title: 'Mémo', content: 'Contenu du mémo.', icon: '📌' }
    default:
      return { ...base, type: 'text', content: '' }
  }
}

interface AdminContextValue {
  /** Mode démonstration admin activé (boutons crayon visibles). */
  isAdminMode: boolean
  toggleAdminMode: () => void
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

export function AdminProvider({ children }: { children: ReactNode }) {
  const persistence = useRef<TutorialPersistence>(localStoragePersistence)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [isDirty, setIsDirty] = useState(() => persistence.current.load() !== null)
  const [tutorial, setTutorial] = useState<EditableTutorial>(() => {
    return persistence.current.load() ?? hydrate()
  })
  // Pile d'annulation (snapshots avant chaque modification)
  const [undoStack, setUndoStack] = useState<EditableTutorial[]>([])
  const [versions, setVersions] = useState<SavedVersion[]>(() =>
    persistence.current.loadVersions()
  )
  // Session admin distante (cookie HttpOnly côté Worker)
  const remoteConfigured = isRemoteConfigured()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const baseRevision = useRef<string | undefined>(undefined)

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
  }, [remoteConfigured])

  const publish = useCallback(async () => {
    const store = getDraftStore()
    if (store.mode !== 'remote' || !store.publish) {
      return { ok: false, error: 'Publication indisponible en mode local.' }
    }
    setIsPublishing(true)
    try {
      const res = await store.publish('dragon-arena', tutorial, baseRevision.current)
      if (res.conflict) return { ok: false, conflict: true }
      if (res.revision) baseRevision.current = res.revision
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Échec de publication' }
    } finally {
      setIsPublishing(false)
    }
  }, [tutorial])

  /* ─── Historique & restauration ───
   * En distant : historique natif GitHub (commits).
   * En local (démo) : on expose les versions localStorage existantes sous la
   * même forme, pour une UI unique.
   */
  const fetchHistory = useCallback(async () => {
    if (remoteConfigured && isAuthenticated) {
      const res = await adminApi.history('dragon-arena')
      return res.entries
    }
    // Démo locale : map des versions enregistrées → entrées d'historique.
    return versions.map((v) => ({
      revision: v.id,
      date: new Date(v.savedAt).toISOString(),
      message: v.label,
      authorLabel: 'local'
    }))
  }, [remoteConfigured, isAuthenticated, versions])

  const fetchVersionContent = useCallback(
    async (revision: string): Promise<EditableTutorial | null> => {
      if (remoteConfigured && isAuthenticated) {
        const res = await adminApi.version('dragon-arena', revision)
        return (res.content as EditableTutorial) ?? null
      }
      const v = versions.find((x) => x.id === revision)
      return v ? v.tutorial : null
    },
    [remoteConfigured, isAuthenticated, versions]
  )

  const restorePublishedVersion = useCallback(
    async (revision: string): Promise<{ ok: boolean; error?: string }> => {
      if (remoteConfigured && isAuthenticated) {
        try {
          const res = await adminApi.restore('dragon-arena', revision)
          if (res.ok && res.revision) baseRevision.current = res.revision
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
    [remoteConfigured, isAuthenticated, versions]
  )

  // Persistance automatique à chaque changement, uniquement si "dirty".
  useEffect(() => {
    if (isDirty) {
      persistence.current.save(tutorial)
    }
  }, [tutorial, isDirty])

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
    persistence.current.clear()
    setTutorial(hydrate())
    setUndoStack([])
    setIsDirty(false)
    setIsPreview(false)
  }, [])

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
        persistence.current.saveVersions(next)
        return next
      })
    },
    [tutorial]
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
      persistence.current.saveVersions(next)
      return next
    })
  }, [])

  const toggleAdminMode = useCallback(() => {
    // En mode distant (production) : exiger l'authentification pour activer l'édition
    if (remoteConfigured && !isAuthenticated) {
      alert('⚠️ Authentification requise. Veuillez vous connecter d\'abord.')
      return
    }
    
    setIsAdminMode((v) => {
      if (v) setIsPreview(false)
      return !v
    })
  }, [remoteConfigured, isAuthenticated])

  const value = useMemo<AdminContextValue>(
    () => ({
      isAdminMode,
      toggleAdminMode,
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
