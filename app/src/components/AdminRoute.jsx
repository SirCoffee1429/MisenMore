import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth/useAuth.js'

// AdminRoute — gates the /admin panel behind the is_platform_admin JWT
// claim stamped by custom_access_token_hook. Resolution order mirrors
// ProtectedRoute: loading → no session → not admin → render.
export default function AdminRoute({ children }) {
  const { session, isPlatformAdmin, loading } = useAuth()

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isPlatformAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Forbidden</h2>
        <p>This page is for platform administrators only.</p>
      </div>
    )
  }

  return children
}
