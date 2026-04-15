import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'
import { useCategories } from '../lib/useCategories.js'

export default function WorkbookUpload() {
    const { categories } = useCategories()
    const [files, setFiles] = useState([])
    const [uploading, setUploading] = useState(false)
    const [dragging, setDragging] = useState(false)
    const inputRef = useRef(null)

    function handleFiles(fileList) {
        const xlsxFiles = Array.from(fileList).filter(f =>
            f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
        )
        setFiles(prev => [
            ...prev,
            ...xlsxFiles.map(f => ({ file: f, status: 'pending', name: f.name }))
        ])
    }

    function handleDrop(e) {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
    }

    function handleDragOver(e) {
        e.preventDefault()
        setDragging(true)
    }

    function removeFile(index) {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    async function uploadAll() {
        if (files.length === 0) return
        setUploading(true)

        for (let i = 0; i < files.length; i++) {
            const item = files[i]
            if (item.status !== 'pending') continue

            try {
                // Check for duplicates first
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'checking' } : f))

                const { data: existing } = await supabase
                    .from('workbooks')
                    .select('id')
                    .eq('file_name', item.name)
                    .maybeSingle()

                if (existing) {
                    setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'duplicate', error: 'File already exists' } : f))
                    continue
                }

                // Update status to uploading
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))

                // Upload to Supabase storage
                const timestamp = Date.now()
                const storagePath = `${timestamp}_${item.name}`
                const { error: uploadError } = await supabase.storage
                    .from('workbooks')
                    .upload(storagePath, item.file)

                if (uploadError) throw uploadError

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('workbooks')
                    .getPublicUrl(storagePath)

                // Parse the workbook client-side
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'parsing' } : f))

                const arrayBuffer = await item.file.arrayBuffer()
                const workbook = XLSX.read(arrayBuffer, { type: 'array' })

                // Insert each sheet and build chunk text for categorization
                const sheetsToInsert = []
                const chunksToInsert = []

                // Parsing ranges: rows 1-23 => columns A-E, rows 24-32 => column A only
                const MAX_ROW = 32
                const FULL_COLS = 5  // A-E (indices 0-4)
                const ASSEMBLY_START = 23 // array index for row 24
                const headers = ['A', 'B', 'C', 'D', 'E']

                workbook.SheetNames.forEach((sheetName, sheetIndex) => {
                    const worksheet = workbook.Sheets[sheetName]
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

                    if (jsonData.length === 0) return

                    // Restrict rows to 1-32 and trim columns per range
                    const rows = []
                    for (let r = 0; r < Math.min(jsonData.length, MAX_ROW); r++) {
                        const srcRow = jsonData[r] || []
                        if (r < ASSEMBLY_START) {
                            // Rows 1-23: columns A-E
                            rows.push(srcRow.slice(0, FULL_COLS))
                        } else {
                            // Rows 24-32: column A only
                            rows.push([srcRow[0] !== undefined ? srcRow[0] : ''])
                        }
                    }

                    sheetsToInsert.push({
                        sheet_name: sheetName,
                        sheet_index: sheetIndex,
                        headers: headers,
                        rows: rows
                    })

                    // Create text chunks for AI (every 30 rows)
                    const chunkSize = 30
                    for (let r = 0; r < rows.length; r += chunkSize) {
                        const chunkRows = rows.slice(r, r + chunkSize)
                        const textLines = chunkRows.map((row, idx) => {
                            const cellVals = []
                            const colCount = r + idx < ASSEMBLY_START ? FULL_COLS : 1
                            for (let idx2 = 0; idx2 < colCount; idx2++) {
                                if (row[idx2] !== undefined && row[idx2] !== null && row[idx2] !== '') {
                                    cellVals.push(`Col ${headers[idx2]}: ${row[idx2]}`)
                                }
                            }
                            return `Row ${r + idx + 1} -> ` + cellVals.join(' | ')
                        })
                        chunksToInsert.push({
                            sheet_name: sheetName,
                            content: `File: ${item.name}\nSheet: ${sheetName}\n${textLines.join('\n')}`,
                            row_start: r + 1,
                            row_end: Math.min(r + chunkSize, rows.length)
                        })
                    }
                })

                // Determine category from first chunk
                let category = ['Uncategorized']
                if (chunksToInsert.length > 0) {
                    try {
                        const { data, error } = await supabase.functions.invoke('categorize-recipe', {
                            body: {
                                text: chunksToInsert[0].content,
                                categories: categories.map(c => c.name)
                            }
                        })
                        if (!error && data?.category && Array.isArray(data.category)) {
                            category = data.category
                        }
                    } catch (catErr) {
                        console.error('Categorization error:', catErr)
                    }
                }

                // Insert workbook record
                const { data: wbData, error: wbError } = await supabase
                    .from('workbooks')
                    .insert({
                        file_name: item.name,
                        file_url: urlData.publicUrl,
                        file_size: item.file.size,
                        sheet_count: workbook.SheetNames.length,
                        status: 'parsed',
                        category: category
                    })
                    .select()
                    .single()

                if (wbError) throw wbError

                // Append workbook id to sheets and chunks
                sheetsToInsert.forEach(s => s.workbook_id = wbData.id)
                chunksToInsert.forEach(c => c.workbook_id = wbData.id)


                if (sheetsToInsert.length > 0) {
                    await supabase.from('workbook_sheets').insert(sheetsToInsert)
                }
                if (chunksToInsert.length > 0) {
                    await supabase.from('workbook_chunks').insert(chunksToInsert)
                }
                supabase.functions.invoke('embed-chunks', {
                    body: { workbook_id: wbData.id }
                }).then(({ error }) => {
                    if (error) console.error('Embedding error:', error)
                })

                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', category: category, workbookId: wbData.id } : f))
            } catch (err) {
                console.error('Upload error:', err)
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: err.message } : f))
            }
        }

        setUploading(false)
    }

    async function toggleCategory(index, categoryName) {
        let fileItem = files[index]
        let targetId = fileItem.workbookId

        let currentCategories = Array.isArray(fileItem.category) ? [...fileItem.category] : [fileItem.category || 'Uncategorized']

        if (currentCategories.includes(categoryName)) {
            // Remove it
            currentCategories = currentCategories.filter(c => c !== categoryName)
            // If empty, default to Uncategorized
            if (currentCategories.length === 0) currentCategories = ['Uncategorized']
        } else {
            // Add it and remove 'Uncategorized' if present
            currentCategories.push(categoryName)
            currentCategories = currentCategories.filter(c => c !== 'Uncategorized')
        }

        // If the workbook ID is missing from state (e.g. uploaded before a hot refresh), fetch it.
        if (!targetId) {
            const { data } = await supabase
                .from('workbooks')
                .select('id')
                .eq('file_name', fileItem.name)
                .maybeSingle()

            if (data?.id) {
                targetId = data.id
            } else {
                console.error('Could not determine workbook ID for', fileItem.name)
                return
            }
        }

        // Update local state optimistically
        setFiles(prev => prev.map((f, idx) => idx === index ? { ...f, category: currentCategories, workbookId: targetId } : f))

        try {
            const { error } = await supabase
                .from('workbooks')
                .update({ category: currentCategories })
                .eq('id', targetId)

            if (error) {
                console.error('Failed to update categories:', error)
            }
        } catch (err) {
            console.error('Error changing categories:', err)
        }
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Upload Recipes</h1>
                <p className="page-subtitle">Drag and drop .xlsx files to upload, parse, and store them.</p>
            </div>

            <div
                className={`upload-zone ${dragging ? 'dragging' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragging(false)}
            >
                <div className="upload-zone-icon">📤</div>
                <div className="upload-zone-text">
                    Drop .xlsx files here or click to browse
                </div>
                <div className="upload-zone-hint">
                    Supports multiple files at once
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => handleFiles(e.target.files)}
                />
            </div>

            {files.length > 0 && (
                <>
                    <div className="upload-file-list">
                        {files.map((f, i) => (
                            <div key={i} className="upload-file-item">
                                <span style={{ fontSize: '1.2rem' }}>📄</span>
                                <span className="upload-file-name">{f.name}</span>
                                <span className="upload-file-status">
                                    {f.status === 'pending' && '⏳ Ready'}
                                    {f.status === 'checking' && <><span className="spinner" /> Checking...</>}
                                    {f.status === 'uploading' && <><span className="spinner" /> Uploading...</>}
                                    {f.status === 'parsing' && <><span className="spinner" /> Parsing...</>}
                                    {f.status === 'done' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                            <span className="badge badge-success">✓ Done</span>

                                            {/* Render selected categories as badges */}
                                            {Array.isArray(f.category) && f.category.map((cat, idx) => (
                                                <span key={idx} className="badge badge-primary">{cat}</span>
                                            ))}
                                            {!Array.isArray(f.category) && f.category && (
                                                <span className="badge badge-primary">{f.category}</span>
                                            )}

                                            {/* Multi-select dropdown */}
                                            <select
                                                className="input"
                                                style={{ padding: '0.1rem 0.5rem', fontSize: '0.85rem', width: 'auto', minWidth: '150px' }}
                                                value="Add/Remove..."
                                                onChange={(e) => {
                                                    if (e.target.value && e.target.value !== "Add/Remove...") {
                                                        toggleCategory(i, e.target.value)
                                                    }
                                                }}
                                            >
                                                <option disabled>Add/Remove...</option>
                                                {categories.map(c => {
                                                    const isSelected = Array.isArray(f.category) ? f.category.includes(c.name) : f.category === c.name;
                                                    return (
                                                        <option key={c.id} value={c.name}>
                                                            {isSelected ? `✓ Remove ${c.name}` : `+ Add ${c.name}`}
                                                        </option>
                                                    )
                                                })}
                                            </select>
                                        </div>
                                    )}
                                    {f.status === 'error' && <span className="badge badge-danger">✗ Error</span>}
                                    {f.status === 'duplicate' && <span className="badge badge-warning" style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)' }}>⚠️ Duplicate</span>}
                                </span>
                                {(f.status === 'pending' || f.status === 'duplicate' || f.status === 'error') && (
                                    <button className="btn btn-sm btn-danger" onClick={() => removeFile(i)}>✕</button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)' }}>
                        <button
                            className="btn btn-primary"
                            onClick={uploadAll}
                            disabled={uploading || files.every(f => f.status === 'done')}
                        >
                            {uploading ? 'Uploading...' : `Upload ${files.filter(f => f.status === 'pending').length} File(s)`}
                        </button>
                        {!uploading && (
                            <button className="btn btn-secondary" onClick={() => setFiles([])}>
                                Clear All
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
