import { createContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'

// AuthContext — single source of truth for authenticated session state.
// Reads org_id, org_slug, role from JWT app_metadata (stamped by the
// custom_access_token_hook in Phase 3). Does NOT navigate on its own;
// Login.jsx and ProtectedRoute.jsx handle navigation explicitly so the
// redirect surface stays predictable.
export const AuthContext = createContext(null)

// Decodes a JWT payload (no signature check — Supabase already validated
// the token; we just need to read claims). The custom_access_token_hook
// stamps org_id/org_slug/role into the JWT's app_metadata, which is
// distinct from session.user.app_metadata (that mirrors the auth.users
// raw_app_meta_data column and is NOT touched by the hook).
function decodeJwtPayload(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch {
    return null
  }
}

// Pulls the three claims the hook stamps. Returns nulls when the user
// exists but has no org_members row (graceful no-op path from Phase 3).
export function readOrgClaims(session) {
  const claims = decodeJwtPayload(session?.access_token)
  const meta = claims?.app_metadata ?? {}
  return {
    orgId: meta.org_id ?? null,
    orgSlug: meta.org_slug ?? null,
    role: meta.role ?? null,
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  // loading stays true until the first getSession() resolves so that
  // ProtectedRoute does not flash a /login redirect on page refresh
  // before Supabase rehydrates the persisted session from localStorage.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return
      setSession(next ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => {
    const { orgId, orgSlug, role } = readOrgClaims(session)
    return {
      session,
      user: session?.user ?? null,
      orgId,
      orgSlug,
      role,
      loading,
      // signIn — surfaces the Supabase response so Login.jsx can branch on
      // error vs. success and read the freshly-stamped org_slug claim
      // directly from data.session before navigating.
      signIn: (email, password) =>
        supabase.auth.signInWithPassword({ email, password }),
      signOut: () => supabase.auth.signOut(),
    }
  }, [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
