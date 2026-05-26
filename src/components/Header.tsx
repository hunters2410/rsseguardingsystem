import { useState, useEffect, useCallback } from 'react';
import { Menu, Bell, User as UserIcon, LogOut, Settings as SettingsIcon, Shield,
         ChevronDown, Home, Power, RefreshCw, Cpu, AlertTriangle,
         Radio, Play, Square } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

type HeaderProps = {
    onMenuClick: () => void;
};

type ServerStatus = 'online' | 'offline' | 'restarting' | 'unknown';

export default function Header({ onMenuClick }: HeaderProps) {
    const { user, role, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [showServerMenu, setShowServerMenu] = useState(false);
    const [showStreamMenu, setShowStreamMenu] = useState(false);
    const [serverStatus, setServerStatus] = useState<ServerStatus>('unknown');
    const [streamStatus, setStreamStatus] = useState<'online' | 'offline' | 'starting' | 'stopping' | 'unknown'>('unknown');
    const [actionLoading, setActionLoading] = useState<'restart' | 'shutdown' | null>(null);
    const [streamActionLoading, setStreamActionLoading] = useState<'start' | 'stop' | null>(null);
    const [lastResult, setLastResult] = useState<string>('');
    const [lastStreamResult, setLastStreamResult] = useState<string>('');
    const location = useLocation();
    const navigate = useNavigate();

    // Map paths to display titles
    const getTitle = (path: string) => {
        const segments: Record<string, string> = {
            '/': 'Dashboard Overview',
            '/cameras': 'Camera Management',
            '/servers': 'AI Servers',
            '/models': 'AI Models',
            '/monitoring': 'Live Monitoring',
            '/events': 'Security Events',
            '/training': 'Training Datasets',
            '/manual': 'Setup Guide',
            '/settings': 'System Settings',
            '/zones': 'Zones & Boundaries',
            '/alert-config': 'Alert Configurations',
            '/plates': 'License Plate Logs'
        };
        return segments[path] || 'Real Star Security';
    };

    // Poll AI server status every 15s
    const fetchServerStatus = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('ai_servers')
                .select('status')
                .order('updated_at', { ascending: false })
                .limit(1)
                .single();
            if (data) setServerStatus(data.status as ServerStatus);
        } catch {
            setServerStatus('unknown');
        }
    }, []);

    // Poll MediaMTX status every 15s by checking if it recently responded
    // We can't call localhost:9997 from browser directly (CORS), so we use
    // a lightweight Supabase command ping pattern — post a status_check and read result.
    // Simpler: just track it via the last command result + optimistic state.
    const fetchStreamingStatus = useCallback(async () => {
        // Read mediamtx status from a dedicated row in system_state if you have one,
        // otherwise fall back to checking the last streaming command result
        try {
            const { data } = await supabase
                .from('system_commands')
                .select('command_type, status, result, created_at')
                .in('command_type', ['start_streaming_server', 'stop_streaming_server'])
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (data) {
                if (data.command_type === 'start_streaming_server' &&
                    data.result?.toLowerCase().includes('success')) {
                    setStreamStatus('online');
                } else if (data.command_type === 'stop_streaming_server' &&
                    data.result?.toLowerCase().includes('stopped')) {
                    setStreamStatus('offline');
                }
            }
        } catch { /* no commands yet — leave as unknown */ }
    }, []);

    useEffect(() => {
        fetchServerStatus();
        fetchStreamingStatus();
        const interval = setInterval(() => {
            fetchServerStatus();
            fetchStreamingStatus();
        }, 15000);
        return () => clearInterval(interval);
    }, [fetchServerStatus, fetchStreamingStatus]);

    const sendServerCommand = async (commandType: 'restart_server' | 'shutdown_server') => {
        const label = commandType === 'restart_server' ? 'restart' : 'shutdown';
        setActionLoading(label as 'restart' | 'shutdown');
        setShowServerMenu(false);

        try {
            const { data, error } = await supabase.from('system_commands').insert({
                command_type: commandType,
                status: 'pending',
                payload: { source: 'header_button', triggered_by: user?.email }
            }).select().single();

            if (error) throw error;

            const loadingId = toast.loading(
                commandType === 'restart_server'
                    ? '🔄 Restart command sent — server will reconnect in ~15s...'
                    : '🛑 Shutdown command sent — waiting for server to stop...'
            );

            // Optimistically update status
            setServerStatus(commandType === 'restart_server' ? 'restarting' : 'offline');

            // Poll for command completion
            let attempts = 0;
            const poll = setInterval(async () => {
                attempts++;
                const { data: cmdData } = await supabase
                    .from('system_commands')
                    .select('status, result')
                    .eq('id', data.id)
                    .single();

                if (cmdData?.status === 'completed') {
                    clearInterval(poll);
                    toast.dismiss(loadingId);
                    toast.success(
                        commandType === 'restart_server'
                            ? '✅ Server restarting — streams will reconnect shortly'
                            : '✅ Server shut down successfully'
                    );
                    setLastResult(cmdData.result || '');
                    setActionLoading(null);
                    // Refresh status after a delay
                    setTimeout(fetchServerStatus, 8000);
                } else if (cmdData?.status === 'failed' || attempts > 20) {
                    clearInterval(poll);
                    toast.dismiss(loadingId);
                    toast.error(
                        cmdData?.result || 'Command timed out. Is the AI server running?'
                    );
                    setActionLoading(null);
                    fetchServerStatus();
                }
            }, 1500);
        } catch (err: any) {
            toast.error(`Failed to send command: ${err.message || err}`);
            setActionLoading(null);
        }
    };

    const sendStreamingCommand = async (commandType: 'start_streaming_server' | 'stop_streaming_server') => {
        const isStart = commandType === 'start_streaming_server';
        setStreamActionLoading(isStart ? 'start' : 'stop');
        setShowStreamMenu(false);
        try {
            const { data, error } = await supabase.from('system_commands').insert({
                command_type: commandType,
                status: 'pending',
                payload: { source: 'header_button', triggered_by: user?.email }
            }).select().single();
            if (error) throw error;
            const loadingId = toast.loading(
                isStart ? '▶️ Starting streaming server...' : '⏹️ Stopping streaming server...'
            );
            setStreamStatus(isStart ? 'starting' : 'stopping');
            let attempts = 0;
            const poll = setInterval(async () => {
                attempts++;
                const { data: cmdData } = await supabase
                    .from('system_commands').select('status, result').eq('id', data.id).single();
                if (cmdData?.status === 'completed') {
                    clearInterval(poll);
                    toast.dismiss(loadingId);
                    const ok = !cmdData.result?.toLowerCase().includes('not found') &&
                               !cmdData.result?.toLowerCase().includes('could not');
                    if (ok) {
                        toast.success(isStart ? '✅ Streaming server started!' : '✅ Streaming server stopped!');
                        setStreamStatus(isStart ? 'online' : 'offline');
                    } else {
                        toast.error(cmdData.result || 'Command completed with issues');
                        setStreamStatus('unknown');
                    }
                    setLastStreamResult(cmdData.result || '');
                    setStreamActionLoading(null);
                } else if (cmdData?.status === 'failed' || attempts > 25) {
                    clearInterval(poll);
                    toast.dismiss(loadingId);
                    toast.error(cmdData?.result || 'Timed out. Is the AI server running?');
                    setStreamStatus('unknown');
                    setStreamActionLoading(null);
                }
            }, 1000);
        } catch (err: any) {
            toast.error(`Failed: ${err.message || err}`);
            setStreamActionLoading(null);
        }
    };

    const statusColors: Record<ServerStatus, { dot: string; label: string; text: string }> = {
        online:     { dot: 'bg-green-400 animate-pulse', label: 'Online',     text: 'text-green-600 dark:text-green-400' },
        offline:    { dot: 'bg-red-500',                 label: 'Offline',    text: 'text-red-500 dark:text-red-400' },
        restarting: { dot: 'bg-yellow-400 animate-pulse',label: 'Restarting', text: 'text-yellow-500 dark:text-yellow-400' },
        unknown:    { dot: 'bg-slate-400',               label: 'Unknown',    text: 'text-slate-400' },
    };
    const sc = statusColors[serverStatus];

    const streamColors = {
        online:   { dot: 'bg-green-400 animate-pulse',  label: 'Online',   text: 'text-green-600 dark:text-green-400'   },
        offline:  { dot: 'bg-red-500',                  label: 'Offline',  text: 'text-red-500 dark:text-red-400'       },
        starting: { dot: 'bg-yellow-400 animate-pulse', label: 'Starting', text: 'text-yellow-500 dark:text-yellow-400' },
        stopping: { dot: 'bg-orange-400 animate-pulse', label: 'Stopping', text: 'text-orange-500 dark:text-orange-400' },
        unknown:  { dot: 'bg-slate-400',                label: 'Unknown',  text: 'text-slate-400'                       },
    };
    const ssc = streamColors[streamStatus];

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
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white hidden md:block">{getTitle(location.pathname)}</h2>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white md:hidden">EG</h2>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">

                    {/* ── Streaming Server Control ── */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowStreamMenu(s => !s); setShowServerMenu(false); }}
                            disabled={!!streamActionLoading}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold
                                ${ streamStatus === 'online'
                                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/40'
                                    : streamStatus === 'offline'
                                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40'
                                    : streamStatus === 'starting' || streamStatus === 'stopping'
                                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                            title="Streaming Server Controls (MediaMTX)"
                        >
                            {streamActionLoading ? (
                                <RefreshCw size={13} className="animate-spin" />
                            ) : (
                                <span className={`w-2 h-2 rounded-full ${ssc.dot}`} />
                            )}
                            <Radio size={13} className="hidden sm:block" />
                            <span className="hidden sm:block">Stream</span>
                            <span className={`hidden md:block font-bold ${ssc.text}`}>{ssc.label}</span>
                            <ChevronDown size={12} />
                        </button>

                        {showStreamMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowStreamMenu(false)} />
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 overflow-hidden">

                                    {/* Status banner */}
                                    <div className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3
                                        ${streamStatus === 'online' ? 'bg-green-50 dark:bg-green-900/20'
                                        : streamStatus === 'offline' ? 'bg-red-50 dark:bg-red-900/20'
                                        : 'bg-yellow-50 dark:bg-yellow-900/20'}`}>
                                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ssc.dot}`} />
                                        <div>
                                            <p className={`text-xs font-bold ${ssc.text}`}>MediaMTX {ssc.label}</p>
                                            <p className="text-[10px] text-slate-400">RTSP · HLS · WebRTC · Port 8554</p>
                                            {lastStreamResult && (
                                                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">{lastStreamResult}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-2 space-y-1">
                                        <button
                                            onClick={() => sendStreamingCommand('start_streaming_server')}
                                            disabled={!!streamActionLoading || streamStatus === 'online' || streamStatus === 'starting'}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200
                                                hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700 dark:hover:text-green-400
                                                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                                                <Play size={14} className="text-green-600 dark:text-green-400" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-bold">Start Streaming</p>
                                                <p className="text-[10px] text-slate-400">Launch MediaMTX server</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (window.confirm('⚠️ Stop the streaming server? Live camera feeds will disconnect.')) {
                                                    sendStreamingCommand('stop_streaming_server');
                                                }
                                            }}
                                            disabled={!!streamActionLoading || streamStatus === 'offline' || streamStatus === 'stopping'}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200
                                                hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400
                                                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                                                <Square size={14} className="text-red-600 dark:text-red-400" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-bold">Stop Streaming</p>
                                                <p className="text-[10px] text-slate-400">Terminates MediaMTX process</p>
                                            </div>
                                        </button>
                                    </div>

                                    <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-2">
                                        <p className="text-[10px] text-slate-400">Requires AI server online to relay commands</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── AI Server Control ── */}
                    <div className="relative">
                        <button
                            onClick={() => setShowServerMenu(s => !s)}
                            disabled={!!actionLoading}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold
                                ${serverStatus === 'online'
                                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/40'
                                    : serverStatus === 'restarting'
                                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400'
                                    : serverStatus === 'offline'
                                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                                }
                                disabled:opacity-60 disabled:cursor-not-allowed`}
                            title="AI Server Controls"
                        >
                            {actionLoading ? (
                                <RefreshCw size={13} className="animate-spin" />
                            ) : (
                                <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                            )}
                            <Cpu size={13} className="hidden sm:block" />
                            <span className="hidden sm:block">AI Server</span>
                            <span className={`hidden md:block font-bold ${sc.text}`}>{sc.label}</span>
                            <ChevronDown size={12} />
                        </button>

                        {showServerMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowServerMenu(false)} />
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 overflow-hidden">

                                    {/* Status banner */}
                                    <div className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3
                                        ${serverStatus === 'online' ? 'bg-green-50 dark:bg-green-900/20'
                                        : serverStatus === 'offline' ? 'bg-red-50 dark:bg-red-900/20'
                                        : 'bg-yellow-50 dark:bg-yellow-900/20'}`}>
                                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                                        <div>
                                            <p className={`text-xs font-bold ${sc.text}`}>AI Server {sc.label}</p>
                                            {lastResult && (
                                                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{lastResult}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Controls */}
                                    <div className="p-2 space-y-1">
                                        <button
                                            onClick={() => sendServerCommand('restart_server')}
                                            disabled={!!actionLoading || serverStatus === 'restarting'}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200
                                                hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-400
                                                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                                                <RefreshCw size={14} className={`text-blue-600 dark:text-blue-400 ${actionLoading === 'restart' ? 'animate-spin' : ''}`} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-bold">Restart Server</p>
                                                <p className="text-[10px] text-slate-400">Reloads all streams (~15s)</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (window.confirm('⚠️ Shut down the AI server? All camera inference will stop until manually restarted.')) {
                                                    sendServerCommand('shutdown_server');
                                                }
                                            }}
                                            disabled={!!actionLoading || serverStatus === 'offline'}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200
                                                hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400
                                                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                                                <Power size={14} className={`text-red-600 dark:text-red-400 ${actionLoading === 'shutdown' ? 'animate-pulse' : ''}`} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-bold">Shutdown Server</p>
                                                <p className="text-[10px] text-slate-400">Stops all AI inference</p>
                                            </div>
                                        </button>

                                        {serverStatus === 'offline' && (
                                            <div className="mx-3 mt-2 mb-1 flex items-start gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                                                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                                                <span>Server is offline. Start it manually from the server machine or via the AI Servers page.</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-2">
                                        <button
                                            onClick={() => { navigate('/servers'); setShowServerMenu(false); }}
                                            className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                                        >
                                            View AI Servers page →
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Home Link */}
                    <button
                        onClick={() => navigate('/')}
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
                            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white">
                                <UserIcon size={18} />
                            </div>
                            <div className="hidden md:block text-left">
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 capitalize">
                                    {role ? (role === 'admin' ? 'System Administrator' : 'System Viewer') : 'Verifying Profile...'}
                                </p>
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
                                        onClick={() => { navigate('/settings'); setIsProfileOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <UserIcon size={16} /> Profile
                                    </button>
                                    <button
                                        onClick={() => { navigate('/settings'); setIsProfileOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                    >
                                        <Shield size={16} /> Change Password
                                    </button>
                                    <button
                                        onClick={() => { navigate('/settings'); setIsProfileOpen(false); }}
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
