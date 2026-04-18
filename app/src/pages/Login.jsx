import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth/useAuth.js'
import { readOrgClaims } from '../lib/auth/AuthContext.jsx'

// Login — email + password sign-in. Reads the org_slug claim from the
// freshly-issued session (stamped by custom_access_token_hook) and
// navigates straight to /o/:orgSlug. If the user signs in but has no
// org_members row, the hook returns app_metadata without org_slug —
// surfaced here as the "account not provisioned" error state.
export default function Login() {
  const { signIn, session, orgSlug, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Already-signed-in visitors get bounced straight to their org. Covers
  // refreshes on /login when a session is already in localStorage.
  useEffect(() => {
    if (!loading && session && orgSlug) {
      navigate(`/o/${orgSlug}`, { replace: true })
    }
  }, [loading, session, orgSlug, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data, error: signInError } = await signIn(email, password)
      if (signInError) {
        setError(signInError.message)
        return
      }
      const { orgSlug: slug } = readOrgClaims(data?.session)
      if (!slug) {
        setError('Account not provisioned — no organization is linked to this user.')
        return
      }
      navigate(`/o/${slug}`, { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '64px auto', padding: 24 }}>
      <h1>MisenMore</h1>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Sign in</h2>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        {error && (
          <div role="alert" style={{ color: '#b00020', marginBottom: 12 }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 10 }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
