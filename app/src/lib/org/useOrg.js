import { useContext } from 'react'
import { OrgContext } from './OrgContext.jsx'

// useOrg — throws if used outside OrgProvider so kitchen components can
// rely on a non-null context shape (loading/error fields always present).
export function useOrg() {
  const ctx = useContext(OrgContext)
  if (ctx === null) {
    throw new Error('useOrg must be used within an OrgProvider')
  }
  return ctx
}
