import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function History() {
    const [days, setDays] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const { data: briefings } = await supabase
                .from('briefings')
                .select('*, briefing_tasks(*)')
                .order('date', { ascending: false })
                .limit(30)

            // Group by date
            const grouped = {}
                ; (briefings || []).forEach(b => {
                    if (!grouped[b.date]) grouped[b.date] = []
                    grouped[b.date].push(b)
                })

            const daysList = Object.entries(grouped)
                .map(([date, briefings]) => ({ date, briefings }))
                .sort((a, b) => b.date.localeCompare(a.date))

            setDays(daysList)
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Daily History</h1>
                <p className="page-subtitle">Briefings, tasks, and completion log by day</p>
            </div>

            {days.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <div className="empty-state-text">No history yet. Create a briefing to get started.</div>
                </div>
            ) : (
                <div className="history-list">
                    {days.map(day => (
                        <div key={day.date} className="history-day-card">
                            <div className="history-day-header">
                                <span className="history-day-date">
                                    {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                                    })}
                                </span>
                            </div>

                            {day.briefings.map(b => {
                                const tasks = (b.briefing_tasks || []).sort((a, b) => a.sort_order - b.sort_order)
                                const completed = tasks.filter(t => t.is_completed).length

                                return (
                                    <div key={b.id} className="history-briefing">
                                        <div className="history-briefing-header">
                                            <h3 className="history-briefing-title">{b.title}</h3>
                                            {tasks.length > 0 && (
                                                <span className={`task-count-badge ${completed === tasks.length ? 'all-done' : ''}`}>
                                                    {completed}/{tasks.length} tasks
                                                </span>
                                            )}
                                        </div>

                                        {b.body && (
                                            <p className="history-briefing-body">{b.body}</p>
                                        )}

                                        {tasks.length > 0 && (
                                            <div className="history-task-list">
                                                {tasks.map(task => (
                                                    <div key={task.id} className="history-task-item">
                                                        <span className={`history-task-status ${task.is_completed ? 'done' : 'missed'}`}>
                                                            {task.is_completed ? '✓' : '✗'}
                                                        </span>
                                                        <span className={`history-task-text ${task.is_completed ? 'completed' : ''}`}>
                                                            {task.description}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
