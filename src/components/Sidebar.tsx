import { Camera, Server, Brain, Bell, Monitor, Activity, X, ChevronLeft, ChevronRight, Database, Settings, Book, ScanLine, Car, Users, LayoutDashboard, ShieldAlert } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
};

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
      { id: 'monitoring', label: 'Live Monitor',  icon: Monitor },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'cameras', label: 'Cameras',    icon: Camera  },
      { id: 'servers', label: 'AI Servers', icon: Server  },
      { id: 'models',  label: 'AI Models',  icon: Brain   },
    ],
  },
  {
    label: 'AI Detection',
    items: [
      { id: 'zones',        label: 'Zones & Boundaries',   icon: ScanLine    },
      { id: 'alert-config', label: 'Alert Configuration',  icon: Bell        },
      { id: 'face-library', label: 'Face & Color Library', icon: Users       },
      { id: 'training',     label: 'Training & Datasets',  icon: Database    },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'events',  label: 'Events',         icon: Activity      },
      { id: 'plates',  label: 'License Plates', icon: Car           },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'manual',   label: 'Setup Guide', icon: Book     },
      { id: 'settings', label: 'Settings',    icon: Settings },
    ],
  },
];

export default function Sidebar({ isOpen, onClose, isMinimized, onToggleMinimize }: SidebarProps) {
  const location = useLocation();
  const activeView = location.pathname.substring(1) || 'dashboard';

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
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 relative h-14 flex items-center justify-between">
          {!isMinimized && (
            <div className="flex items-center gap-2">
              <img
                src="/Real Star Security.jpg"
                alt="Real Star Security"
                className="h-10 w-auto object-contain"
              />
              <span className="font-semibold text-sm text-slate-900 dark:text-white">E-Guarding</span>
            </div>
          )}
          {isMinimized && (
            <div className="w-10 h-10 mx-auto overflow-hidden rounded-lg">
              <img
                src="/Real Star Security.jpg"
                alt="Real Star Security"
                className="w-full h-full object-cover"
              />
            </div>
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              {/* Category label — hidden when minimised */}
              {!isMinimized && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 select-none">
                  {group.label}
                </p>
              )}
              {isMinimized && (
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (item.id === 'dashboard' && activeView === '');
                return (
                  <Link
                    key={item.id}
                    to={item.id === 'dashboard' ? '/' : `/${item.id}`}
                    onClick={onClose}
                    title={isMinimized ? item.label : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 transition-all text-sm ${
                      isActive
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    } ${isMinimized ? 'justify-center' : ''}`}
                  >
                    <Icon size={17} />
                    {!isMinimized && <span className="font-medium text-[14px]">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          {!isMinimized && <p className="text-xs text-slate-500 text-center">v1.2.0 • Real Star Security</p>}
        </div>
      </div>
    </>
  );
}
