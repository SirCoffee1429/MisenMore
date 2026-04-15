import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useCategories } from '../lib/useCategories.js'

export default function WorkbookViewer() {
    const { id } = useParams()
    const location = useLocation()
    const backLink = location.pathname.startsWith('/kitchen') ? '/kitchen/recipes' : '/office/workbooks'

    const [workbook, setWorkbook] = useState(null)
    const [sheets, setSheets] = useState([])
    const [activeSheet, setActiveSheet] = useState(0)
    const [filter, setFilter] = useState('')
    const [loading, setLoading] = useState(true)
    const [updatingCategory, setUpdatingCategory] = useState(false)

    const { categories } = useCategories()

    useEffect(() => {
        async function load() {
            const [wbRes, shRes] = await Promise.all([
                supabase.from('workbooks').select('*').eq('id', id).single(),
                supabase.from('workbook_sheets').select('*').eq('workbook_id', id).order('sheet_index'),
            ])
            setWorkbook(wbRes.data)
            setSheets(shRes.data || [])
            setLoading(false)
        }
        load()
    }, [id])

    async function handleCategoryChange(e) {
        const newCategory = e.target.value
        setUpdatingCategory(true)

        const { error } = await supabase
            .from('workbooks')
            .update({ category: newCategory })
            .eq('id', id)

        if (!error) {
            setWorkbook(prev => ({ ...prev, category: newCategory }))
        } else {
            alert('Error updating category: ' + error.message)
        }
        setUpdatingCategory(false)
    }

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
        )
    }

    if (!workbook) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">❌</div>
                <div className="empty-state-text">Workbook not found</div>
                <Link to={backLink} className="btn btn-secondary" style={{ marginTop: 'var(--space-4)' }}>← Back</Link>
            </div>
        )
    }

    const currentSheet = sheets[activeSheet]
    const headers = currentSheet?.headers || []
    const rows = currentSheet?.rows || []

    const filteredRows = filter
        ? rows.filter(row =>
            row.some(cell => String(cell ?? '').toLowerCase().includes(filter.toLowerCase()))
        )
        : rows

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <Link to={backLink} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>← Back to Recipes</Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                        <h1 className="page-title" style={{ margin: 0 }}>{workbook.file_name}</h1>
                        <select
                            value={workbook.category || 'Uncategorized'}
                            onChange={handleCategoryChange}
                            disabled={updatingCategory}
                            className="category-select"
                        >
                            <option value="Uncategorized">Uncategorized</option>
                            {categories.map(c => (
                                c.name !== 'Uncategorized' && <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                        {updatingCategory && <span className="spinner" style={{ width: 14, height: 14 }} />}
                    </div>
                    <p className="page-subtitle">{sheets.length} sheet{sheets.length !== 1 ? 's' : ''} · {rows.length} rows</p>
                </div>
            </div>

            {sheets.length > 1 && (
                <div className="sheet-tabs">
                    {sheets.map((sheet, i) => (
                        <button
                            key={sheet.id}
                            className={`sheet-tab ${i === activeSheet ? 'active' : ''}`}
                            onClick={() => { setActiveSheet(i); setFilter('') }}
                        >
                            {sheet.sheet_name}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ marginBottom: 'var(--space-4)' }}>
                <input
                    className="input"
                    placeholder="🔍 Filter rows..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{ maxWidth: 400 }}
                />
            </div>

            {currentSheet ? (
                <div className="data-table-wrapper" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 50 }}>#</th>
                                {headers.map((h, i) => (
                                    <th key={i}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row, ri) => (
                                <tr key={ri}>
                                    <td style={{ color: 'var(--text-muted)' }}>{ri + 1}</td>
                                    {headers.map((_, ci) => (
                                        <td key={ci}>{row[ci] ?? ''}</td>
                                    ))}
                                </tr>
                            ))}
                            {filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan={headers.length + 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
                                        {filter ? 'No matching rows' : 'This sheet is empty'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="empty-state">
                    <div className="empty-state-text">No sheet data available</div>
                </div>
            )}
        </div>
    )
}
