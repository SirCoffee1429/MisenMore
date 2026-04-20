import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

// SalesBriefing — office-only summary card showing the most recent sales
// report date and item count. CLAUDE.md forbids kitchen from seeing any
// sales/revenue data, so this component MUST only be rendered from the
// office dashboard. orgId comes from the authenticated user's JWT claim.
export default function SalesBriefing({ orgId, orgSlug }) {
    const [latestDate, setLatestDate] = useState('')
    const [itemCount, setItemCount] = useState(0)

    useEffect(() => {
        if (!orgId) {
            setLatestDate('')
            setItemCount(0)
            return
        }
        async function fetchLatestSalesSummary() {
            try {
                // Latest report_date for this org
                const { data: latestDateData } = await supabase
                    .from('sales_data')
                    .select('report_date')
                    .eq('org_id', orgId)
                    .order('report_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (latestDateData) {
                    const date = latestDateData.report_date
                    setLatestDate(date)

                    // How many items were in that report (for context on the card)
                    const { count } = await supabase
                        .from('sales_data')
                        .select('id', { count: 'exact', head: true })
                        .eq('org_id', orgId)
                        .eq('report_date', date)

                    setItemCount(count || 0)
                }
            } catch (err) {
                console.error("Error fetching latest sales summary:", err)
            }
        }
        fetchLatestSalesSummary()
    }, [orgId])

    if (!latestDate) return null // Hide if no data exists at all yet

    const formattedDate = new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    })

    // Office-only route — always link into /o/:orgSlug/sales
    const linkPath = orgSlug ? `/o/${orgSlug}/sales` : '#'

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
