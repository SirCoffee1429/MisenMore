import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth/useAuth.js'

// AdminPanel — platform-admin-only org and member CRUD. Reads run
// against RLS via the user's session (the platform-admin policy on
// organizations + org_members lets the read through). Writes that need
// to create auth users (invite manager) go through the admin-mutations
// edge function, which re-verifies the is_platform_admin claim before
// using the service role key.
export default function AdminPanel() {
  const { session, signOut, user } = useAuth()

  const [orgs, setOrgs] = useState([])
  const [members, setMembers] = useState({}) // org_id -> [{user_id, role, email}]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSlug, setNewOrgSlug] = useState('')
  const [creating, setCreating] = useState(false)

  const [inviteOrgId, setInviteOrgId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteRole, setInviteRole] = useState('manager')
  const [inviting, setInviting] = useState(false)

  const callAdminMutation = useCallback(
    async (action, body) => {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'admin-mutations',
        { body: { action, ...body } }
      )
      if (invokeError) throw new Error(invokeError.message)
      if (data?.error) throw new Error(data.error)
      return data
    },
    []
  )

  const loadOrgs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: orgRows, error: orgsErr } = await supabase
        .from('organizations')
        .select('id, slug, name, inbound_email_key, created_at')
        .order('created_at', { ascending: true })
      if (orgsErr) throw orgsErr
      setOrgs(orgRows || [])

      // Fetch members + emails for every org via the admin function so we
      // can show emails (auth.users isn't readable from the client).
      if (orgRows?.length) {
        const data = await callAdminMutation('list_members', {
          org_ids: orgRows.map((o) => o.id),
        })
        setMembers(data?.members || {})
      } else {
        setMembers({})
      }
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [callAdminMutation])

  useEffect(() => {
    if (session) loadOrgs()
  }, [session, loadOrgs])

  async function handleCreateOrg(e) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      await callAdminMutation('create_org', {
        slug: newOrgSlug.trim().toLowerCase(),
        name: newOrgName.trim(),
      })
      setNewOrgName('')
      setNewOrgSlug('')
      await loadOrgs()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setError(null)
    setInviting(true)
    try {
      await callAdminMutation('invite_member', {
        org_id: inviteOrgId,
        email: inviteEmail.trim().toLowerCase(),
        password: invitePassword,
        role: inviteRole,
      })
      setInviteEmail('')
      setInvitePassword('')
      await loadOrgs()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setInviting(false)
    }
  }

  async function handleRemoveMember(orgId, userId) {
    if (!confirm('Remove this member from the org? Their auth user is kept.')) return
    setError(null)
    try {
      await callAdminMutation('remove_member', { org_id: orgId, user_id: userId })
      await loadOrgs()
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  async function handleRotateInboundKey(orgId) {
    if (!confirm('Rotate the inbound email key for this org? The old plus-address will stop working.')) return
    setError(null)
    try {
      await callAdminMutation('rotate_inbound_key', { org_id: orgId })
      await loadOrgs()
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>MisenMore — Admin</h1>
        <div style={{ fontSize: 13, color: '#555' }}>
          Signed in as <strong>{user?.email}</strong>{' '}
          <button
            type="button"
            onClick={() => signOut()}
            style={{ marginLeft: 12, padding: '4px 12px' }}
          >
            Sign out
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ color: '#b00020', margin: '12px 0' }}>
          {error}
        </div>
      )}

      <section style={{ marginTop: 24 }}>
        <h2>Create organization</h2>
        <form onSubmit={handleCreateOrg} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            required
            placeholder="Display name (e.g. Old Hawthorne CC)"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            style={{ flex: '1 1 220px', padding: 8 }}
          />
          <input
            required
            placeholder="URL slug (e.g. old-hawthorne)"
            value={newOrgSlug}
            onChange={(e) => setNewOrgSlug(e.target.value)}
            style={{ flex: '1 1 220px', padding: 8 }}
          />
          <button type="submit" disabled={creating} style={{ padding: '8px 16px' }}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Invite manager</h2>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            required
            value={inviteOrgId}
            onChange={(e) => setInviteOrgId(e.target.value)}
            style={{ padding: 8, flex: '1 1 200px' }}
          >
            <option value="">Select org…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <input
            type="email"
            required
            placeholder="manager@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ flex: '1 1 220px', padding: 8 }}
          />
          <input
            type="password"
            required
            minLength={10}
            placeholder="Temporary password (min 10)"
            value={invitePassword}
            onChange={(e) => setInvitePassword(e.target.value)}
            style={{ flex: '1 1 200px', padding: 8 }}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{ padding: 8 }}
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="kitchen_staff">Kitchen Staff</option>
          </select>
          <button type="submit" disabled={inviting} style={{ padding: '8px 16px' }}>
            {inviting ? 'Inviting…' : 'Invite'}
          </button>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Organizations</h2>
        {loading ? (
          <p>Loading…</p>
        ) : orgs.length === 0 ? (
          <p>No organizations yet.</p>
        ) : (
          orgs.map((org) => (
            <div key={org.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0 }}>{org.name}</h3>
                <code style={{ fontSize: 12, color: '#666' }}>/o/{org.slug}</code>
              </div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <strong>Inbound key:</strong>{' '}
                <code>{org.inbound_email_key}</code>{' '}
                <button
                  type="button"
                  onClick={() => handleRotateInboundKey(org.id)}
                  style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                >
                  Rotate
                </button>
                <div style={{ color: '#666', marginTop: 4 }}>
                  Postmark inbound: <code>sales+{org.inbound_email_key}@parse.misenmore.com</code> /{' '}
                  <code>banquets+{org.inbound_email_key}@parse.misenmore.com</code>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <strong>Members</strong>
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  {(members[org.id] || []).length === 0 && <li style={{ color: '#888' }}>No members</li>}
                  {(members[org.id] || []).map((m) => (
                    <li key={m.user_id} style={{ marginBottom: 4 }}>
                      {m.email} — <em>{m.role}</em>{' '}
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(org.id, m.user_id)}
                        style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
