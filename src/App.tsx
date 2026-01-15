import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CameraManagement from './components/CameraManagement';
import AIServerManagement from './components/AIServerManagement';
import AIModelManagement from './components/AIModelManagement';
import LiveMonitoring from './components/LiveMonitoring';
import EventsMonitoring from './components/EventsMonitoring';
import Login from './components/Login';
import Signup from './components/Signup';
import Footer from './components/Footer';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(() => {
    const saved = localStorage.getItem('sidebarMinimized');
    return saved === 'true';
  });
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebarMinimized', sidebarMinimized.toString());
  }, [sidebarMinimized]);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'cameras':
        return <CameraManagement />;
      case 'servers':
        return <AIServerManagement />;
      case 'models':
        return <AIModelManagement />;
      case 'monitoring':
        return <LiveMonitoring />;
      case 'events':
        return <EventsMonitoring />;
      default:
        return <Dashboard />;
    }
  };

  const handleViewChange = (view: string) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (showSignup) {
      return <Signup onToggleLogin={() => setShowSignup(false)} />;
    }
    return <Login onToggleSignup={() => setShowSignup(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMinimized={sidebarMinimized}
        onToggleMinimize={() => setSidebarMinimized(!sidebarMinimized)}
      />
      <main className="flex-1 flex flex-col">
        <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <Menu size={24} />
          </button>
        </header>
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {renderView()}
        </div>
        <Footer />
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
