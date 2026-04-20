import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const CATEGORY_COLORS = [
    '#f97316', '#3b82f6', '#10b981', '#a78bfa', '#f43f5e',
    '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#8b5cf6',
    '#ef4444', '#22c55e', '#f59e0b', '#6366f1', '#d946ef',
]

const METRIC_OPTIONS = [
    { key: 'units_sold', label: 'Units Sold', format: v => v.toLocaleString() },
    { key: 'total_net_sales', label: 'Sales ($)', format: v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
    { key: 'net_sales', label: 'Net Sales ($)', format: v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
]

function getWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    return monday.toISOString().split('T')[0]
}

function getWeekLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getMonthKey(dateStr) {
    return dateStr.substring(0, 7)
}

function getMonthLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function getDailyLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const DATE_RANGES = [
    { key: '7d', label: '7D', days: 7 },
    { key: '14d', label: '14D', days: 14 },
    { key: '30d', label: '30D', days: 30 },
    { key: 'all', label: 'All', days: null },
]

// SalesTrendChart — office-only. orgId scopes every sales_data query so
// the chart never renders another org's revenue even if RLS is missing.
export default function SalesTrendChart({ orgId }) {
    const [rawData, setRawData] = useState([])
    const [loading, setLoading] = useState(true)
    const [mode, setMode] = useState('daily')
    const [metric, setMetric] = useState('units_sold')
    const [dateRange, setDateRange] = useState('30d')
    const [drillDownCategory, setDrillDownCategory] = useState(null)
    const [categories, setCategories] = useState([])
    const [activeCategories, setActiveCategories] = useState([])
    const [tooltip, setTooltip] = useState(null)
    const svgRef = useRef(null)

    useEffect(() => {
        if (!orgId) {
            setRawData([])
            setLoading(false)
            return
        }
        async function fetchData() {
            setLoading(true)
            try {
                let query = supabase
                    .from('sales_data')
                    .select('report_date, category, item_name, units_sold, total_net_sales, net_sales')
                    .eq('org_id', orgId)
                    .not('category', 'is', null)
                    .order('report_date', { ascending: true })

                if (dateRange !== 'all') {
                    const range = DATE_RANGES.find(r => r.key === dateRange)
                    if (range && range.days) {
                        const d = new Date()
                        d.setDate(d.getDate() - range.days)
                        const dateStr = d.toISOString().split('T')[0]
                        query = query.gte('report_date', dateStr)
                    }
                }

                const { data, error } = await query

                if (error) throw error

                setRawData(data || [])
            } catch (err) {
                console.error('Error fetching sales trend data:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [dateRange, orgId])

    useEffect(() => {
        const catTotals = {}
        ;(rawData || []).forEach(row => {
            if (drillDownCategory && row.category !== drillDownCategory) return
            const cat = drillDownCategory ? (row.item_name || 'Unknown Item') : (row.category || 'Other')
            catTotals[cat] = (catTotals[cat] || 0) + (Number(row.units_sold) || 0)
        })
        const sortedCats = Object.entries(catTotals)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name)

        setCategories(sortedCats)
        setActiveCategories(sortedCats.slice(0, 5))
    }, [rawData, drillDownCategory])

    const toggleCategory = (cat) => {
        setActiveCategories(prev => {
            if (prev.includes(cat)) {
                if (prev.length === 1) return prev
                return prev.filter(c => c !== cat)
            }
            return [...prev, cat]
        })
    }

    const selectAllCategories = () => setActiveCategories([...categories])
    const selectTopCategories = () => setActiveCategories(categories.slice(0, 5))

    const currentMetric = METRIC_OPTIONS.find(m => m.key === metric) || METRIC_OPTIONS[0]

    // Build chart data: group by date-bucket, then by category
    const chartData = (() => {
        if (rawData.length === 0) return { buckets: [], catData: {} }

        const bucketMap = {} // bucketKey -> { label, cats: { catName: value } }

        rawData.forEach(row => {
            if (drillDownCategory && row.category !== drillDownCategory) return

            const cat = drillDownCategory ? (row.item_name || 'Unknown Item') : (row.category || 'Other')
            if (!activeCategories.includes(cat)) return

            let key, label
            if (mode === 'daily') {
                key = row.report_date
                label = getDailyLabel(row.report_date)
            } else if (mode === 'weekly') {
                key = getWeekKey(row.report_date)
                label = getWeekLabel(row.report_date)
            } else {
                key = getMonthKey(row.report_date)
                label = getMonthLabel(row.report_date)
            }

            if (!bucketMap[key]) bucketMap[key] = { key, label, cats: {} }
            if (!bucketMap[key].cats[cat]) bucketMap[key].cats[cat] = 0
            bucketMap[key].cats[cat] += Number(row[metric]) || 0
        })

        const buckets = Object.values(bucketMap).sort((a, b) => a.key.localeCompare(b.key))
        return { buckets }
    })()

    const { buckets } = chartData

    // SVG dimensions
    const W = 800, H = 340
    const PAD = { top: 24, right: 24, bottom: 55, left: 60 }
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom

    // Find global max across all active categories
    let globalMax = 1
    buckets.forEach(b => {
        activeCategories.forEach(cat => {
            const val = b.cats[cat] || 0
            if (val > globalMax) globalMax = val
        })
    })
    globalMax *= 1.1

    const getX = (i) => PAD.left + (buckets.length > 1 ? (i / (buckets.length - 1)) * plotW : plotW / 2)
    const getY = (val) => PAD.top + plotH - (val / globalMax) * plotH

    // Y axis ticks
    const yTicks = []
    const tickCount = 5
    for (let i = 0; i <= tickCount; i++) {
        yTicks.push((globalMax / tickCount) * i)
    }

    // Build line paths per category
    const catColorMap = {}
    categories.forEach((cat, i) => { catColorMap[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length] })

    const lines = activeCategories.map(cat => {
        const points = buckets.map((b, i) => ({
            x: getX(i),
            y: getY(b.cats[cat] || 0),
            val: b.cats[cat] || 0,
        }))
        const path = points.length > 0 ? `M${points.map(p => `${p.x},${p.y}`).join(' L')}` : ''
        return { cat, color: catColorMap[cat], points, path }
    })

    const handleMouseMove = (e) => {
        if (buckets.length === 0) return
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const scaleX = W / rect.width
        const mouseX = (e.clientX - rect.left) * scaleX

        let closestIdx = 0
        let closestDist = Infinity
        buckets.forEach((_, i) => {
            const dist = Math.abs(getX(i) - mouseX)
            if (dist < closestDist) {
                closestDist = dist
                closestIdx = i
            }
        })

        if (closestDist < 50) {
            setTooltip({ idx: closestIdx, x: getX(closestIdx), bucket: buckets[closestIdx] })
        } else {
            setTooltip(null)
        }
    }

    if (loading) {
        return (
            <div className="trend-chart-card">
                <div className="shimmer" style={{ height: '400px', borderRadius: 'var(--radius-md)' }} />
            </div>
        )
    }

    if (buckets.length === 0) {
        return (
            <div className="trend-chart-card">
                <div className="trend-chart-header">
                    <h2 className="trend-chart-title">
                        <i className="fa-solid fa-chart-line" style={{ color: 'var(--orange)' }} /> Sales Trends
                    </h2>
                </div>
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No sales data available for charting.
                </div>
            </div>
        )
    }

    return (
        <div className="trend-chart-card">
            {/* Header: title + mode toggle */}
            <div className="trend-chart-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    {drillDownCategory && (
                        <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                            onClick={() => setDrillDownCategory(null)}
                        >
                            <i className="fa-solid fa-arrow-left" /> Back
                        </button>
                    )}
                    <h2 className="trend-chart-title">
                        <i className="fa-solid fa-chart-line" style={{ color: 'var(--orange)' }} /> 
                        {drillDownCategory ? `Sales Trends: ${drillDownCategory}` : 'Sales Trends by Category'}
                    </h2>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Time Frame Selector */}
                    <div className="trend-mode-toggle">
                        {DATE_RANGES.map(r => (
                            <button
                                key={r.key}
                                className={`trend-mode-btn ${dateRange === r.key ? 'active' : ''}`}
                                onClick={() => setDateRange(r.key)}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    {/* Metric Selector */}
                    <div className="trend-mode-toggle">
                        {METRIC_OPTIONS.map(m => (
                            <button
                                key={m.key}
                                className={`trend-mode-btn ${metric === m.key ? 'active' : ''}`}
                                onClick={() => setMetric(m.key)}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    {/* Period Toggle */}
                    <div className="trend-mode-toggle">
                        {['daily', 'weekly', 'monthly'].map(m => (
                            <button
                                key={m}
                                className={`trend-mode-btn ${mode === m ? 'active' : ''}`}
                                onClick={() => setMode(m)}
                            >
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Category Legend Toggles */}
            <div className="trend-legend">
                <button className="trend-legend-action" onClick={selectTopCategories}>Top 5</button>
                <button className="trend-legend-action" onClick={selectAllCategories}>All</button>
                <span className="trend-legend-divider" />
                {categories.map(cat => (
                    <button
                        key={cat}
                        className={`trend-legend-btn ${activeCategories.includes(cat) ? 'active' : ''}`}
                        style={{ '--legend-color': catColorMap[cat] }}
                        onClick={() => toggleCategory(cat)}
                    >
                        <span className="trend-legend-dot" style={{ background: activeCategories.includes(cat) ? catColorMap[cat] : '#555' }} />
                        {cat}
                    </button>
                ))}
            </div>

            {/* SVG Chart */}
            <div className="trend-chart-container">
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    className="trend-svg"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setTooltip(null)}
                >
                    {/* Grid lines */}
                    {yTicks.map((val, i) => (
                        <g key={i}>
                            <line
                                x1={PAD.left} y1={getY(val)}
                                x2={W - PAD.right} y2={getY(val)}
                                stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                            />
                            <text
                                x={PAD.left - 8} y={getY(val) + 4}
                                fill="#9ca3af" fontSize="10" textAnchor="end"
                            >
                                {metric === 'units_sold' ? Math.round(val) : `$${Math.round(val)}`}
                            </text>
                        </g>
                    ))}

                    {/* X axis labels */}
                    {buckets.map((d, i) => {
                        const step = Math.max(1, Math.floor(buckets.length / 12))
                        if (i % step !== 0 && i !== buckets.length - 1) return null
                        return (
                            <text
                                key={i}
                                x={getX(i)} y={H - 8}
                                fill="#9ca3af" fontSize="10" textAnchor="middle"
                                transform={`rotate(-25, ${getX(i)}, ${H - 8})`}
                            >
                                {d.label}
                            </text>
                        )
                    })}

                    {/* Area fills + Lines per category */}
                    {lines.map(line => (
                        <g key={line.cat}>
                            <defs>
                                <linearGradient id={`grad-cat-${line.cat.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={line.color} stopOpacity="0.15" />
                                    <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {buckets.length > 1 && (
                                <path
                                    d={`${line.path} L${getX(buckets.length - 1)},${PAD.top + plotH} L${getX(0)},${PAD.top + plotH} Z`}
                                    fill={`url(#grad-cat-${line.cat.replace(/\s+/g, '-')})`}
                                />
                            )}
                            <path
                                d={line.path}
                                fill="none"
                                stroke={line.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </g>
                    ))}

                    {/* Tooltip crosshair & dots */}
                    {tooltip && (
                        <g>
                            <line
                                x1={tooltip.x} y1={PAD.top}
                                x2={tooltip.x} y2={PAD.top + plotH}
                                stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,4"
                            />
                            {lines.map(line => {
                                const pt = line.points[tooltip.idx]
                                if (!pt || pt.val === 0) return null
                                return (
                                    <circle
                                        key={line.cat}
                                        cx={pt.x} cy={pt.y} r="4"
                                        fill={line.color} stroke="#1a1a2e" strokeWidth="2"
                                    />
                                )
                            })}
                        </g>
                    )}
                </svg>

                {/* HTML Tooltip */}
                {tooltip && (
                    <div
                        className="trend-tooltip"
                        style={{
                            left: `${(tooltip.x / W) * 100}%`,
                            top: '16px',
                        }}
                    >
                        <div className="trend-tooltip-date">{tooltip.bucket.label}</div>
                        {lines
                            .filter(l => (l.points[tooltip.idx]?.val || 0) > 0)
                            .sort((a, b) => (b.points[tooltip.idx]?.val || 0) - (a.points[tooltip.idx]?.val || 0))
                            .map(line => (
                                <div key={line.cat} className="trend-tooltip-row">
                                    <span className="trend-tooltip-dot" style={{ background: line.color }} />
                                    <span className="trend-tooltip-label">{line.cat}:</span>
                                    <span className="trend-tooltip-val">{currentMetric.format(line.points[tooltip.idx].val)}</span>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>

            {/* Summary Cards for active categories */}
            <div className="trend-summary-row">
                {lines.sort((a, b) => {
                    const totalA = a.points.reduce((s, p) => s + p.val, 0)
                    const totalB = b.points.reduce((s, p) => s + p.val, 0)
                    return totalB - totalA
                }).slice(0, 6).map(line => {
                    const total = line.points.reduce((s, p) => s + p.val, 0)
                    const avg = buckets.length > 0 ? total / buckets.length : 0
                    return (
                        <div 
                            key={line.cat} 
                            className="trend-summary-card" 
                            style={{ 
                                '--summary-color': line.color, 
                                cursor: drillDownCategory ? 'default' : 'pointer',
                                transition: 'transform 0.1s'
                            }}
                            onClick={() => { if (!drillDownCategory) setDrillDownCategory(line.cat) }}
                            onMouseOver={(e) => { if (!drillDownCategory) e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
                        >
                            <div className="trend-summary-label">{line.cat}</div>
                            <div className="trend-summary-total">{currentMetric.format(total)}</div>
                            <div className="trend-summary-avg">avg {currentMetric.format(Math.round(avg))} / {mode === 'monthly' ? 'mo' : mode === 'weekly' ? 'wk' : 'day'}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
