import { createContext, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'

// OrgContext — anon-safe slug resolution for kitchen routes. Reads
// :orgSlug from the URL, looks up the matching organizations row, and
// exposes the resolved org_id so kitchen queries can pass
// .eq('org_id', orgId) without trusting RLS alone (anon kitchen has no
// JWT claims to scope queries server-side).
export const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const { orgSlug } = useParams()
  const [state, setState] = useState({
    orgId: null,
    orgSlug: orgSlug ?? null,
    orgName: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!orgSlug) {
      setState({
        orgId: null,
        orgSlug: null,
        orgName: null,
        loading: false,
        error: 'missing_slug',
      })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null, orgSlug }))

    supabase
      .from('organizations')
      .select('id, slug, name')
      .eq('slug', orgSlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({
            orgId: null,
            orgSlug,
            orgName: null,
            loading: false,
            error: error.message,
          })
          return
        }
        if (!data) {
          setState({
            orgId: null,
            orgSlug,
            orgName: null,
            loading: false,
            error: 'not_found',
          })
          return
        }
        setState({
          orgId: data.id,
          orgSlug: data.slug,
          orgName: data.name,
          loading: false,
          error: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [orgSlug])

  const value = useMemo(() => state, [state])
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}
