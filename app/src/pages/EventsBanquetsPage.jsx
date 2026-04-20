import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useCurrentOrg } from '../lib/useCurrentOrg.js'
import { withOrg } from '../lib/org/withOrg.js'

// EventsBanquetsPage — mounted in both trees. Kitchen variant (readOnly)
// only shows event names/dates; office variant allows BEO upload, note
// posting, and BEO management. Anon has zero access to
// banquet_event_orders per CLAUDE.md — the read silently returns empty
// for kitchen via RLS + explicit filter.
export default function EventsBanquetsPage({ readOnly = false }) {
    const { orgId, orgSlug, source } = useCurrentOrg()
    const isOffice = source === 'auth'
    const backLink = readOnly ? `/k/${orgSlug}` : `/o/${orgSlug}`

    const [notes, setNotes] = useState([])
    const [banquets, setBanquets] = useState([])
    const [beos, setBeos] = useState([])
    const [newText, setNewText] = useState('')
    const [authorName, setAuthorName] = useState(() => localStorage.getItem('mgmt_author') || '')
    const [posting, setPosting] = useState(false)
    const [loadingBanquets, setLoadingBanquets] = useState(true)
    const [uploadingBEO, setUploadingBEO] = useState(false)

    const accent = '#60a5fa'
    const accentBg = 'rgba(96, 165, 250, 0.08)'
    const accentBorder = 'rgba(96, 165, 250, 0.2)'

    useEffect(() => {
        if (!orgId) return
        loadNotes()
        loadBanquets()
        if (isOffice) {
            // Kitchen anon has no access to banquet_event_orders — skip the query
            loadBEOS()
        }
    }, [orgId, isOffice])

    // Event coordination notes — only office sees this column
    async function loadNotes() {
        const { data } = await supabase
            .from('management_notes')
            .select('*')
            .eq('org_id', orgId)
            .eq('category', 'events')
            .order('pinned', { ascending: false })
            .order('created_at', { ascending: false })
        setNotes(data || [])
    }

    // Upcoming banquet summary. Two paths:
    //   - Kitchen (anon): reads the kitchen_upcoming_events view, which
    //     projects safe columns only (no `notes`). Anon has zero RLS policy
    //     on the underlying upcoming_banquets table.
    //   - Office (authenticated): reads upcoming_banquets directly so RLS
    //     enforces org isolation at the DB level (the view is owner-rights
    //     and does not apply RLS on the underlying table).
    async function loadBanquets() {
        try {
            const source = readOnly ? 'kitchen_upcoming_events' : 'upcoming_banquets'
            const { data } = await supabase
                .from(source)
                .select('*')
                .eq('org_id', orgId)
                .gte('event_date', new Date().toISOString().split('T')[0])
                .order('event_date', { ascending: true })
            setBanquets(data || [])
        } catch (err) {
            console.error('Error fetching banquets', err)
        } finally {
            setLoadingBanquets(false)
        }
    }

    // Banquet event orders — office-only, never exposed to kitchen
    async function loadBEOS() {
        const { data } = await supabase
            .from('banquet_event_orders')
            .select('*')
            .eq('org_id', orgId)
            .order('event_date', { ascending: true })
        setBeos(data || [])
    }

    async function handlePost() {
        const content = newText.trim()
        if (!content || !orgId) return
        setPosting(true)
        const author = authorName.trim() || 'Manager'
        localStorage.setItem('mgmt_author', author)
        const { error } = await supabase
            .from('management_notes')
            .insert(withOrg(orgId, { content, author, category: 'events', pinned: false }))
        if (!error) {
            setNewText('')
            await loadNotes()
        }
        setPosting(false)
    }

    async function handleDelete(id) {
        if (!orgId) return
        await supabase.from('management_notes').delete().eq('id', id).eq('org_id', orgId)
        setNotes(prev => prev.filter(n => n.id !== id))
    }

    // Upload a BEO PDF — process-beo edge fn receives org_id so the
    // parsed row is stamped for the correct tenant.
    async function handleBEOUpload(e) {
        const file = e.target.files?.[0]
        if (!file || !orgId) return

        setUploadingBEO(true)
        try {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1]
                const { error } = await supabase.functions.invoke('process-beo', {
                    body: { pdfBase64: base64, org_id: orgId }
                })

                if (error) throw error
                await loadBEOS()
                alert("BEO Parsed Successfully!")
            }
        } catch (err) {
            console.error("Error uploading BEO:", err)
            alert("Failed to parse BEO. Check console for details.")
        } finally {
            setUploadingBEO(false)
        }
    }

    async function togglePin(id, currentPinned) {
        if (!orgId) return
        await supabase.from('management_notes').update({ pinned: !currentPinned }).eq('id', id).eq('org_id', orgId)
        await loadNotes()
    }

    async function handleDeleteBEO(id) {
        if (!orgId) return
        await supabase.from('banquet_event_orders').delete().eq('id', id).eq('org_id', orgId)
        setBeos(prev => prev.filter(b => b.id !== id))
    }

    async function handleClearAllBEOs() {
        if (!orgId) return
        if (!confirm('Are you sure you want to clear all BEOs? This cannot be undone.')) return
        const ids = beos.map(b => b.id)
        await supabase.from('banquet_event_orders').delete().in('id', ids).eq('org_id', orgId)
        setBeos([])
    }

    async function toggleBEOComplete(id, currentCompleted) {
        if (!orgId) return
        const newVal = !currentCompleted
        await supabase.from('banquet_event_orders').update({ completed: newVal }).eq('id', id).eq('org_id', orgId)
        setBeos(prev => prev.map(b => b.id === id ? { ...b, completed: newVal } : b))
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'Just now'
        if (mins < 60) return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs}h ago`
        const days = Math.floor(hrs / 24)
        if (days === 1) return 'Yesterday'
        return `${days}d ago`
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handlePost()
        }
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-left">
                    <h1 className="header-title"><i className="fa-solid fa-champagne-glasses title-icon" style={{ color: accent }} /> Events & Catering</h1>
                    <p className="header-date">Upcoming banquets and special event coordination</p>
                </div>
                <div className="header-actions">
                    {!readOnly && (
                        <label className={`btn btn-primary btn-sm ${uploadingBEO ? 'disabled' : ''}`} style={{ background: '#3b82f6', borderColor: '#3b82f6', cursor: 'pointer' }}>
                            <i className={`fa-solid ${uploadingBEO ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} />
                            {uploadingBEO ? 'Parsing...' : 'Upload BEO'}
                            <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleBEOUpload} disabled={uploadingBEO} />
                        </label>
                    )}
                    <Link to={backLink} className="btn btn-secondary btn-sm"><i className="fa-solid fa-arrow-left" /> Back</Link>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: readOnly ? '1fr' : 'minmax(0, 1fr) 300px', gap: 'var(--space-6)', alignItems: 'start' }}>

                {/* Left Panel: Parsed upcoming banquets & BEOs */}
                <div className="card-column" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

                    {/* BEO Details Card — office only */}
                    {!readOnly && beos.length > 0 && (
                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 className="card-title"><i className="fa-solid fa-file-invoice" style={{ color: '#3b82f6', marginRight: '8px' }}/> Banquet Event Orders</h2>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: 'var(--font-size-xs)', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                                    onClick={handleClearAllBEOs}
                                    title="Clear all BEOs"
                                >
                                    <i className="fa-solid fa-trash-can" /> Clear All
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
                                {beos.map(b => (
                                    <div
                                        key={b.id}
                                        style={{
                                            background: b.completed ? 'rgba(100,100,100,0.05)' : 'rgba(59, 130, 246, 0.04)',
                                            border: `1px solid ${b.completed ? 'var(--border-color)' : 'rgba(59, 130, 246, 0.15)'}`,
                                            borderRadius: 'var(--radius-md)',
                                            padding: 'var(--space-4)',
                                            opacity: b.completed ? 0.5 : 1,
                                            textDecoration: b.completed ? 'line-through' : 'none',
                                            transition: 'opacity 0.2s ease',
                                        }}
                                    >
                                        {/* Event Header Row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-3)' }}>
                                            <input
                                                type="checkbox"
                                                className="beo-check"
                                                checked={!!b.completed}
                                                onChange={() => toggleBEOComplete(b.id, b.completed)}
                                                title={b.completed ? 'Mark incomplete' : 'Mark complete'}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
                                                    {b.event_name}
                                                </div>
                                                <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '2px', flexWrap: 'wrap' }}>
                                                    <span><i className="fa-regular fa-calendar" style={{ marginRight: '5px', color: '#3b82f6' }} />
                                                        {new Date(b.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                    {b.start_time && (
                                                        <span><i className="fa-regular fa-clock" style={{ marginRight: '5px', color: '#3b82f6' }} />{b.start_time}</span>
                                                    )}
                                                    {b.guest_count && (
                                                        <span><i className="fa-solid fa-users" style={{ marginRight: '5px', color: '#3b82f6' }} />{b.guest_count} guests</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                className="wb-act-btn wb-act-delete"
                                                onClick={() => handleDeleteBEO(b.id)}
                                                title="Delete this BEO"
                                                style={{ fontSize: '0.9rem', flexShrink: 0 }}
                                            >
                                                <i className="fa-solid fa-xmark" />
                                            </button>
                                        </div>

                                        {/* Food Items */}
                                        {(b.food_items || []).length > 0 && (
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr auto',
                                                gap: '6px 20px',
                                                fontSize: '0.95rem',
                                                lineHeight: '1.5',
                                                padding: 'var(--space-3)',
                                                background: 'rgba(0,0,0,0.1)',
                                                borderRadius: 'var(--radius-sm)',
                                            }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Item</div>
                                                <div style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', textAlign: 'right' }}>Qty</div>
                                                {(b.food_items || []).map((fi, idx) => (
                                                    <>
                                                        <div key={`item-${idx}`} style={{ color: 'var(--text-primary)', paddingBlock: '3px', borderBottom: idx < b.food_items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                                            {fi.item}
                                                        </div>
                                                        <div key={`qty-${idx}`} style={{ fontWeight: 700, color: '#3b82f6', textAlign: 'right', paddingBlock: '3px', whiteSpace: 'nowrap', borderBottom: idx < b.food_items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                                            {fi.quantity}
                                                        </div>
                                                    </>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title"><i className="fa-solid fa-calendar-days" style={{ color: accent, marginRight: '8px' }}/> Upcoming Banquets (Summary)</h2>
                        </div>
                        {loadingBanquets ? (
                            <div className="shimmer" style={{ height: '200px', borderRadius: 'var(--radius-md)' }}></div>
                        ) : banquets.length === 0 ? (
                            <div className="empty-task-list">No upcoming banquets found. Forward "Upcoming in Banquets" PDFs to populate this board.</div>
                        ) : (
                            <div className="data-table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                <table className="data-table">
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                        <tr>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Event Name</th>
                                            <th>Location</th>
                                            <th>Guests</th>
                                            <th>Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {banquets.map(b => {
                                            const eventDate = new Date(b.event_date + 'T12:00:00')
                                            return (
                                                <tr key={b.id}>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{b.start_time || '-'}</td>
                                                    <td style={{ fontWeight: 500 }}>{b.event_name}</td>
                                                    <td>{b.location || '-'}</td>
                                                    <td>{b.guest_count > 0 ? b.guest_count : '-'}</td>
                                                    <td>{b.event_type || '-'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Single Whiteboard Column for coordination — office only */}
                {!readOnly && (
                <div className="wb-column" style={{ background: 'var(--bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    <div className="wb-author-bar" style={{ marginBottom: 'var(--space-4)' }}>
                        <i className="fa-solid fa-user-pen" />
                        <input
                            className="wb-author-input"
                            type="text"
                            placeholder="Your name..."
                            value={authorName}
                            onChange={e => setAuthorName(e.target.value)}
                            onBlur={() => localStorage.setItem('mgmt_author', authorName)}
                        />
                    </div>

                    <div className="wb-col-header" style={{ borderBottomColor: accentBorder }}>
                        <h3 className="wb-col-title">
                            <i className="fa-solid fa-comments" style={{ color: accent }} />
                            Event Coordination
                        </h3>
                        <span className="wb-col-count" style={{ background: accentBg, color: accent }}>
                            {notes.length}
                        </span>
                    </div>

                    <div className="wb-col-feed" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                        {notes.length === 0 ? (
                            <div className="wb-empty">No coordination notes yet</div>
                        ) : (
                            notes.map(note => (
                                <div
                                    key={note.id}
                                    className={`wb-note ${note.pinned ? 'wb-note-pinned' : ''}`}
                                    style={{
                                        background: note.pinned ? accentBg : undefined,
                                        borderColor: note.pinned ? accentBorder : undefined,
                                    }}
                                >
                                    <div className="wb-note-header">
                                        <span className="wb-note-author" style={{ color: accent }}>{note.author}</span>
                                        <span className="wb-note-time">{timeAgo(note.created_at)}</span>
                                    </div>
                                    <p className="wb-note-body">{note.content}</p>
                                    {note.pinned && (
                                        <span className="wb-pinned-tag" style={{ background: accentBg, color: accent }}>
                                            <i className="fa-solid fa-thumbtack" /> Pinned
                                        </span>
                                    )}
                                    <div className="wb-note-actions">
                                        <button
                                            className={`wb-act-btn ${note.pinned ? 'active' : ''}`}
                                            style={{ '--act-color': accent }}
                                            onClick={() => togglePin(note.id, note.pinned)}
                                            title={note.pinned ? 'Unpin' : 'Pin'}
                                        >
                                            <i className="fa-solid fa-thumbtack" />
                                        </button>
                                        <button
                                            className="wb-act-btn wb-act-delete"
                                            onClick={() => handleDelete(note.id)}
                                            title="Delete"
                                        >
                                            <i className="fa-solid fa-trash-can" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="wb-col-input" style={{ marginTop: 'var(--space-4)' }}>
                        <div className="wb-input-row">
                            <input
                                className="wb-text-input"
                                type="text"
                                placeholder="Write a note..."
                                value={newText}
                                onChange={e => setNewText(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <button
                                className="wb-send-btn"
                                style={{ background: accent }}
                                onClick={handlePost}
                                disabled={posting || !newText.trim() || !orgId}
                            >
                                {posting
                                    ? <i className="fa-solid fa-spinner fa-spin" />
                                    : <i className="fa-solid fa-paper-plane" />}
                            </button>
                        </div>
                    </div>
                </div>
                )}

            </div>
        </div>
    )
}
