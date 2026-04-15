import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import SalesTrendChart from '../components/SalesTrendChart.jsx'

export default function SalesReports() {
    const [dates, setDates] = useState([])
    const [loading, setLoading] = useState(true)
    const location = useLocation()
    
    // Build the correct base path depending on dashboard context
    const getBasePath = () => {
        if (location.pathname.startsWith('/office')) return '/office/sales'
        return '/kitchen/sales'
    }
    const basePath = getBasePath()

    useEffect(() => {
        async function fetchDates() {
            try {
                // Fetch distinct dates (we can just fetch all and deduplicate, or use a specific RPC if we had one)
                // For simplicity, fetch report_date from all items, order by it, and deduplicate in JS.
                const { data, error } = await supabase
                    .from('sales_data')
                    .select('report_date')
                    .order('report_date', { ascending: false })

                if (error) throw error
                
                // Deduplicate dates
                const uniqueDates = [...new Set(data.map(item => item.report_date))]
                setDates(uniqueDates)
            } catch (err) {
                console.error("Error fetching sales dates:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchDates()
    }, [])

    return (
        <div className="card">
            <div className="card-header-row mb-6">
                <h1 className="page-title"><i className="fa-solid fa-file-invoice-dollar" style={{ color: 'var(--orange)' }} /> Sales Reports</h1>
                <Link to={basePath.replace('/sales', '')} className="btn btn-secondary">
                    <i className="fa-solid fa-arrow-left" /> Back to Dashboard
                </Link>
            </div>

            <SalesTrendChart />

            {loading ? (
                <div className="shimmer" style={{ height: '200px', borderRadius: 'var(--radius-md)' }}></div>
            ) : dates.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-folder-open" style={{ fontSize: '3rem', marginBottom: 'var(--space-4)', opacity: 0.5 }}></i>
                    <p>No sales reports found.</p>
                </div>
            ) : (
                <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                    {dates.map((date) => {
                        const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })
                        return (
                            <Link key={date} to={`${basePath}/${date}`} className="dash-card" style={{ textDecoration: 'none', transition: 'var(--transition-fast)' }}
                                  onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--orange)'}
                                  onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(249, 115, 22, 0.1)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                        <i className="fa-solid fa-calendar-day" />
                                    </div>
                                    <div>
                                        <div style={{ color: 'var(--text-bright)', fontWeight: '600', fontSize: 'var(--font-size-base)' }}>{formattedDate}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>View Top Sellers</div>
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
