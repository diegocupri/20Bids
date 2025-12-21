import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Dashboard } from './components/Dashboard';
import { UploadPage } from './components/UploadPage';
import { AnalysisPage } from './pages/Analysis';

import { GraphsPage } from './pages/GraphsPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';


function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AuthenticatedLayout><Dashboard /></AuthenticatedLayout>} />
          <Route path="/analysis" element={<AuthenticatedLayout><AnalysisPage /></AuthenticatedLayout>} />
          <Route path="/graphs" element={<AuthenticatedLayout><GraphsPage /></AuthenticatedLayout>} />
          <Route path="/upload" element={<AuthenticatedLayout><UploadPage /></AuthenticatedLayout>} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
}

export default App;
