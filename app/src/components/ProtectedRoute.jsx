import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth/useAuth.js'

// ProtectedRoute — gates office routes behind Supabase auth + org claim.
// Resolution order matters: loading → no session → no org claim → slug
// mismatch → render. The slug-mismatch redirect prevents a manager from
// seeing /o/some-other-org's UI shell even briefly.
export default function ProtectedRoute({ children }) {
  const { session, orgSlug, loading } = useAuth()
  const { orgSlug: urlSlug } = useParams()

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!orgSlug) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Account not provisioned</h2>
        <p>
          Your account exists but isn’t linked to an organization yet.
          Contact your administrator.
        </p>
      </div>
    )
  }

  if (urlSlug && urlSlug !== orgSlug) {
    return <Navigate to={`/o/${orgSlug}`} replace />
  }

  return children
}
