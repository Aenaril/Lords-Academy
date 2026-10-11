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
 * Le mot de passe n'est jamais stocké : il est envoyé une seule fois au Worker,
 * qui pose un cookie de session HttpOnly. Si aucune URL de Worker n'est
 * configurée (`VITE_ADMIN_API_BASE` absent), on l'indique clairement.
 * 
 * Après connexion réussie :
 * - Appelle onRefreshSession() pour actualiser isAuthenticated
 * - Puis appelle onSuccess() pour fermer la modale
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
        // Actualiser la session PUIS fermer la modale
        await onRefreshSession()
        onSuccess()
      } else {
        setError(res.error ?? 'Connexion refusée')
      }
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 429) {
        const mins = err.retryAfter ? Math.ceil(err.retryAfter / 60) : 15
        setError(`Trop de tentatives. Réessayez dans ~${mins} min.`)
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
              (bouton « Mode démo admin »), qui enregistre vos essais dans ce
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
              Session sécurisée par cookie. Aucune donnée de mot de passe n'est
              conservée dans le navigateur.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
