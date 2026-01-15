import { useEffect, useState } from 'react';
import { Camera, Server, Brain, AlertCircle, Activity, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Stats = {
  totalCameras: number;
  onlineCameras: number;
  totalServers: number;
  activeModels: number;
  recentEvents: number;
  unacknowledgedEvents: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalCameras: 0,
    onlineCameras: 0,
    totalServers: 0,
    activeModels: 0,
    recentEvents: 0,
    unacknowledgedEvents: 0,
  });

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    const [camerasRes, serversRes, modelsRes, eventsRes, unackEventsRes] = await Promise.all([
      supabase.from('cameras').select('status'),
      supabase.from('ai_servers').select('id'),
      supabase.from('ai_models').select('is_active').eq('is_active', true),
      supabase.from('events').select('id').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('events').select('id').eq('acknowledged', false),
    ]);

    setStats({
      totalCameras: camerasRes.data?.length || 0,
      onlineCameras: camerasRes.data?.filter((c) => c.status === 'online').length || 0,
      totalServers: serversRes.data?.length || 0,
      activeModels: modelsRes.data?.length || 0,
      recentEvents: eventsRes.data?.length || 0,
      unacknowledgedEvents: unackEventsRes.data?.length || 0,
    });
  };

  const statCards = [
    {
      title: 'Total Cameras',
      value: stats.totalCameras,
      subtitle: `${stats.onlineCameras} online`,
      icon: Camera,
      color: 'bg-blue-500',
    },
    {
      title: 'AI Servers',
      value: stats.totalServers,
      subtitle: 'Processing streams',
      icon: Server,
      color: 'bg-green-500',
    },
    {
      title: 'Active Models',
      value: stats.activeModels,
      subtitle: 'Deployed and running',
      icon: Brain,
      color: 'bg-purple-500',
    },
    {
      title: 'Recent Events',
      value: stats.recentEvents,
      subtitle: 'Last 24 hours',
      icon: Activity,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">E-Guarding Dashboard</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">AI-Powered CCTV Monitoring System</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium">System Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">{card.value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.subtitle}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="text-white" size={24} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stats.unacknowledgedEvents > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
            <div>
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-300">Unacknowledged Events</h3>
              <p className="text-red-700 dark:text-red-400">
                You have {stats.unacknowledgedEvents} unreviewed event{stats.unacknowledgedEvents !== 1 ? 's' : ''} requiring attention.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-600 dark:text-blue-400" />
            System Status
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-400">Camera Uptime</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {stats.totalCameras > 0 ? Math.round((stats.onlineCameras / stats.totalCameras) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{
                  width: `${stats.totalCameras > 0 ? (stats.onlineCameras / stats.totalCameras) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity size={20} className="text-purple-600 dark:text-purple-400" />
            AI Processing
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-400">Active AI Models</span>
              <span className="font-semibold text-slate-900 dark:text-white">{stats.activeModels}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-400">Event Detection Rate</span>
              <span className="font-semibold text-green-600 dark:text-green-400">Normal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
