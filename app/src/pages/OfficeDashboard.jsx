import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import WeatherWidget from '../components/WeatherWidget.jsx'
import SalesTrendChart from '../components/SalesTrendChart.jsx'
import WeeklyFeatures from '../components/WeeklyFeatures.jsx'
import ManagementWhiteboard from '../components/ManagementWhiteboard.jsx'

export default function OfficeDashboard() {
    const [stats, setStats] = useState({ workbooks: 0, briefings: 0, tasks: 0, events: 0 })

    useEffect(() => {
        // Fetch counts for each dashboard tile
        async function load() {
            const [wbRes, brRes, taskRes, beoRes] = await Promise.all([
                supabase.from('workbooks').select('id', { count: 'exact', head: true }),
                supabase.from('briefings').select('id', { count: 'exact', head: true }),
                supabase.from('briefing_tasks').select('id', { count: 'exact', head: true }),
                supabase.from('banquet_event_orders').select('id', { count: 'exact', head: true }),
            ])
            setStats({
                workbooks: wbRes.count || 0,
                briefings: brRes.count || 0,
                tasks: taskRes.count || 0,
                events: beoRes.count || 0,
            })
        }
        load()
    }, [])

    // Lock the office and return to landing page
    function handleLogout() {
        sessionStorage.removeItem('officeUnlocked')
        window.location.href = '/'
    }

    return (
        <div className="office-v2-content">
            
            {/* Top Stats Widgets */}
            <section className="office-v2-stats-grid">
                
                {/* Weather Widget — compact 3-day inline card */}
                <div className="office-v2-widget">
                    <WeatherWidget compact={true} />
                </div>

                <Link to="/office/events" className="office-v2-widget office-v2-stat-card" style={{ textDecoration: 'none' }}>
                    <div>
                        <div className="office-v2-stat-value">{stats.events}</div>
                        <div className="office-v2-stat-label">Events & Catering</div>
                    </div>
                    <i className="fa-solid fa-bread-slice office-v2-stat-icon"></i>
                </Link>

                <Link to="/office/briefings" className="office-v2-widget office-v2-stat-card" style={{ textDecoration: 'none' }}>
                    <div>
                        <div className="office-v2-stat-value">{stats.briefings}</div>
                        <div className="office-v2-stat-label">Briefings</div>
                    </div>
                    <i className="fa-regular fa-clipboard office-v2-stat-icon"></i>
                </Link>

                <Link to="/office/workbooks" className="office-v2-widget office-v2-stat-card" style={{ textDecoration: 'none' }}>
                    <div>
                        <div className="office-v2-stat-value">{stats.workbooks}</div>
                        <div className="office-v2-stat-label">Recipes</div>
                    </div>
                    <i className="fa-solid fa-book-open office-v2-stat-icon"></i>
                </Link>

                <Link to="/office/history" className="office-v2-widget office-v2-stat-card" style={{ textDecoration: 'none' }}>
                    <div>
                        <div className="office-v2-stat-value">{stats.tasks}</div>
                        <div className="office-v2-stat-label">Task History</div>
                    </div>
                    <i className="fa-regular fa-calendar-check office-v2-stat-icon"></i>
                </Link>
            </section>

            {/* Calendar Section (WeeklyFeatures natively renders the V2 block now) */}
            <WeeklyFeatures />

            {/* Bottom Grid Layout */}
            <div className="office-v2-bottom-grid">
                
                {/* Chat/Communication — full whiteboard with posting capability */}
                <section className="office-v2-widget office-v2-chat-section" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                    <div className="office-v2-panel-header">
                        <h2 className="office-v2-panel-title">Department Communication</h2>
                        <Link to="/office/chat" style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', textDecoration: 'none', fontSize: '0.75rem' }}>
                            <i className="fa-solid fa-expand" style={{ marginRight: '0.35rem' }} />Full View
                        </Link>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <ManagementWhiteboard hideHeader={true} />
                    </div>
                </section>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Sales Reports Chart */}
                    <Link to="/office/sales" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <SalesTrendChart />
                    </Link>
                </div>
            </div>
        </div>
    )
}
