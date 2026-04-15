import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const COLUMNS = [
    { key: 'comms', title: 'Department Communication', icon: 'fa-comments', accent: '#4ade80', accentBg: 'rgba(74, 222, 128, 0.08)', accentBorder: 'rgba(74, 222, 128, 0.2)' },
]

export default function ManagementWhiteboard({ hideHeader = false }) {
    const [notes, setNotes] = useState([])
    const [newTexts, setNewTexts] = useState({ alerts: '', events: '', comms: '' })
    const [authorName, setAuthorName] = useState(() => localStorage.getItem('mgmt_author') || '')
    const [posting, setPosting] = useState(null)
    const inputRefs = useRef({})

    useEffect(() => {
        loadNotes()
    }, [])

    async function loadNotes() {
        const { data } = await supabase
            .from('management_notes')
            .select('*')
            .order('pinned', { ascending: false })
            .order('created_at', { ascending: false })
        setNotes(data || [])
    }

    async function handlePost(category) {
        const content = newTexts[category]?.trim()
        if (!content) return
        setPosting(category)
        const author = authorName.trim() || 'Manager'
        localStorage.setItem('mgmt_author', author)
        const { error } = await supabase
            .from('management_notes')
            .insert({ content, author, category, pinned: false })
        if (!error) {
            setNewTexts(prev => ({ ...prev, [category]: '' }))
            await loadNotes()
        }
        setPosting(null)
    }

    async function handleDelete(id) {
        await supabase.from('management_notes').delete().eq('id', id)
        setNotes(prev => prev.filter(n => n.id !== id))
    }

    async function togglePin(id, currentPinned) {
        await supabase.from('management_notes').update({ pinned: !currentPinned }).eq('id', id)
        await loadNotes()
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

    function handleKeyDown(e, category) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handlePost(category)
        }
    }

    // When embedded on the dashboard (hideHeader), use flex layout to fill container
    const embeddedBoardStyle = hideHeader ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' } : {}
    const embeddedColumnsStyle = hideHeader ? { flex: 1, minHeight: 0 } : {}
    const embeddedColumnStyle = hideHeader ? { border: 'none', background: 'transparent', minHeight: 0, maxHeight: 'none', flex: 1 } : {}

    return (
        <div className="wb-board" style={embeddedBoardStyle}>
            {/* Author name bar */}
            {!hideHeader && (
                <div className="wb-author-bar">
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
            )}

            {/* Column grid */}
            <div className="wb-columns" style={embeddedColumnsStyle}>
                {COLUMNS.map(col => {
                    const colNotes = notes.filter(n => n.category === col.key)
                    return (
                        <div key={col.key} className="wb-column" style={embeddedColumnStyle}>
                            
                            {!hideHeader && (
                                <div className="wb-col-header" style={{ borderBottomColor: col.accentBorder }}>
                                    <h3 className="wb-col-title">
                                        <i className={`fa-solid ${col.icon}`} style={{ color: col.accent }} />
                                        {col.title}
                                    </h3>
                                    <span className="wb-col-count" style={{ background: col.accentBg, color: col.accent }}>
                                        {colNotes.length}
                                    </span>
                                </div>
                            )}

                            <div className="wb-col-feed">
                                {colNotes.length === 0 ? (
                                    <div className="wb-empty">No posts yet</div>
                                ) : (
                                    colNotes.map(note => (
                                        <div
                                            key={note.id}
                                            className={`wb-note ${note.pinned ? 'wb-note-pinned' : ''}`}
                                            style={{
                                                background: note.pinned ? col.accentBg : undefined,
                                                borderColor: note.pinned ? col.accentBorder : undefined,
                                            }}
                                        >
                                            <div className="wb-note-header">
                                                <span className="wb-note-author" style={{ color: col.accent }}>{note.author}</span>
                                                <span className="wb-note-time">{timeAgo(note.created_at)}</span>
                                            </div>
                                            <p className="wb-note-body">{note.content}</p>
                                            {note.pinned && (
                                                <span className="wb-pinned-tag" style={{ background: col.accentBg, color: col.accent }}>
                                                    <i className="fa-solid fa-thumbtack" /> Pinned
                                                </span>
                                            )}
                                            <div className="wb-note-actions">
                                                <button
                                                    className={`wb-act-btn ${note.pinned ? 'active' : ''}`}
                                                    style={{ '--act-color': col.accent }}
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

                            <div className="wb-col-input">
                                <div className="wb-input-row">
                                    <input
                                        ref={el => inputRefs.current[col.key] = el}
                                        className="wb-text-input"
                                        type="text"
                                        placeholder="Write a message..."
                                        value={newTexts[col.key]}
                                        onChange={e => setNewTexts(prev => ({ ...prev, [col.key]: e.target.value }))}
                                        onKeyDown={e => handleKeyDown(e, col.key)}
                                    />
                                    <button
                                        className="wb-send-btn"
                                        style={{ background: col.accent }}
                                        onClick={() => handlePost(col.key)}
                                        disabled={posting === col.key || !newTexts[col.key]?.trim()}
                                    >
                                        {posting === col.key
                                            ? <i className="fa-solid fa-spinner fa-spin" />
                                            : <i className="fa-solid fa-paper-plane" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
