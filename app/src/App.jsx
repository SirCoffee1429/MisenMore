import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminRoute from './components/AdminRoute.jsx'
import OrgResolver from './components/OrgResolver.jsx'
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
import ManagementBoardPage from './pages/ManagementBoardPage.jsx'
import AdminPanel from './pages/AdminPanel.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RoleSelect />} />
        <Route path="/login" element={<Login />} />

        {/* Platform admin — gated by is_platform_admin JWT claim */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />

        {/* Kitchen routes — anonymous, org resolved from URL slug */}
        <Route
          path="/k/:orgSlug"
          element={
            <OrgResolver>
              <KitchenLayout />
            </OrgResolver>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="recipes" element={<KitchenRecipes />} />
          <Route path="recipes/create" element={<RecipeCreator />} />
          <Route path="recipes/:id" element={<WorkbookViewer readOnly />} />
          <Route path="briefings" element={<Briefings />} />
          <Route path="events" element={<EventsBanquetsPage readOnly />} />
          <Route path="chat" element={<AiChat />} />
        </Route>

        {/* Office routes — auth required, org from JWT claims */}
        <Route
          path="/o/:orgSlug"
          element={
            <ProtectedRoute>
              <OfficeLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<OfficeDashboard />} />
          <Route path="briefings" element={<Briefings />} />
          <Route path="briefings/new" element={<BriefingEditor />} />
          <Route path="briefings/:id/edit" element={<BriefingEditor />} />
          <Route path="workbooks" element={<WorkbookLibrary />} />
          <Route path="workbooks/upload" element={<WorkbookUpload />} />
          <Route path="workbooks/create" element={<RecipeCreator />} />
          <Route path="workbooks/:id" element={<WorkbookViewer />} />
          <Route path="sales" element={<SalesReports />} />
          <Route path="sales/:date" element={<SalesReportDetail />} />
          <Route path="events" element={<EventsBanquetsPage />} />
          <Route path="board" element={<ManagementBoardPage />} />
          <Route path="history" element={<History />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
