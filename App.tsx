import { Route, Routes } from 'react-router-dom';
import RequireAuth from '@/auth/RequireAuth';
import RequirePlatform from '@/auth/RequirePlatform';
import RequireRole from '@/auth/RequireRole';
import AdminLayout from '@/layouts/AdminLayout';
import AdAccessPage from '@/pages/AdAccessPage';
import BingDashboardPage from '@/pages/BingDashboardPage';
import FacebookAdDetailPage from '@/pages/FacebookAdDetailPage';
import FacebookDashboardPage from '@/pages/FacebookDashboardPage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import PlatformPage from '@/pages/PlatformPage';
import UsersPage from '@/pages/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<HomePage />} />
          <Route element={<RequirePlatform platform="facebook" />}>
            <Route path="platforms/facebook" element={<FacebookDashboardPage />} />
            <Route path="platforms/facebook/ads/:adName" element={<FacebookAdDetailPage />} />
          </Route>
          <Route element={<RequirePlatform platform="microsoft" />}>
            <Route path="platforms/microsoft" element={<BingDashboardPage />} />
          </Route>
          <Route path="platforms/:slug" element={<PlatformPage />} />
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="ad-access" element={<AdAccessPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
