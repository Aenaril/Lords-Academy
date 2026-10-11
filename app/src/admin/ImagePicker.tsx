import { useRef, useState } from 'react'
import { adminApi, isRemoteConfigured } from './api/client'
import { useAdmin } from './AdminContext'
import './ImagePicker.css'

interface ImagePickerProps {
  /** Chemin ou data-URL actuel de l'image. */
  value: string
  onChange: (value: string) => void
  label?: string
  /** Autorise la suppression (ex. image de fond optionnelle). */
  allowClear?: boolean
}

const MAX_BYTES = 2 * 1024 * 1024 // 2 Mo (limite démo locale)

/**
 * Sélecteur d'image : saisie d'un chemin existant OU import d'un fichier local
 * depuis l'ordinateur (converti en data-URL base64 pour la démo locale).
 * Un aperçu est toujours affiché.
 *
 * ⚠️ En démo locale, un fichier importé est stocké en base64 dans le brouillon
 * (localStorage). La future admin sécurisée enverra plutôt le fichier au
 * serveur (voir plan technique).
 */
export default function ImagePicker({ value, onChange, label, allowClear }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const { isAuthenticated } = useAdmin()

  // En admin sécurisée (connecté), on téléverse vers le Worker → URL publique.
  // Sinon, fallback démo : data-URL base64 locale.
  const canUploadRemote = isRemoteConfigured() && isAuthenticated

  const handleFile = async (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Le fichier sélectionné n\'est pas une image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image trop lourde (max 2 Mo en démo locale).')
      return
    }

    if (canUploadRemote) {
      setUploading(true)
      try {
        const res = await adminApi.upload(file)
        if (res.ok && res.url) {
          onChange(res.url)
        } else {
          setError(res.error ?? 'Échec du téléversement.')
        }
      } catch {
        setError('Téléversement impossible (service indisponible ?).')
      } finally {
        setUploading(false)
      }
      return
    }

    // Fallback local
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result)
    }
    reader.onerror = () => setError('Échec de lecture du fichier.')
    reader.readAsDataURL(file)
  }

  const isDataUrl = value.startsWith('data:')

  return (
    <div className="image-picker">
      {label && <span className="image-picker__label">{label}</span>}

      <div className="image-picker__preview">
        {value ? (
          <img src={value} alt="Aperçu" />
        ) : (
          <div className="image-picker__empty">Aucune image</div>
        )}
      </div>

      <div className="image-picker__controls">
        <button
          type="button"
          className="image-picker__btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '⏳ Téléversement…' : '📁 Importer depuis mon ordinateur'}
        </button>
        {allowClear && value && (
          <button
            type="button"
            className="image-picker__btn image-picker__btn--clear"
            onClick={() => onChange('')}
          >
            ✕ Retirer
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = '' // permet de re-sélectionner le même fichier
        }}
      />

      <label className="image-picker__path">
        <span>…ou chemin d'une image existante</span>
        <input
          type="text"
          value={isDataUrl ? '' : value}
          placeholder="/images/content/dragon-arena/15.jpeg"
          onChange={(e) => onChange(e.target.value)}
          disabled={isDataUrl}
        />
        {isDataUrl && (
          <small className="image-picker__note">
            Image importée (fichier local). Retirez-la pour saisir un chemin.
          </small>
        )}
      </label>

      {error && <p className="image-picker__error">{error}</p>}
    </div>
  )
}
