import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useCategories } from '../lib/useCategories.js'
import { useCurrentOrg } from '../lib/useCurrentOrg.js'
import { withOrg } from '../lib/org/withOrg.js'

const EMPTY_ROW = { ingredient: '', quantity: '', measure: '', unitCost: '', totalCost: '' }

// RecipeCreator — in-app form-based recipe builder mounted under both
// kitchen and office route trees. source resolves backlink + destination.
// Every insert (workbooks, workbook_sheets, workbook_chunks) is stamped
// with org_id via withOrg, and the embed-chunks call forwards org_id too.
export default function RecipeCreator() {
    const navigate = useNavigate()
    const { orgId, orgSlug, source } = useCurrentOrg()
    const isOffice = source === 'auth'
    const backLink = isOffice
        ? `/o/${orgSlug}/workbooks`
        : `/k/${orgSlug}/recipes`

    const { categories } = useCategories(orgId)

    const [recipeName, setRecipeName] = useState('')
    const [selectedCategories, setSelectedCategories] = useState([])
    const [rows, setRows] = useState([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }])
    const [assembly, setAssembly] = useState('')
    const [saving, setSaving] = useState(false)

    function updateRow(index, field, value) {
        setRows(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: value }

            // Auto-calculate total cost
            if (field === 'quantity' || field === 'unitCost') {
                const qty = parseFloat(updated[index].quantity) || 0
                const unit = parseFloat(updated[index].unitCost) || 0
                updated[index].totalCost = qty && unit ? (qty * unit).toFixed(2) : ''
            }

            return updated
        })
    }

    function addRow() {
        setRows(prev => [...prev, { ...EMPTY_ROW }])
    }

    function removeRow(index) {
        if (rows.length <= 1) return
        setRows(prev => prev.filter((_, i) => i !== index))
    }

    function toggleCategory(name) {
        setSelectedCategories(prev => {
            if (prev.includes(name)) {
                return prev.filter(c => c !== name)
            }
            return [...prev, name]
        })
    }

    async function handleSave() {
        if (!recipeName.trim()) {
            alert('Please enter a recipe name.')
            return
        }
        if (!orgId) {
            alert('No active organization.')
            return
        }

        const filledRows = rows.filter(r => r.ingredient.trim())
        if (filledRows.length === 0) {
            alert('Please add at least one ingredient.')
            return
        }

        setSaving(true)

        try {
            const cats = selectedCategories.length > 0 ? selectedCategories : ['Uncategorized']

            // Insert workbook record — stamped with org_id via withOrg
            const { data: wbData, error: wbError } = await supabase
                .from('workbooks')
                .insert(withOrg(orgId, {
                    file_name: recipeName.trim(),
                    file_url: null,
                    file_size: 0,
                    sheet_count: 1,
                    status: 'parsed',
                    category: cats
                }))
                .select()
                .single()

            if (wbError) throw wbError

            // Build combined rows: ingredients + optional assembly section
            const sheetHeaders = ['Ingredient', 'Quantity', 'Measure', 'Unit Cost', 'Total Cost']
            const ingredientRows = filledRows.map(r => [
                r.ingredient,
                r.quantity,
                r.measure,
                r.unitCost ? `$${r.unitCost}` : '',
                r.totalCost ? `$${r.totalCost}` : ''
            ])

            let allRows = [...ingredientRows]

            if (assembly.trim()) {
                const assemblyLines = assembly.trim().split('\n').filter(l => l.trim())
                allRows.push(['', '', '', '', ''])
                allRows.push(['— ASSEMBLY —', '', '', '', ''])
                assemblyLines.forEach(line => {
                    allRows.push([line, '', '', '', ''])
                })
            }

            await supabase.from('workbook_sheets').insert(withOrg(orgId, [{
                workbook_id: wbData.id,
                sheet_name: recipeName.trim(),
                sheet_index: 0,
                headers: sheetHeaders,
                rows: allRows
            }]))

            // Build chunk for AI embedding
            const ingredientChunk = filledRows.map((r, i) =>
                `Row ${i + 1} -> Col A: ${r.ingredient} | Col B: ${r.quantity} | Col C: ${r.measure} | Col D: ${r.unitCost} | Col E: ${r.totalCost}`
            ).join('\n')

            const assemblyChunk = assembly.trim()
                ? `\n\nAssembly:\n${assembly.trim()}`
                : ''

            const fullChunk = `File: ${recipeName.trim()}\nSheet: ${recipeName.trim()}\n${ingredientChunk}${assemblyChunk}`

            await supabase.from('workbook_chunks').insert(withOrg(orgId, [{
                workbook_id: wbData.id,
                sheet_name: recipeName.trim(),
                content: fullChunk,
                row_start: 1,
                row_end: allRows.length
            }]))

            // Fire-and-forget embedding — pass org_id for downstream scoping
            supabase.functions.invoke('embed-chunks', {
                body: { workbook_id: wbData.id, org_id: orgId }
            }).then(({ error }) => {
                if (error) console.error('Embedding error:', error)
            })

            navigate(backLink)
        } catch (err) {
            console.error('Error saving recipe:', err)
            alert('Failed to save recipe. Check console for details.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-left">
                    <h1 className="header-title">
                        <i className="fa-solid fa-plus title-icon" style={{ color: '#34d399' }} />
                        Create Recipe
                    </h1>
                    <p className="header-date">Build a new recipe from scratch</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || !orgId}
                        style={{ background: '#34d399', borderColor: '#34d399' }}
                    >
                        <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
                        {saving ? 'Saving...' : 'Save Recipe'}
                    </button>
                    <Link to={backLink} className="btn btn-secondary btn-sm">
                        <i className="fa-solid fa-arrow-left" /> Back
                    </Link>
                </div>
            </header>

            {/* Recipe Name */}
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)', display: 'block' }}>
                    RECIPE NAME
                </label>
                <input
                    type="text"
                    className="input"
                    placeholder="e.g. Pan-Seared Salmon with Lemon-Dill Sauce"
                    value={recipeName}
                    onChange={e => setRecipeName(e.target.value)}
                    style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'var(--text-primary)',
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 600
                    }}
                />

                {/* Category Selector */}
                <div style={{ marginTop: 'var(--space-4)' }}>
                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)', display: 'block' }}>
                        CATEGORY
                    </label>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {categories.map(c => (
                            <button
                                key={c.id}
                                onClick={() => toggleCategory(c.name)}
                                className={`btn btn-sm ${selectedCategories.includes(c.name) ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ borderRadius: '20px' }}
                            >
                                {selectedCategories.includes(c.name) && <i className="fa-solid fa-check" style={{ fontSize: '0.7em' }} />}
                                {c.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Ingredients Table */}
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="card-header">
                    <h2 className="card-title">
                        <i className="fa-solid fa-list" style={{ color: '#60a5fa', marginRight: '8px' }} />
                        Ingredients
                    </h2>
                    <button className="btn btn-sm btn-secondary" onClick={addRow}>
                        <i className="fa-solid fa-plus" /> Add Row
                    </button>
                </div>

                <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>#</th>
                                <th style={{ minWidth: 200 }}>Ingredient</th>
                                <th style={{ width: 100 }}>Quantity</th>
                                <th style={{ width: 120 }}>Measure</th>
                                <th style={{ width: 110 }}>Unit Cost</th>
                                <th style={{ width: 110 }}>Total Cost</th>
                                <th style={{ width: 50 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                    <td>
                                        <input
                                            type="text"
                                            value={row.ingredient}
                                            onChange={e => updateRow(i, 'ingredient', e.target.value)}
                                            placeholder="Ingredient name"
                                            className="rc-cell-input"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={row.quantity}
                                            onChange={e => updateRow(i, 'quantity', e.target.value)}
                                            placeholder="0"
                                            className="rc-cell-input"
                                            style={{ textAlign: 'center' }}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={row.measure}
                                            onChange={e => updateRow(i, 'measure', e.target.value)}
                                            placeholder="oz, lbs, ea..."
                                            className="rc-cell-input"
                                        />
                                    </td>
                                    <td>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85em' }}>$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={row.unitCost}
                                                onChange={e => updateRow(i, 'unitCost', e.target.value)}
                                                placeholder="0.00"
                                                className="rc-cell-input"
                                                style={{ paddingLeft: 20, textAlign: 'right' }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85em' }}>$</span>
                                            <input
                                                type="text"
                                                value={row.totalCost}
                                                readOnly
                                                placeholder="—"
                                                className="rc-cell-input rc-cell-readonly"
                                                style={{ paddingLeft: 20, textAlign: 'right' }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            className="rc-remove-btn"
                                            onClick={() => removeRow(i)}
                                            title="Remove row"
                                            disabled={rows.length <= 1}
                                        >
                                            <i className="fa-solid fa-xmark" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Assembly Instructions */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        <i className="fa-solid fa-clipboard-list" style={{ color: '#fbbf24', marginRight: '8px' }} />
                        Assembly / Preparation Instructions
                    </h2>
                </div>
                <textarea
                    value={assembly}
                    onChange={e => setAssembly(e.target.value)}
                    placeholder="Enter assembly or preparation steps, one per line...&#10;&#10;1. Season the salmon with salt and pepper&#10;2. Heat olive oil in a cast iron skillet over medium-high heat&#10;3. Sear salmon skin-side down for 4 minutes..."
                    className="rc-assembly-textarea"
                    rows={8}
                />
            </div>
        </div>
    )
}
