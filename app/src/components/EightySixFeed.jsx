import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const ACCENT = '#f87171'
const ACCENT_BG = 'rgba(248, 113, 113, 0.08)'
const ACCENT_BORDER = 'rgba(248, 113, 113, 0.2)'

export default function EightySixFeed() {
    const [notes, setNotes] = useState([])
    const [newText, setNewText] = useState('')
    const [posting, setPosting] = useState(false)

    useEffect(() => {
        loadNotes()
    }, [])

    async function loadNotes() {
        const { data } = await supabase
            .from('management_notes')
            .select('*')
            .eq('category', 'alerts')
            .order('pinned', { ascending: false })
            .order('created_at', { ascending: false })
        setNotes(data || [])
    }

    async function handlePost() {
        const content = newText.trim()
        if (!content) return
        setPosting(true)
        const { error } = await supabase
            .from('management_notes')
            .insert({ content, author: 'Kitchen', category: 'alerts', pinned: false })
        if (!error) {
            setNewText('')
            await loadNotes()
        }
        setPosting(false)
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

    function handleKeyDown(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handlePost()
        }
    }

    return (
        <div className="dash-card eightysix-card">
            <div className="card-header-row" style={{ borderBottomColor: ACCENT_BORDER }}>
                <h2 className="dash-card-heading">
                    <i className="fa-solid fa-triangle-exclamation" style={{ color: ACCENT }} /> 86'd Items
                </h2>
                <span style={{ background: ACCENT_BG, color: ACCENT, padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                    {notes.length}
                </span>
            </div>

            <div className="eightysix-feed">
                {notes.length === 0 ? (
                    <div className="empty-task-list">Nothing 86'd right now</div>
                ) : (
                    notes.map(note => (
                        <div
                            key={note.id}
                            className={`eightysix-item ${note.pinned ? 'eightysix-pinned' : ''}`}
                        >
                            <div className="eightysix-item-top">
                                <span className="eightysix-item-text">{note.content}</span>
                                <span className="eightysix-item-time">{timeAgo(note.created_at)}</span>
                            </div>
                            <div className="eightysix-item-actions">
                                {note.pinned && (
                                    <span style={{ fontSize: 'var(--font-size-xs)', color: ACCENT, marginRight: 'auto' }}>
                                        <i className="fa-solid fa-thumbtack" /> Pinned
                                    </span>
                                )}
                                <button
                                    className={`wb-act-btn ${note.pinned ? 'active' : ''}`}
                                    style={{ '--act-color': ACCENT }}
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

            <div className="eightysix-input">
                <input
                    type="text"
                    placeholder="86 an item..."
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="wb-text-input"
                />
                <button
                    className="wb-send-btn"
                    style={{ background: ACCENT }}
                    onClick={handlePost}
                    disabled={posting || !newText.trim()}
                >
                    {posting
                        ? <i className="fa-solid fa-spinner fa-spin" />
                        : <i className="fa-solid fa-paper-plane" />}
                </button>
            </div>
        </div>
    )
}
