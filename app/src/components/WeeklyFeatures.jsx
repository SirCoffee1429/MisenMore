import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { withOrg } from '../lib/org/withOrg.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Resolve the Monday of the week containing `date`, formatted as YYYY-MM-DD
function getWeekStart(date = new Date()) {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split('T')[0]
}

// Day-of-month for the given index offset from a week's Monday
function getDayDate(weekStart, dayIdx) {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + dayIdx)
    return d.getDate()
}

// WeeklyFeatures — lunch/dinner calendar rendered in both kitchen and
// office dashboards. Receives orgId as a prop from whichever parent
// resolved it; queries skip when orgId is not yet available.
export default function WeeklyFeatures({ orgId }) {
    const [weekStart, setWeekStart] = useState(() => getWeekStart())
    const [features, setFeatures] = useState({})
    const [editing, setEditing] = useState(null)
    const [editValue, setEditValue] = useState('')
    const [saving, setSaving] = useState(false)

    // Fetch this org's features for the active week
    const loadFeatures = useCallback(async () => {
        if (!orgId) {
            setFeatures({})
            return
        }
        const { data } = await supabase
            .from('weekly_features')
            .select('*')
            .eq('org_id', orgId)
            .eq('week_start', weekStart)
        const map = {}
        ;(data || []).forEach(f => {
            map[`${f.day_of_week}-${f.meal}`] = f
        })
        setFeatures(map)
    }, [orgId, weekStart])

    useEffect(() => {
        loadFeatures()
    }, [loadFeatures])

    function shiftWeek(dir) {
        const d = new Date(weekStart + 'T00:00:00')
        d.setDate(d.getDate() + dir * 7)
        setWeekStart(d.toISOString().split('T')[0])
    }

    // Save edit for a specific day+meal cell. Deletes the row when the
    // cell is cleared, updates an existing row, or inserts a new one
    // (stamped with org_id via withOrg).
    async function saveEdit(dayIdx, meal) {
        const key = `${dayIdx}-${meal}`
        const content = editValue.trim()
        if (!orgId) {
            setEditing(null)
            setEditValue('')
            return
        }
        setSaving(true)

        if (!content) {
            const existing = features[key]
            if (existing) {
                await supabase
                    .from('weekly_features')
                    .delete()
                    .eq('id', existing.id)
                    .eq('org_id', orgId)
            }
        } else {
            const existing = features[key]
            if (existing) {
                await supabase
                    .from('weekly_features')
                    .update({ content, updated_at: new Date().toISOString() })
                    .eq('id', existing.id)
                    .eq('org_id', orgId)
            } else {
                await supabase
                    .from('weekly_features')
                    .insert(withOrg(orgId, {
                        week_start: weekStart,
                        day_of_week: dayIdx,
                        meal,
                        content,
                    }))
            }
        }

        setEditing(null)
        setEditValue('')
        setSaving(false)
        await loadFeatures()
    }

    // Week label
    const ws = new Date(weekStart + 'T00:00:00')
    const we = new Date(ws)
    we.setDate(we.getDate() + 6)
    const monthLabel = ws.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const isCurrentWeek = weekStart === getWeekStart()
    const now = new Date()
    const todayDow = now.getDay()
    const todayIdx = todayDow === 0 ? 6 : todayDow - 1

    return (
        <section className="office-v2-widget" style={{ padding: 0, paddingBottom: 0, display: 'flex', flexDirection: 'column' }}>
            {/* V2 Calendar Header */}
            <div className="office-v2-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 className="office-v2-panel-title">Lunch & Dinner Features</h2>
                    {!isCurrentWeek && (
                        <button onClick={() => setWeekStart(getWeekStart())} style={{ background: 'rgba(230,107,53,0.1)', color: '#e66b35', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>TODAY</button>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', color: '#9ca3af' }}>
                    <button onClick={() => shiftWeek(-1)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><i className="fa-solid fa-chevron-left" style={{ fontSize: '0.75rem' }}></i></button>
                    <span style={{ margin: '0 0.5rem', fontSize: '0.875rem' }}>{monthLabel}</span>
                    <button onClick={() => shiftWeek(1)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><i className="fa-solid fa-chevron-right" style={{ fontSize: '0.75rem' }}></i></button>
                </div>
            </div>

            {/* V2 Calendar Days Header Line */}
            <div className="office-v2-calendar-grid">
                {DAYS.map((dayName, dayIdx) => {
                    const isToday = isCurrentWeek && dayIdx === todayIdx
                    const dateNum = getDayDate(weekStart, dayIdx)
                    return (
                        <div key={`header-${dayIdx}`} className={`office-v2-cal-header-cell ${isToday ? 'active' : ''}`}>
                            {dayName} {dateNum}
                        </div>
                    )
                })}
            </div>

            {/* V2 Calendar Content Grid */}
            <div className="office-v2-calendar-grid" style={{ minHeight: '120px' }}>
                {DAYS.map((dayName, dayIdx) => {
                    const isToday = isCurrentWeek && dayIdx === todayIdx
                    const lunchKey = `${dayIdx}-lunch`
                    const dinnerKey = `${dayIdx}-dinner`
                    const lunch = features[lunchKey]
                    const dinner = features[dinnerKey]

                    const handleCellClick = (mealKey, content) => {
                        setEditing(mealKey)
                        setEditValue(content || '')
                    }

                    return (
                        <div key={`cell-${dayIdx}`} className={`office-v2-cal-cell ${isToday ? 'active' : ''}`}>

                            {/* Lunch */}
                            <div className="office-v2-cal-item">
                                <span className="office-v2-cal-item-label">Lunch: </span>
                                {editing === lunchKey ? (
                                    <textarea
                                        autoFocus
                                        title="Lunch Feature"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                e.target.blur()
                                            } else if (e.key === 'Escape') {
                                                setEditing(null)
                                            }
                                        }}
                                        onBlur={() => saveEdit(dayIdx, 'lunch')}
                                        disabled={saving}
                                        placeholder="Add lunch..."
                                        style={{ width: '100%', background: 'transparent', color: '#fff', border: 'none', outline: 'none', resize: 'none', fontSize: '0.75rem', marginTop: '0.25rem', padding: 0 }}
                                        rows={3}
                                    />
                                ) : (
                                    <span
                                        onClick={() => handleCellClick(lunchKey, lunch?.content)}
                                        style={{ color: '#d1d5db', cursor: 'pointer', whiteSpace: 'pre-wrap', display: 'block', minHeight: '1.5rem', opacity: lunch?.content ? 1 : 0.5 }}
                                    >
                                        {lunch?.content || '+ Add'}
                                    </span>
                                )}
                            </div>

                            {/* Dinner */}
                            <div className="office-v2-cal-item">
                                <span className="office-v2-cal-item-label">Dinner: </span>
                                {editing === dinnerKey ? (
                                    <textarea
                                        autoFocus
                                        title="Dinner Feature"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                e.target.blur()
                                            } else if (e.key === 'Escape') {
                                                setEditing(null)
                                            }
                                        }}
                                        onBlur={() => saveEdit(dayIdx, 'dinner')}
                                        disabled={saving}
                                        placeholder="Add dinner..."
                                        style={{ width: '100%', background: 'transparent', color: '#fff', border: 'none', outline: 'none', resize: 'none', fontSize: '0.75rem', marginTop: '0.25rem', padding: 0 }}
                                        rows={3}
                                    />
                                ) : (
                                    <span
                                        onClick={() => handleCellClick(dinnerKey, dinner?.content)}
                                        style={{ color: '#d1d5db', cursor: 'pointer', whiteSpace: 'pre-wrap', display: 'block', minHeight: '1.5rem', opacity: dinner?.content ? 1 : 0.5 }}
                                    >
                                        {dinner?.content || '+ Add'}
                                    </span>
                                )}
                            </div>

                        </div>
                    )
                })}
            </div>
        </section>
    )
}
