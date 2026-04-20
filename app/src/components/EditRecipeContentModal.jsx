import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Parse workbook_sheets rows into structured recipe data.
 * Expected format:
 *   Row 0: ["RECIPE:", "Recipe Name"]
 *   Row 1: ["Ingredients", "Quantity", "Measure", "Unit Cost", "Total Cost"]
 *   Rows 2..N: ingredient rows (until empty row or "Assembly:" row)
 *   ["Assembly:"]
 *   [assembly text]
 */
function parseRecipeRows(rows) {
    const ingredients = []
    let assembly = ''
    let ingredientsDone = false

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]

        // Skip the title and header rows
        if (i === 0 || i === 1) continue

        // Check for Assembly marker
        if (row[0] && String(row[0]).toLowerCase().startsWith('assembly')) {
            ingredientsDone = true
            continue
        }

        if (!ingredientsDone) {
            // Ingredient row — must have a name in column 0
            if (row[0] && String(row[0]).trim() !== '') {
                ingredients.push({
                    name: String(row[0] ?? ''),
                    quantity: row[1] ?? '',
                    measure: String(row[2] ?? ''),
                    unitCost: row[3] ?? '',
                    totalCost: row[4] ?? '',
                })
            } else if (ingredients.length > 0) {
                // Empty name row after ingredients → ingredients section over
                ingredientsDone = true
            }
        } else {
            // Assembly text
            if (row[0] && String(row[0]).trim() !== '') {
                if (assembly) assembly += '\n'
                assembly += String(row[0])
            }
        }
    }

    return { ingredients, assembly }
}

/**
 * Reconstruct the full rows array from edited ingredients + assembly,
 * preserving the original title row and header row.
 */
function rebuildRows(originalRows, ingredients, assembly) {
    const titleRow = originalRows[0] || ['RECIPE:', '']
    const headerRow = originalRows[1] || ['Ingredients', 'Quantity', 'Measure', 'Unit Cost', 'Total Cost']

    const rows = [titleRow, headerRow]

    // Add ingredient rows
    for (const ing of ingredients) {
        rows.push([
            ing.name,
            ing.quantity === '' ? '' : Number(ing.quantity) || ing.quantity,
            ing.measure,
            ing.unitCost === '' ? '' : Number(ing.unitCost) || ing.unitCost,
            ing.totalCost === '' ? '' : Number(ing.totalCost) || ing.totalCost,
        ])
    }

    // Add spacing + assembly
    rows.push([])
    rows.push([])
    rows.push([])
    rows.push(['Assembly:'])
    rows.push([assembly])

    // Pad to roughly 32 rows like original
    while (rows.length < 32) {
        rows.push([''])
    }

    return rows
}

