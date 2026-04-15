import ManagementWhiteboard from '../components/ManagementWhiteboard.jsx'

export default function Communication() {
    return (
        <div style={{ padding: '0 1rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <i className="fa-solid fa-comments" style={{ color: '#e66b35' }} />
                    Department Communication
                </h1>
                <p style={{ color: '#9ca3af', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                    Team announcements and shift notes
                </p>
            </div>
            
            <div style={{ 
                background: '#2a2a2a', 
                border: '1px solid #333', 
                borderRadius: '0.5rem', 
                padding: '1.5rem' 
            }}>
                <ManagementWhiteboard />
            </div>
        </div>
    )
}
