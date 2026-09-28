import { Route, Routes } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import FacebookAdDetailPage from '@/pages/FacebookAdDetailPage';
import FacebookDashboardPage from '@/pages/FacebookDashboardPage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import PlatformPage from '@/pages/PlatformPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<HomePage />} />
        <Route path="platforms/facebook" element={<FacebookDashboardPage />} />
        <Route path="platforms/facebook/ads/:adName" element={<FacebookAdDetailPage />} />
        <Route path="platforms/:slug" element={<PlatformPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
