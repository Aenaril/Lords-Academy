import { useState } from 'react'
import { adminApi, AdminApiError, isRemoteConfigured } from './api/client'
import './AdminLogin.css'

interface AdminLoginProps {
  onSuccess: () => void
  onRefreshSession: () => Promise<void>
  onClose: () => void
}

/**
 * Panneau de connexion R4 par mot de passe partagé.
 *
 * Après connexion réussie :
 * 1. Actualise la session avec onRefreshSession() pour mettre à jour isAuthenticated
 * 2. Appelle onSuccess() pour fermer la modale et activer l'édition
 * 3. Gère les erreurs de manière explicite (rate limiting, service indisponible, etc.)
 */
export default function AdminLogin({ onSuccess, onRefreshSession, onClose }: AdminLoginProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const configured = isRemoteConfigured()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await adminApi.login(password)
      if (res.ok) {
        setPassword('')
        // Actualiser la session PUIS appeler onSuccess
        // Cela garantit que isAuthenticated sera à jour avant que l'UI n'active l'édition
        try {
          await onRefreshSession()
        } catch (err) {
          // Si refreshSession échoue (réseau lent), on reste en attente
          setError('Impossible de vérifier la session. Veuillez réessayer.')
          setLoading(false)
          return
        }
        // Succès : fermer la modale et activer l'édition
        onSuccess()
      } else {
        setError(res.error ?? 'Mot de passe incorrect')
      }
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 429) {
        const mins = err.retryAfter ? Math.ceil(err.retryAfter / 60) : 15
        setError(`Trop de tentatives. Veuillez réessayer dans ~${mins} min.`)
      } else {
        setError('Connexion impossible (service indisponible ?)')
      }
    } finally {
      setLoading(false)
      setPassword('')
    }
  }

  return (
    <div className="admin-login__overlay" onClick={onClose}>
      <div className="admin-login" onClick={(e) => e.stopPropagation()}>
        <div className="admin-login__head">
          <h3>🔐 Administration R4</h3>
          <button className="admin-login__close" onClick={onClose}>✕</button>
        </div>

        {!configured ? (
          <div className="admin-login__notice">
            <p>
              Le service d'administration sécurisé n'est pas encore configuré sur
              cet environnement.
            </p>
            <p className="admin-login__hint">
              Pour l'instant, utilisez le <strong>mode démo local</strong>
              (bouton « Mode admin »), qui enregistre vos modifications dans ce
              navigateur sans rien publier.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="admin-login__form">
            <label>
              <span>Mot de passe partagé</span>
              <input
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            {error && <p className="admin-login__error">{error}</p>}
            <button type="submit" className="admin-login__submit" disabled={loading || !password}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
            <p className="admin-login__hint">
              Session sécurisée par cookie HttpOnly. Aucune donnée n'est stockée en local.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
