import { OrgProvider } from '../lib/org/OrgContext.jsx'
import { useOrg } from '../lib/org/useOrg.js'

// Guards kitchen routes — resolves slug → org before rendering children.
// Renders a 404 or error state if the slug doesn't match any known org.
function OrgGate({ children }) {
  const { loading, error } = useOrg()

  if (loading) {
    return <div className="loading-screen">Loading…</div>
  }

  if (error === 'not_found' || error === 'missing_slug') {
    return (
      <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Organization not found</h2>
        <p style={{ color: '#9ca3af' }}>
          The link you followed doesn't match any known organization.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
        <p style={{ color: '#9ca3af' }}>{error}</p>
      </div>
    )
  }

  return children
}

// Mounts OrgProvider and gates kitchen routes on successful slug resolution.
export default function OrgResolver({ children }) {
  return (
    <OrgProvider>
      <OrgGate>{children}</OrgGate>
    </OrgProvider>
  )
}
