import { Camera, Server, Brain, Bell, Monitor, Activity, X, Sun, Moon, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

type SidebarProps = {
  activeView: string;
  onViewChange: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
};

export default function Sidebar({ activeView, onViewChange, isOpen, onClose, isMinimized, onToggleMinimize }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Monitor },
    { id: 'cameras', label: 'Cameras', icon: Camera },
    { id: 'servers', label: 'AI Servers', icon: Server },
    { id: 'models', label: 'AI Models', icon: Brain },
    { id: 'events', label: 'Events', icon: Bell },
    { id: 'monitoring', label: 'Live Monitor', icon: Activity },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-slate-900 dark:bg-slate-950 text-white h-screen flex flex-col transform transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isMinimized ? 'w-20' : 'w-64'
        }`}
      >
      <div className="p-6 border-b border-slate-800 dark:border-slate-700 relative">
        <button
          onClick={onClose}
          className="lg:hidden absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>
        <button
          onClick={onToggleMinimize}
          className="hidden lg:block absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          {isMinimized ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
        {!isMinimized && (
          <>
            <h1 className="text-2xl font-bold text-center text-red-500">E-Guarding</h1>
            <p className="text-xs text-center text-slate-400 mt-1">AI Video Analytics</p>
          </>
        )}
        {isMinimized && (
          <h1 className="text-xl font-bold text-center text-red-500">EG</h1>
        )}
      </div>

      <nav className="flex-1 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              title={isMinimized ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
                activeView === item.id
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-slate-300 hover:bg-slate-800 dark:hover:bg-slate-700'
              } ${
                isMinimized ? 'justify-center' : ''
              }`}
            >
              <Icon size={20} />
              {!isMinimized && <span className="font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 dark:border-slate-700 space-y-2">
        <button
          onClick={toggleTheme}
          title={isMinimized ? (theme === 'light' ? 'Dark Mode' : 'Light Mode') : undefined}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 dark:hover:bg-slate-700 transition-all ${
            isMinimized ? 'justify-center' : ''
          }`}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          {!isMinimized && <span className="font-medium">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>}
        </button>
        <button
          onClick={signOut}
          title={isMinimized ? 'Logout' : undefined}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-red-600 hover:text-white transition-all ${
            isMinimized ? 'justify-center' : ''
          }`}
        >
          <LogOut size={20} />
          {!isMinimized && <span className="font-medium">Logout</span>}
        </button>
        {!isMinimized && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-sm font-bold">RS</span>
            </div>
            <div>
              <p className="text-sm font-medium">Real Star Security</p>
              <p className="text-xs text-slate-400">System Admin</p>
            </div>
          </div>
        )}
        {isMinimized && (
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-sm font-bold">RS</span>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
