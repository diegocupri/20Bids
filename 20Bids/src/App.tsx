import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './components/Dashboard';
import { UserDataProvider } from './context/UserDataContext';

function App() {
  return (
    <UserDataProvider>
      <MainLayout>
        <Dashboard /> {/* selectedDate will be injected by MainLayout */}
      </MainLayout>
    </UserDataProvider>
  );
}

export default App;
