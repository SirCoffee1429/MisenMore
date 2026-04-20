import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';

// useCategories — org-scoped category fetcher. Caller must pass orgId so
// anon kitchen routes get only their own org's categories (RLS alone is
// insufficient for anon; see CLAUDE.md rule 10). If orgId is null/undefined,
// returns an empty list in loading=false state instead of issuing an
// unscoped query.
export function useCategories(orgId) {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCategories = useCallback(async () => {
        if (!orgId) {
            setCategories([]);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('recipe_categories')
                .select('*')
                .eq('org_id', orgId)
                .order('name');

            if (sbError) throw sbError;

            setCategories(data || []);
        } catch (err) {
            console.error('Error fetching categories:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    return { categories, loading, error, refetch: fetchCategories };
}
