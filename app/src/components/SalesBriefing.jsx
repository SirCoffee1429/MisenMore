import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function SalesBriefing() {
    const location = useLocation()
    const [latestDate, setLatestDate] = useState('')
    const [itemCount, setItemCount] = useState(0)

    // Build link path based on current dashboard context
    const getLinkPath = () => {
        if (location.pathname.startsWith('/office')) return '/office/sales'
        return '/kitchen/sales'
    }
    const linkPath = getLinkPath()

    useEffect(() => {
        async function fetchLatestSalesSummary() {
            try {
                // Get the latest report date and how many items were in it
                const { data: latestDateData } = await supabase
                    .from('sales_data')
                    .select('report_date')
                    .order('report_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (latestDateData) {
                    const date = latestDateData.report_date
                    setLatestDate(date)

                    // Get a count just for context on the card
                    const { count } = await supabase
                        .from('sales_data')
                        .select('id', { count: 'exact', head: true })
                        .eq('report_date', date)

                    setItemCount(count || 0)
                }
            } catch (err) {
                console.error("Error fetching latest sales summary:", err)
            }
        }
        fetchLatestSalesSummary()
    }, [])

    if (!latestDate) return null // Hide if no data exists at all yet

    const formattedDate = new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
    })

    return (
        <Link to={linkPath} className="dash-card sales-briefing-card" style={{ textDecoration: 'none', transition: 'var(--transition-fast)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--orange)'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'rgba(249, 115, 22, 0.1)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
                    <i className="fa-solid fa-chart-line" />
                </div>
                
                <div style={{ flex: 1 }}>
                    <h2 className="dash-card-heading" style={{ margin: 0 }}>Sales Reports</h2>
                    <div style={{ color: 'var(--text-bright)', fontSize: 'var(--font-size-lg)', fontWeight: '600', marginTop: 'var(--space-1)' }}>
                        Previous Night's Sales
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
                        {formattedDate} • {itemCount} Items Logged
                    </div>
                </div>

                <div style={{ color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-chevron-right" />
                </div>
            </div>
            
        </Link>
    )
}
