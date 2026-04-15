import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Briefings() {
    const [briefings, setBriefings] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadBriefings()
    }, [])

    // Fetch all briefings ordered by date descending
    async function loadBriefings() {
        setLoading(true)
        const { data } = await supabase
            .from('briefings')
            .select('*, briefing_tasks(*)')
            .order('date', { ascending: false })
        setBriefings(data || [])
        setLoading(false)
    }

    // Toggle a task's completion state
    async function toggleTask(taskId, isCompleted) {
        await supabase
            .from('briefing_tasks')
            .update({ is_completed: !isCompleted })
            .eq('id', taskId)

        setBriefings(prev =>
            prev.map(b => ({
                ...b,
                briefing_tasks: b.briefing_tasks.map(t =>
                    t.id === taskId ? { ...t, is_completed: !isCompleted } : t
                )
            }))
        )
    }

    // Delete a briefing by ID
    async function deleteBriefing(id) {
        if (!confirm('Delete this briefing?')) return
        await supabase.from('briefings').delete().eq('id', id)
        setBriefings(prev => prev.filter(b => b.id !== id))
    }

    if (loading) {
        return <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
    }

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">Briefings</h1>
                    <p className="page-subtitle">Shift notes and tasks for the crew</p>
                </div>
                <Link to="/office/briefings/new" className="btn btn-primary">📋 New Briefing</Link>
            </div>

            {briefings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-text">No briefings yet. Create one for the crew.</div>
                    <Link to="/office/briefings/new" className="btn btn-primary" style={{ marginTop: 'var(--space-5)' }}>
                        📋 Create Briefing
                    </Link>
                </div>
            ) : (
                <div className="briefing-list">
                    {briefings.map(b => (
                        <div key={b.id} className="briefing-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div className="briefing-card-date">
                                        {new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                    <div className="briefing-card-title">{b.title}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                    <Link to={`/office/briefings/${b.id}/edit`} className="btn btn-sm btn-secondary">✏️ Edit</Link>
                                    <button className="btn btn-sm btn-danger" onClick={() => deleteBriefing(b.id)}>🗑</button>
                                </div>
                            </div>

                            {b.body && <div className="briefing-card-body">{b.body}</div>}

                            {b.briefing_tasks && b.briefing_tasks.length > 0 && (
                                <div style={{ marginTop: 'var(--space-3)' }}>
                                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Tasks ({b.briefing_tasks.filter(t => t.is_completed).length}/{b.briefing_tasks.length})
                                    </div>
                                    {b.briefing_tasks
                                        .sort((a, b) => a.sort_order - b.sort_order)
                                        .map(task => (
                                            <div key={task.id} className="task-item">
                                                <input
                                                    type="checkbox"
                                                    className="task-checkbox"
                                                    checked={task.is_completed}
                                                    onChange={() => toggleTask(task.id, task.is_completed)}
                                                />
                                                <span className={`task-text ${task.is_completed ? 'completed' : ''}`}>
                                                    {task.description}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
