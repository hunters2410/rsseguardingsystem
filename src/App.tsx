import { useState, useEffect } from 'react';
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
import TrainingManagement from './components/TrainingManagement';
import Header from './components/Header';
import Settings from './components/Settings';
import EventNotification from './components/EventNotification';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState(() => {
    return localStorage.getItem('activeView') || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('activeView', activeView);
  }, [activeView]);

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
      case 'training':
        return <TrainingManagement />;
      case 'settings':
        return <Settings />;
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
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          title={activeView === 'dashboard' ? 'Overview' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
          onNavigate={handleViewChange}
        />
        <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-100 dark:bg-slate-900">
          {renderView()}
        </div>
        <Footer />
        <EventNotification />
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
