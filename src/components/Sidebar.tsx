import { Camera, Server, Brain, Bell, Monitor, Activity, X, ChevronLeft, ChevronRight, Database, Settings } from 'lucide-react';

type SidebarProps = {
  activeView: string;
  onViewChange: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
};

export default function Sidebar({ activeView, onViewChange, isOpen, onClose, isMinimized, onToggleMinimize }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Monitor },
    { id: 'cameras', label: 'Cameras', icon: Camera },
    { id: 'servers', label: 'AI Servers', icon: Server },
    { id: 'models', label: 'AI Models', icon: Brain },
    { id: 'training', label: 'Training & Datasets', icon: Database },
    { id: 'events', label: 'Events', icon: Bell },
    { id: 'monitoring', label: 'Live Monitor', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
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
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-slate-200 dark:bg-slate-950 dark:border-none text-slate-900 dark:text-white h-screen flex flex-col transform transition-all duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } ${isMinimized ? 'w-20' : 'w-64'
          }`}
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 relative h-16 flex items-center justify-between">
          {!isMinimized && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center font-bold text-white">EG</div>
              <span className="font-bold text-lg text-slate-900 dark:text-white">E-Guarding</span>
            </div>
          )}
          {isMinimized && (
            <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center font-bold text-white mx-auto">EG</div>
          )}

          <button
            onClick={onClose}
            className="lg:hidden absolute top-4 right-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
          >
            <X size={24} />
          </button>
          <button
            onClick={onToggleMinimize}
            className="hidden lg:block absolute top-1/2 -right-3 transform -translate-y-1/2 bg-white dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white z-50 shadow-sm"
          >
            {isMinimized ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                title={isMinimized ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${activeView === item.id
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  } ${isMinimized ? 'justify-center' : ''
                  }`}
              >
                <Icon size={20} />
                {!isMinimized && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          {!isMinimized && <p className="text-xs text-slate-500 text-center">v1.2.0 • Real Star Security</p>}
        </div>
      </div>
    </>
  );
}
