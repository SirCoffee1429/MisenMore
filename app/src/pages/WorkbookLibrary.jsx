import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { formatFileSize } from '../lib/workbooks.js'
import { useCategories } from '../lib/useCategories.js'
import { useAuth } from '../lib/auth/useAuth.js'
import CategoryManager from '../components/CategoryManager.jsx'
import EditRecipeModal from '../components/EditRecipeModal.jsx'

// WorkbookLibrary — office recipe management. Every read and write is
// scoped by org_id from JWT claims. CategoryManager also receives orgId
// so it can stamp new categories and scope its category-rename updates.
export default function WorkbookLibrary() {
    const { orgId, orgSlug } = useAuth()
    const workbooksBase = `/o/${orgSlug}/workbooks`

    const { categories, loading: categoriesLoading, refetch: refetchCategories } = useCategories(orgId)
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
    const [workbooks, setWorkbooks] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('All')
    const [searchQuery, setSearchQuery] = useState('')
    const [editingWorkbook, setEditingWorkbook] = useState(null)

    useEffect(() => {
        if (!orgId) return
        async function load() {
            const { data } = await supabase
                .from('workbooks')
                .select('*')
                .eq('org_id', orgId)
                .order('uploaded_at', { ascending: false })
            setWorkbooks(data || [])
            setLoading(false)
        }
        load()
    }, [orgId])

    // Delete a workbook — scoped by org_id
    async function deleteWorkbook(id, e) {
        e.preventDefault()
        e.stopPropagation()
        if (!orgId) return
        if (!confirm('Delete this recipe and all its data?')) return
        await supabase.from('workbooks').delete().eq('id', id).eq('org_id', orgId)
        setWorkbooks(prev => prev.filter(w => w.id !== id))
    }

    // Update a workbook's name and categories — scoped by org_id
    async function updateWorkbook(id, newName, newCategories) {
        if (!orgId) return
        const { error } = await supabase
            .from('workbooks')
            .update({ file_name: newName, category: JSON.stringify(newCategories) })
            .eq('id', id)
            .eq('org_id', orgId)

        if (!error) {
            setWorkbooks(prev => prev.map(w =>
                w.id === id ? { ...w, file_name: newName, category: newCategories } : w
            ))
        } else {
            console.error("Failed to update workbook:", error)
            alert("Failed to save changes.")
        }
    }

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
                    <p className="page-subtitle">{filteredWorkbooks.length} recipe{filteredWorkbooks.length !== 1 ? 's' : ''} {filter !== 'All' ? `in ${filter}` : 'uploaded'}</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>

                    <button onClick={() => setIsCategoryModalOpen(true)} className="btn btn-secondary">
                        <i className="fa-solid fa-list" /> Manage Categories
                    </button>
                    <Link to={`${workbooksBase}/create`} className="btn btn-primary" style={{ background: '#34d399', borderColor: '#34d399' }}>
                        <i className="fa-solid fa-plus" /> Create
                    </Link>
                    <Link to={`${workbooksBase}/upload`} className="btn btn-primary">📤 Upload</Link>
                </div>
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
                    <div className="empty-state-text">No recipes found in this category.</div>
                    {filter === 'All' && (
                        <Link to={`${workbooksBase}/upload`} className="btn btn-primary" style={{ marginTop: 'var(--space-5)' }}>
                            📤 Upload Recipes
                        </Link>
                    )}
                </div>
            ) : (
                <div className="workbook-grid">
                    {filteredWorkbooks.map(wb => (
                        <Link key={wb.id} to={`${workbooksBase}/${wb.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className="workbook-card" style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', display: 'flex', gap: 'var(--space-1)', zIndex: 10 }}>
                                    <button className="btn btn-sm btn-secondary" onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditingWorkbook(wb);
                                    }} style={{ padding: 'var(--space-1) var(--space-2)' }}>
                                        <i className="fa-solid fa-pencil" />
                                    </button>
                                    <button className="btn btn-sm btn-danger" onClick={(e) => deleteWorkbook(wb.id, e)} style={{ padding: 'var(--space-1) var(--space-2)' }}>
                                        <i className="fa-solid fa-trash" />
                                    </button>
                                </div>
                                <div className="workbook-card-icon">📊</div>
                                <div className="workbook-card-name">{wb.file_name}</div>
                                <div className="workbook-card-meta">
                                    <span>{wb.sheet_count} sheet{wb.sheet_count !== 1 ? 's' : ''}</span>
                                    <span>{formatFileSize(wb.file_size)}</span>
                                    <span>{new Date(wb.uploaded_at).toLocaleDateString()}</span>
                                </div>
                                <div style={{ marginTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', flex: 1 }}>
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
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <CategoryManager
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                categories={categories}
                refetchCategories={refetchCategories}
                orgId={orgId}
            />

            <EditRecipeModal
                isOpen={!!editingWorkbook}
                onClose={() => setEditingWorkbook(null)}
                workbook={editingWorkbook}
                categories={categories}
                onSave={updateWorkbook}
            />
        </div>
    )
}
