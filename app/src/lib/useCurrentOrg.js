import { useContext } from 'react'
import { OrgContext } from './org/OrgContext.jsx'
import { AuthContext } from './auth/AuthContext.jsx'

// useCurrentOrg — resolves the active org for pages mounted in either
// tree. Kitchen routes wrap in <OrgProvider> (slug-based anon resolution);
// office routes rely on <AuthProvider> alone (JWT-stamped claims). Pages
// rendered under both trees (Briefings, EventsBanquetsPage, RecipeCreator,
// AiChat) use this so they don't need to know which shell is hosting them.
// Returns { orgId, orgSlug, loading, error, source } where source is
// 'org' | 'auth' — useful for branching write paths (anon can only write
// to whitelisted tables; authenticated writes pass through RLS).
export function useCurrentOrg() {
  const orgCtx = useContext(OrgContext)
  const authCtx = useContext(AuthContext)

  // Kitchen tree: OrgProvider is mounted. Prefer its slug-resolved org
  // over any signed-in manager's JWT claims — the URL slug is the
  // explicit intent of an anon kitchen view even if a manager is logged in.
  if (orgCtx !== null) {
    return {
      orgId: orgCtx.orgId,
      orgSlug: orgCtx.orgSlug,
      loading: orgCtx.loading,
      error: orgCtx.error,
      source: 'org',
    }
  }

  // Office tree: only AuthProvider is mounted. Read claims from JWT.
  if (authCtx !== null) {
    return {
      orgId: authCtx.orgId,
      orgSlug: authCtx.orgSlug,
      loading: authCtx.loading,
      error: null,
      source: 'auth',
    }
  }

  throw new Error('useCurrentOrg must be used within AuthProvider or OrgProvider')
}
