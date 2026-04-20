import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { withOrg } from '../lib/org/withOrg.js';

// CategoryManager — org-scoped CRUD for recipe_categories. All writes
// are stamped with org_id via withOrg; renames and deletes propagate to
// workbooks scoped by the same org_id so categorization is consistent
// per tenant.
export default function CategoryManager({ isOpen, onClose, categories, refetchCategories, orgId }) {
    const [newCategory, setNewCategory] = useState('');
    const [editing, setEditing] = useState(null);
    const [editName, setEditName] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    // Insert a new category row stamped with org_id
    async function handleAdd(e) {
        e.preventDefault();
        if (!newCategory.trim() || !orgId) return;
        setLoading(true);

        const { error } = await supabase
            .from('recipe_categories')
            .insert(withOrg(orgId, { name: newCategory.trim() }));

        if (!error) {
            setNewCategory('');
            await refetchCategories();
        } else {
            alert('Error adding category: ' + error.message);
        }
        setLoading(false);
    }

    // Rename a category and cascade the name change to every matching
    // workbook in the same org.
    async function handleEditSave(id) {
        if (!editName.trim() || !orgId) return;
        setLoading(true);

        const oldCat = categories.find(c => c.id === id);

        const { error } = await supabase
            .from('recipe_categories')
            .update({ name: editName.trim() })
            .eq('id', id)
            .eq('org_id', orgId);

        if (!error) {
            // Also update any workbooks using the old category name — scoped
            if (oldCat) {
                await supabase
                    .from('workbooks')
                    .update({ category: editName.trim() })
                    .eq('category', oldCat.name)
                    .eq('org_id', orgId);
            }
            setEditing(null);
            setEditName('');
            await refetchCategories();
        } else {
            alert('Error updating category: ' + error.message);
        }
        setLoading(false);
    }

    // Delete a category and reassign orphaned workbooks to 'Uncategorized'
    async function handleDelete(id, name) {
        if (!orgId) return;
        if (!confirm(`Are you sure you want to delete the "${name}" category? Workbooks with this category will become Uncategorized.`)) return;
        setLoading(true);

        await supabase
            .from('workbooks')
            .update({ category: 'Uncategorized' })
            .eq('category', name)
            .eq('org_id', orgId);

        const { error } = await supabase
            .from('recipe_categories')
            .delete()
            .eq('id', id)
            .eq('org_id', orgId);

        if (!error) {
            await refetchCategories();
        } else {
            alert('Error deleting category: ' + error.message);
        }
        setLoading(false);
    }

    function startEditing(cat) {
        setEditing(cat.id);
        setEditName(cat.name);
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-card)',
                padding: 'var(--space-5)',
                borderRadius: '12px',
                width: '100%', maxWidth: '500px',
                boxShadow: 'var(--shadow-lg)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Manage Categories</h2>
                    <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>
                        <i className="fa-solid fa-times" />
                    </button>
                </div>

                <form onSubmit={handleAdd} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                    <input
                        className="form-control"
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        placeholder="New category..."
                        disabled={loading}
                        style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn-primary" disabled={loading || !newCategory.trim() || !orgId}>
                        Add
                    </button>
                </form>

                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {categories.map(cat => (
                        <div key={cat.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: 'var(--space-2) var(--space-3)',
                            backgroundColor: 'var(--bg-body)',
                            borderRadius: '8px'
                        }}>
                            {editing === cat.id ? (
                                <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1 }}>
                                    <input
                                        className="form-control"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        style={{ flex: 1, padding: '0.25rem 0.5rem' }}
                                        autoFocus
                                    />
                                    <button onClick={() => handleEditSave(cat.id)} className="btn btn-success btn-sm" disabled={loading}>Save</button>
                                    <button onClick={() => setEditing(null)} className="btn btn-secondary btn-sm" disabled={loading}>Cancel</button>
                                </div>
                            ) : (
                                <>
                                    <span>{cat.name}</span>
                                    {cat.name !== 'Uncategorized' && (
                                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                            <button onClick={() => startEditing(cat)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }} disabled={loading}>
                                                <i className="fa-solid fa-pen" />
                                            </button>
                                            <button onClick={() => handleDelete(cat.id, cat.name)} className="btn btn-danger btn-sm" style={{ padding: '0.25rem 0.5rem' }} disabled={loading}>
                                                <i className="fa-solid fa-trash" />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                    {categories.length === 0 && <div className="text-muted text-center py-4">No categories found.</div>}
                </div>
            </div>
        </div>
    );
}
