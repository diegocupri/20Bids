import { HashRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';

// Lazy load heavy components
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const UploadPage = lazy(() => import('./components/UploadPage').then(m => ({ default: m.UploadPage })));
const AnalysisPage = lazy(() => import('./pages/Analysis').then(m => ({ default: m.AnalysisPage })));
const TradingPage = lazy(() => import('./pages/TradingPage').then(m => ({ default: m.TradingPage })));
const GraphsPage = lazy(() => import('./pages/GraphsPage').then(m => ({ default: m.GraphsPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));

// Loading spinner component
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-text-secondary text-sm">Loading...</span>
      </div>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AuthenticatedLayout><Dashboard /></AuthenticatedLayout>} />
            <Route path="/analysis" element={<AuthenticatedLayout><AnalysisPage /></AuthenticatedLayout>} />
            <Route path="/trading" element={<AuthenticatedLayout><TradingPage /></AuthenticatedLayout>} />
            <Route path="/graphs" element={<AuthenticatedLayout><GraphsPage /></AuthenticatedLayout>} />
            <Route path="/upload" element={<AuthenticatedLayout><UploadPage /></AuthenticatedLayout>} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </HashRouter>
  );
}

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  // TEMPORARILY DISABLED FOR TESTING
  return <>{children}</>;
}

export default App;