export default function EditRecipeContentModal({ isOpen, onClose, workbook, orgId, onSaved }) {
    const [sheets, setSheets] = useState([])
    const [activeSheet, setActiveSheet] = useState(0)
    const [ingredients, setIngredients] = useState([])
    const [assembly, setAssembly] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!isOpen || !workbook || !orgId) return

        async function loadSheets() {
            setLoading(true)
            // Scope sheet lookup by org_id as defense-in-depth
            const { data } = await supabase
                .from('workbook_sheets')
                .select('*')
                .eq('workbook_id', workbook.id)
                .eq('org_id', orgId)
                .order('sheet_index')

            setSheets(data || [])
            if (data && data.length > 0) {
                const parsed = parseRecipeRows(data[0].rows || [])
                setIngredients(parsed.ingredients)
                setAssembly(parsed.assembly)
            }
            setActiveSheet(0)
            setLoading(false)
        }

        loadSheets()
    }, [isOpen, workbook, orgId])

    function handleSheetChange(index) {
        setActiveSheet(index)
        const sheet = sheets[index]
        if (sheet) {
            const parsed = parseRecipeRows(sheet.rows || [])
            setIngredients(parsed.ingredients)
            setAssembly(parsed.assembly)
        }
    }

    function updateIngredient(index, field, value) {
        setIngredients(prev => {
            const next = [...prev]
            next[index] = { ...next[index], [field]: value }
            return next
        })
    }

    function removeIngredient(index) {
        setIngredients(prev => prev.filter((_, i) => i !== index))
    }

    function addIngredient() {
        setIngredients(prev => [...prev, { name: '', quantity: '', measure: '', unitCost: '', totalCost: '' }])
    }

    async function handleSave() {
        const sheet = sheets[activeSheet]
        if (!sheet || !orgId) return

        setSaving(true)

        const newRows = rebuildRows(sheet.rows || [], ingredients, assembly)

        const { error } = await supabase
            .from('workbook_sheets')
            .update({ rows: newRows })
            .eq('id', sheet.id)
            .eq('org_id', orgId)

        if (error) {
            console.error('Error saving recipe:', error)
            alert('Error saving: ' + error.message)
        } else {
            // Update local sheet data
            setSheets(prev => {
                const next = [...prev]
                next[activeSheet] = { ...next[activeSheet], rows: newRows }
                return next
            })
            onSaved?.()
            onClose()
        }
        setSaving(false)
    }

    if (!isOpen || !workbook) return null

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className="modal-content edit-recipe-content-modal"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2><i className="fa-solid fa-pen-to-square" style={{ marginRight: '8px', color: 'var(--orange)' }}></i>Edit Recipe</h2>
                    <button className="btn-close" onClick={onClose}>✕</button>
                </div>

                {loading ? (
                    <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                        <div className="spinner" style={{ margin: '0 auto' }} />
                    </div>
                ) : (
                    <>
                        {/* Sheet tabs if multiple */}
                        {sheets.length > 1 && (
                            <div className="sheet-tabs" style={{ padding: '0 var(--space-4)', paddingTop: 'var(--space-2)' }}>
                                {sheets.map((sheet, i) => (
                                    <button
                                        key={sheet.id}
                                        className={`sheet-tab ${i === activeSheet ? 'active' : ''}`}
                                        onClick={() => handleSheetChange(i)}
                                    >
                                        {sheet.sheet_name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="edit-recipe-body">
                            {/* Recipe name (read-only display) */}
                            <div className="edit-recipe-section-title">
                                <i className="fa-solid fa-carrot"></i> Ingredients
                            </div>

                            <div className="edit-recipe-ingredients">
                                <div className="edit-recipe-ing-header">
                                    <span className="edit-recipe-ing-col-name">Ingredient</span>
                                    <span className="edit-recipe-ing-col-qty">Qty</span>
                                    <span className="edit-recipe-ing-col-measure">Measure</span>
                                    <span className="edit-recipe-ing-col-action"></span>
                                </div>

                                {ingredients.map((ing, i) => (
                                    <div key={i} className="edit-recipe-ing-row">
                                        <input
                                            className="input edit-recipe-ing-col-name"
                                            value={ing.name}
                                            onChange={e => updateIngredient(i, 'name', e.target.value)}
                                            placeholder="Ingredient name"
                                        />
                                        <input
                                            className="input edit-recipe-ing-col-qty"
                                            value={ing.quantity}
                                            onChange={e => updateIngredient(i, 'quantity', e.target.value)}
                                            placeholder="0"
                                        />
                                        <input
                                            className="input edit-recipe-ing-col-measure"
                                            value={ing.measure}
                                            onChange={e => updateIngredient(i, 'measure', e.target.value)}
                                            placeholder="Cups, T, etc."
                                        />
                                        <button
                                            className="btn-icon-danger"
                                            onClick={() => removeIngredient(i)}
                                            title="Remove ingredient"
                                        >
                                            <i className="fa-solid fa-trash-can"></i>
                                        </button>
                                    </div>
                                ))}

                                <button className="btn btn-sm btn-secondary edit-recipe-add-btn" onClick={addIngredient}>
                                    <i className="fa-solid fa-plus"></i> Add Ingredient
                                </button>
                            </div>

                            {/* Assembly */}
                            <div className="edit-recipe-section-title" style={{ marginTop: 'var(--space-5)' }}>
                                <i className="fa-solid fa-list-ol"></i> Assembly Instructions
                            </div>
                            <textarea
                                className="input edit-recipe-assembly"
                                value={assembly}
                                onChange={e => setAssembly(e.target.value)}
                                placeholder="Enter assembly / preparation instructions..."
                                rows={6}
                            />
                        </div>

                        <div className="modal-footer" style={{
                            borderTop: '1px solid var(--border-color)',
                            padding: 'var(--space-4)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 'var(--space-2)'
                        }}>
                            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
