import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const CATEGORY_COLORS = [
    '#f97316', // orange
    '#3b82f6', // blue
    '#06b6d4', // cyan
    '#a78bfa', // purple
    '#f43f5e', // rose
    '#10b981', // emerald
    '#eab308', // yellow
    '#ec4899', // pink
]

export default function SalesReportDetail() {
    const { date } = useParams()
    const location = useLocation()
    const [salesItems, setSalesItems] = useState([])
    const [loading, setLoading] = useState(true)

    // Build the correct back-link path depending on dashboard context
    const getBasePath = () => {
        if (location.pathname.startsWith('/office')) return '/office/sales'
        return '/kitchen/sales'
    }
    const basePath = getBasePath()

    useEffect(() => {
        async function fetchSalesData() {
            try {
                const { data, error } = await supabase
                    .from('sales_data')
                    .select('*')
                    .eq('report_date', date)
                    .order('units_sold', { ascending: false })

                if (error) throw error
                setSalesItems(data || [])
            } catch (err) {
                console.error("Error fetching detailed sales data:", err)
            } finally {
                setLoading(false)
            }
        }

        if (date) fetchSalesData()
    }, [date])

    if (loading) {
        return (
            <div className="card">
                <div className="shimmer" style={{ height: '300px', borderRadius: 'var(--radius-md)' }}></div>
            </div>
        )
    }

    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    })

    // Filter out fries
    const filteredItems = salesItems.filter(item => {
        const name = item.item_name.toLowerCase();
        return name !== 'house cut fries' && name !== 'sweet potato fries';
    })

    // Top sellers — take up to 10
    const topSellers = filteredItems.slice(0, 10)
    const maxUnits = topSellers[0]?.units_sold || 1

    // Category aggregation
    const catMap = {}
    let totalUnits = 0
    salesItems.forEach(item => {
        const cat = item.category || 'Other'
        if (!catMap[cat]) catMap[cat] = { units: 0, items: 0 }
        catMap[cat].units += item.units_sold
        catMap[cat].items += 1
        totalUnits += item.units_sold
    })

    const categories = Object.entries(catMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.units - a.units)

    const catColorMap = {}
    categories.forEach((cat, idx) => {
        catColorMap[cat.name] = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
    })

    return (
        <div className="card">
            <div className="card-header-row mb-6">
                <div>
                    <h1 className="page-title"><i className="fa-solid fa-fire-flame-curved" style={{ color: 'var(--orange)' }} /> {formattedDate}</h1>
                    <div style={{ color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>Prep Focus: Top Sellers</div>
                </div>
                <Link to={basePath} className="btn btn-secondary">
                    <i className="fa-solid fa-arrow-left" /> Back to Dates
                </Link>
            </div>

            {salesItems.length === 0 ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>No data found for this date.</div>
            ) : (
                <div className="sr-panels">
                    {/* Left: Top Selling Items */}
                    <div className="sr-panel">
                        <h2 className="sr-panel-title">
                            <i className="fa-solid fa-chart-simple" style={{ color: 'var(--orange)' }} />
                            Top Selling Items (Volume)
                        </h2>
                        <div className="sr-top-list">
                            {topSellers.map((item, idx) => (
                                <div key={item.id} className="sr-top-item">
                                    <div className="sr-top-row">
                                        <span className="sr-item-name">{item.item_name}</span>
                                        <span className="sr-item-orders">{item.units_sold} ORDERS</span>
                                    </div>
                                    <div className="sr-bar-track">
                                        <div
                                            className="sr-bar-fill"
                                            style={{
                                                width: `${(item.units_sold / maxUnits) * 100}%`,
                                                background: catColorMap[item.category || 'Other'] || 'var(--orange)',
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Sales by Category */}
                    <div className="sr-panel">
                        <h2 className="sr-panel-title">
                            <i className="fa-solid fa-pie-chart" style={{ color: 'var(--orange)' }} />
                            Sales by Category
                        </h2>
                        <div className="sr-cat-list">
                            {categories.map((cat, idx) => {
                                const pct = totalUnits > 0 ? Math.round((cat.units / totalUnits) * 100) : 0
                                return (
                                    <div key={cat.name} className="sr-cat-row">
                                        <div className="sr-cat-dot" style={{ background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} />
                                        <div className="sr-cat-info">
                                            <span className="sr-cat-name">{cat.name}</span>
                                            <span className="sr-cat-pct">{pct}% of volume</span>
                                        </div>
                                        <span className="sr-cat-units">{cat.units} sold</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
