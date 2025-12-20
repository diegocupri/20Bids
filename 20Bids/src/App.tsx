import { HashRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { UploadPage } from './components/UploadPage';
import { AnalysisPage } from './pages/Analysis';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/upload" element={<UploadPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
