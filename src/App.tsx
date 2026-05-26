import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import EventNotifications from './components/EventNotifications';
import Manual from './components/Manual';
import ZoneSettings from './components/ZoneSettings';
import AlertConfiguration from './components/AlertConfiguration';
import NumberPlatesLog from './components/NumberPlatesLog';
import FaceLibrary from './components/FaceLibrary';
import { ErrorBoundary } from './components/ErrorBoundary';

function AppContent() {
  const { user, loading } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(() => {
    const saved = localStorage.getItem('sidebarMinimized');
    return saved === 'true';
  });
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebarMinimized', sidebarMinimized.toString());
  }, [sidebarMinimized]);

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
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMinimized={sidebarMinimized}
        onToggleMinimize={() => setSidebarMinimized(!sidebarMinimized)}
      />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
        />
        <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-100 dark:bg-slate-900">
          <Routes>
            <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/cameras" element={<ErrorBoundary><CameraManagement /></ErrorBoundary>} />
            <Route path="/servers" element={<ErrorBoundary><AIServerManagement /></ErrorBoundary>} />
            <Route path="/models" element={<ErrorBoundary><AIModelManagement /></ErrorBoundary>} />
            <Route path="/monitoring" element={<ErrorBoundary><LiveMonitoring /></ErrorBoundary>} />
            <Route path="/events" element={<ErrorBoundary><EventsMonitoring /></ErrorBoundary>} />
            <Route path="/training" element={<ErrorBoundary><TrainingManagement /></ErrorBoundary>} />
            <Route path="/manual" element={<ErrorBoundary><Manual /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            <Route path="/zones" element={<ErrorBoundary><ZoneSettings /></ErrorBoundary>} />
            <Route path="/alert-config" element={<ErrorBoundary><AlertConfiguration /></ErrorBoundary>} />
            <Route path="/plates" element={<ErrorBoundary><NumberPlatesLog /></ErrorBoundary>} />
            <Route path="/face-library" element={<ErrorBoundary><FaceLibrary /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <Footer />
        <EventNotifications />
      </main>
    </div>
  );
}



function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
          <Toaster position="top-right" richColors theme="system" closeButton />
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
