import { useState, useEffect } from 'react'

export default function EditRecipeModal({ isOpen, onClose, workbook, categories, onSave }) {
    const [name, setName] = useState('')
    const [selectedCategories, setSelectedCategories] = useState([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (workbook) {
            setName(workbook.file_name)

            let cats = []
            if (Array.isArray(workbook.category)) {
                cats = [...workbook.category]
            } else if (typeof workbook.category === 'string') {
                try {
                    if (workbook.category.startsWith('[')) {
                        cats = JSON.parse(workbook.category)
                    } else {
                        cats = [workbook.category]
                    }
                } catch {
                    cats = [workbook.category]
                }
            }
            setSelectedCategories(cats)
        }
    }, [workbook])

    if (!isOpen || !workbook) return null

    function toggleCategory(catName) {
        if (selectedCategories.includes(catName)) {
            let next = selectedCategories.filter(c => c !== catName)
            if (next.length === 0) next = ['Uncategorized']
            setSelectedCategories(next)
        } else {
            let next = [...selectedCategories, catName].filter(c => c !== 'Uncategorized')
            setSelectedCategories(next)
        }
    }

    async function handleSave() {
        if (!name.trim()) return
        setSaving(true)

        let finalName = name.trim()
        if (!finalName.endsWith('.xlsx') && !finalName.endsWith('.xls')) {
            finalName += '.xlsx'
        }

        await onSave(workbook.id, finalName, selectedCategories)
        setSaving(false)
        onClose()
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h2>Edit Recipe</h2>
                    <button className="btn-close" onClick={onClose}>✕</button>
                </div>

                <div style={{ padding: 'var(--space-4)' }}>
                    <div className="form-group">
                        <label>Recipe Name</label>
                        <input
                            type="text"
                            className="input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                        <label>Categories (Select Multiple)</label>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
                            {categories.map(c => {
                                const isSelected = selectedCategories.includes(c.name)
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => toggleCategory(c.name)}
                                        className={`badge ${isSelected ? 'badge-primary' : 'badge-secondary'}`}
                                        style={{ border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                    >
                                        {isSelected ? '✓ ' : '+ '}{c.name}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}
