/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL publique du Worker d'administration (vide = mode démo local). */
  readonly VITE_ADMIN_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
