// withOrg — stamps org_id onto every write payload before it hits Supabase.
// Per CLAUDE.md rule 11: every INSERT/UPDATE must use this helper. Returns
// a new object (or new array of new objects) — never mutates the input.
export function withOrg(orgId, row) {
  if (!orgId) {
    throw new Error('withOrg called without orgId — refusing to write unscoped row')
  }
  if (Array.isArray(row)) {
    return row.map((r) => ({ ...r, org_id: orgId }))
  }
  return { ...row, org_id: orgId }
}
