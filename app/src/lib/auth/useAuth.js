import { useContext } from 'react'
import { AuthContext } from './AuthContext.jsx'

// useAuth — throws if used outside AuthProvider so missing-provider bugs
// surface immediately instead of as silent null reads downstream.
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
