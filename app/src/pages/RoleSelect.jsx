import { Link } from 'react-router-dom'

export default function RoleSelect() {
    return (
        <div className="role-select-page">
            <div className="role-select-header">
                <h1 className="role-select-title">MisenMore</h1>
                <p className="role-select-subtitle">Select your dashboard</p>
            </div>

            <div className="role-select-cards">
                <Link to="/kitchen" className="role-card kitchen-card">
                    <div className="role-card-icon"><i className="fa-solid fa-fire-burner" /></div>
                    <div className="role-card-label">Kitchen</div>
                    <div className="role-card-desc">Today's briefing, tasks & recipes</div>
                </Link>

                <Link to="/office" className="role-card office-card">
                    <div className="role-card-icon"><i className="fa-solid fa-building" /></div>
                    <div className="role-card-label">Office</div>
                    <div className="role-card-desc">Manage briefings, workbooks & history</div>
                </Link>
            </div>
        </div>
    )
}
