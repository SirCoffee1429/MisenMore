import { Routes, Route } from 'react-router-dom'
import RoleSelect from './pages/RoleSelect.jsx'
import Dashboard from './pages/Dashboard.jsx'
import OfficeDashboard from './pages/OfficeDashboard.jsx'
import WorkbookUpload from './pages/WorkbookUpload.jsx'
import WorkbookLibrary from './pages/WorkbookLibrary.jsx'
import WorkbookViewer from './pages/WorkbookViewer.jsx'
import AiChat from './pages/AiChat.jsx'
import KitchenRecipes from './pages/KitchenRecipes.jsx'
import Briefings from './pages/Briefings.jsx'
import BriefingEditor from './pages/BriefingEditor.jsx'
import History from './pages/History.jsx'
import KitchenLayout from './components/KitchenLayout.jsx'
import OfficeLayout from './components/OfficeLayout.jsx'
import SalesReports from './pages/SalesReports.jsx'
import SalesReportDetail from './pages/SalesReportDetail.jsx'
import EventsBanquetsPage from './pages/EventsBanquetsPage.jsx'
import RecipeCreator from './pages/RecipeCreator.jsx'
import Communication from './pages/Communication.jsx'

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<RoleSelect />} />

            {/* Kitchen routes */}
            <Route path="/kitchen" element={<KitchenLayout><Dashboard /></KitchenLayout>} />
            <Route path="/kitchen/recipes" element={<KitchenLayout><KitchenRecipes /></KitchenLayout>} />
            <Route path="/kitchen/recipes/create" element={<KitchenLayout><RecipeCreator /></KitchenLayout>} />
            <Route path="/kitchen/recipes/:id" element={<KitchenLayout><WorkbookViewer /></KitchenLayout>} />
            <Route path="/kitchen/chat" element={<KitchenLayout><AiChat /></KitchenLayout>} />
            <Route path="/kitchen/sales" element={<KitchenLayout><SalesReports /></KitchenLayout>} />
            <Route path="/kitchen/sales/:date" element={<KitchenLayout><SalesReportDetail /></KitchenLayout>} />
            <Route path="/kitchen/events" element={<KitchenLayout><EventsBanquetsPage /></KitchenLayout>} />

            {/* Office routes — TEMPORARILY UNGATED. ProtectedRoute lands in Phase 4 before any real org is provisioned. */}
            <Route path="/office" element={<OfficeLayout><OfficeDashboard /></OfficeLayout>} />
            <Route path="/office/briefings" element={<OfficeLayout><Briefings /></OfficeLayout>} />
            <Route path="/office/briefings/new" element={<OfficeLayout><BriefingEditor /></OfficeLayout>} />
            <Route path="/office/briefings/:id/edit" element={<OfficeLayout><BriefingEditor /></OfficeLayout>} />
            <Route path="/office/workbooks" element={<OfficeLayout><WorkbookLibrary /></OfficeLayout>} />
            <Route path="/office/workbooks/create" element={<OfficeLayout><RecipeCreator /></OfficeLayout>} />
            <Route path="/office/workbooks/upload" element={<OfficeLayout><WorkbookUpload /></OfficeLayout>} />
            <Route path="/office/workbooks/:id" element={<OfficeLayout><WorkbookViewer /></OfficeLayout>} />
            <Route path="/office/history" element={<OfficeLayout><History /></OfficeLayout>} />
            <Route path="/office/events" element={<OfficeLayout><EventsBanquetsPage /></OfficeLayout>} />
            <Route path="/office/chat" element={<OfficeLayout><Communication /></OfficeLayout>} />
            <Route path="/office/sales" element={<OfficeLayout><SalesReports /></OfficeLayout>} />
            <Route path="/office/sales/:date" element={<OfficeLayout><SalesReportDetail /></OfficeLayout>} />
        </Routes>
    )
}