import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { formatFileSize } from '../lib/workbooks.js'
import { useCategories } from '../lib/useCategories.js'
import EditRecipeContentModal from '../components/EditRecipeContentModal.jsx'

export default function KitchenRecipes() {
    const { categories, loading: categoriesLoading } = useCategories()
    const [workbooks, setWorkbooks] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('All')
    const [searchQuery, setSearchQuery] = useState('')
    const [editWorkbook, setEditWorkbook] = useState(null)

    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from('workbooks')
                .select('*')
                .order('uploaded_at', { ascending: false })
            setWorkbooks(data || [])
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
        )
    }

    const filteredWorkbooks = workbooks.filter(wb => {
        let matchesCategory = false;
        if (filter === 'All') {
            matchesCategory = true;
        } else if (Array.isArray(wb.category)) {
            // Case-insensitive check of array contents
            matchesCategory = wb.category.some(c => c.toLowerCase() === filter.toLowerCase());
        } else if (typeof wb.category === 'string') {
            try {
                // Try parsing if it's a stringified array
                if (wb.category.startsWith('[')) {
                    const parsed = JSON.parse(wb.category);
                    matchesCategory = parsed.some(c => c.toLowerCase() === filter.toLowerCase());
                } else {
                    matchesCategory = wb.category.toLowerCase() === filter.toLowerCase();
                }
            } catch {
                matchesCategory = wb.category.toLowerCase() === filter.toLowerCase();
            }
        }

        const matchesSearch = wb.file_name.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
    })

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">Recipes</h1>
                    <p className="page-subtitle">{filteredWorkbooks.length} recipe{filteredWorkbooks.length !== 1 ? 's' : ''} {filter !== 'All' ? `in ${filter}` : 'available'}</p>
                </div>
                <Link to="/kitchen/recipes/create" className="btn btn-primary" style={{ background: '#34d399', borderColor: '#34d399' }}>
                    <i className="fa-solid fa-plus" /> Create Recipe
                </Link>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
                <div className="kb-input-wrapper" style={{ flex: 'none', maxWidth: '400px', width: '100%' }}>
                    <span className="kb-search-icon"><i className="fa-solid fa-magnifying-glass" /></span>
                    <input
                        type="text"
                        placeholder="Search recipes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="kb-search-input"
                    />
                </div>
            </div>

            <div style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {categoriesLoading ? (
                    <span className="text-muted">Loading categories...</span>
                ) : (
                    ['All', ...categories.map(c => c.name)].map(c => (
                        <button
                            key={c}
                            onClick={() => setFilter(c)}
                            className={`btn btn-sm ${filter === c ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ borderRadius: '20px' }}
                        >
                            {c}
                        </button>
                    ))
                )}
            </div>

            {filteredWorkbooks.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📁</div>
                    <div className="empty-state-text">No recipes available in this category.</div>
                </div>
            ) : (
                <div className="workbook-grid">
                    {filteredWorkbooks.map(wb => (
                        <Link key={wb.id} to={`/kitchen/recipes/${wb.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className="workbook-card" style={{ position: 'relative' }}>
                                {/* Pencil edit icon */}
                                <button
                                    className="recipe-edit-btn"
                                    onClick={e => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setEditWorkbook(wb)
                                    }}
                                    title="Edit recipe"
                                >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>

                                <div className="workbook-card-icon">📊</div>
                                <div className="workbook-card-name">{wb.file_name}</div>
                                <div className="workbook-card-meta">
                                    <span>{wb.sheet_count} sheet{wb.sheet_count !== 1 ? 's' : ''}</span>
                                    <span>{formatFileSize(wb.file_size)}</span>
                                    <span>{new Date(wb.uploaded_at).toLocaleDateString()}</span>
                                </div>
                                <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                    <span className={`badge ${wb.status === 'parsed' ? 'badge-success' : wb.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                                        {wb.status}
                                    </span>
                                    {(() => {
                                        let cats = [];
                                        if (Array.isArray(wb.category)) {
                                            cats = wb.category;
                                        } else if (typeof wb.category === 'string') {
                                            try {
                                                if (wb.category.startsWith('[')) {
                                                    cats = JSON.parse(wb.category);
                                                } else {
                                                    cats = [wb.category];
                                                }
                                            } catch {
                                                cats = [wb.category];
                                            }
                                        }
                                        return cats.map((cat, idx) => (
                                            <span key={idx} className="badge badge-info" style={{ backgroundColor: 'var(--bg-accent)', color: 'var(--text-accent)' }}>
                                                {cat}
                                            </span>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* Edit Recipe Content Modal */}
            <EditRecipeContentModal
                isOpen={!!editWorkbook}
                onClose={() => setEditWorkbook(null)}
                workbook={editWorkbook}
                onSaved={() => {
                    // Optionally refresh data; for now just close
                }}
            />
        </div>
    )
}
