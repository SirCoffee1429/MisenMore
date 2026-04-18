import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth/AuthContext.jsx'
import { useAuth } from './lib/auth/useAuth.js'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
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

// Phase 4 stub — minimal authenticated landing page used to verify the
// sign-in → ProtectedRoute → sign-out cycle works end-to-end. Phase 5
// replaces this with the real /o/:orgSlug route tree (OfficeLayout +
// OfficeDashboard, etc).
function PhaseFourStub() {
    const { user, orgSlug, role, signOut } = useAuth()
    return (
        <div style={{ padding: 24 }}>
            <h1>Signed in</h1>
            <p>User: {user?.email}</p>
            <p>Org slug: {orgSlug}</p>
            <p>Role: {role}</p>
            <button onClick={() => signOut()}>Sign out</button>
        </div>
    )
}

export default function App() {
    return (
        <AuthProvider>
        <Routes>
            <Route path="/" element={<RoleSelect />} />
            <Route path="/login" element={<Login />} />

            {/* Phase 4 verification target — stub office route, replaced in Phase 5 */}
            <Route
                path="/o/:orgSlug"
                element={
                    <ProtectedRoute>
                        <PhaseFourStub />
                    </ProtectedRoute>
                }
            />

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
        </AuthProvider>
    )
}