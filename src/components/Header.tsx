import { useState } from 'react';
import { Menu, Bell, User as UserIcon, LogOut, Settings as SettingsIcon, Shield, ChevronDown, Home } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

type HeaderProps = {
    onMenuClick: () => void;
    title: string;
    onNavigate: (view: string) => void;
};

export default function Header({ onMenuClick, title, onNavigate }: HeaderProps) {
    const { user, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    return (
        <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm h-16">
            <div className="flex items-center justify-between px-4 h-full">

                {/* Left: Menu & Title */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onMenuClick}
                        className="lg:hidden text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
                    >
                        <Menu size={24} />
                    </button>
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white hidden md:block">{title}</h2>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white md:hidden">EG</h2>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-4">
                    {/* Home Link */}
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-full dark:text-slate-400 dark:hover:bg-slate-800 hidden md:block"
                        title="Go to Dashboard"
                    >
                        <Home size={20} />
                    </button>

                    {/* Theme Switch */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-full dark:text-slate-400 dark:hover:bg-slate-800"
                        title="Toggle Theme"
                    >
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>

                    {/* Notifications */}
                    <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full dark:text-slate-400 dark:hover:bg-slate-800 relative">
                        <Bell size={20} />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                    </button>

                    {/* Profile Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-sm">
                                {user?.email?.[0].toUpperCase() || 'U'}
                            </div>
                            <div className="hidden md:block text-left">
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Admin</p>
                            </div>
                            <ChevronDown size={14} className="text-slate-400" />
                        </button>

                        {isProfileOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)}></div>
                                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-20 overflow-hidden py-1">
                                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">System Administrator</p>
                                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                                    </div>

                                    <button
                                        onClick={() => {
                                            onNavigate('settings');
                                            setIsProfileOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <UserIcon size={16} /> Profile
                                    </button>
                                    <button
                                        onClick={() => {
                                            onNavigate('settings');
                                            setIsProfileOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <Shield size={16} /> Change Password
                                    </button>
                                    <button
                                        onClick={() => {
                                            onNavigate('settings');
                                            setIsProfileOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <SettingsIcon size={16} /> Settings
                                    </button>

                                    <div className="border-t border-slate-100 dark:border-slate-700 mt-1">
                                        <button
                                            onClick={signOut}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                                        >
                                            <LogOut size={16} /> Sign Out
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                </div>
            </div>
        </header>
    );
}
