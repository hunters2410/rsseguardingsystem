import { useEffect, useState } from 'react';
import { Camera, Server, Brain, AlertCircle, Activity, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SimpleBarChart, SimplePieChart } from './DashboardCharts';

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

  const [weeklyData, setWeeklyData] = useState<{ label: string; value: number }[]>([]);
  const [distributionData, setDistributionData] = useState<{ label: string; value: number; color: string }[]>([]);

  useEffect(() => {
    loadStats();
    loadChartData();
    const interval = setInterval(() => {
      loadStats();
      loadChartData();
    }, 10000);
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

  const loadChartData = async () => {
    // 1. Weekly Activity (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: recentEvents } = await supabase
      .from('events')
      .select('created_at, event_type')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (recentEvents) {
      // Process Weekly Data
      const daysMap = new Map<string, number>();
      // Init last 7 days
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short' });
        daysMap.set(dateStr, 0); // Default 0
      }

      const typeMap = new Map<string, number>();

      recentEvents.forEach(e => {
        const dateStr = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'short' });
        if (daysMap.has(dateStr)) {
          // Re-creating map keys order is tricky if not sorted, but for bar chart we want chronological usually.
          // Or simplified: just use the map.
          // We actually want to count UP to today.
        }

        // Count distribution
        const type = e.event_type || 'Unknown';
        typeMap.set(type, (typeMap.get(type) || 0) + 1);
      });

      // Re-construct chronological array
      const chartData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short' });

        // Count matching events
        const count = recentEvents.filter(e => {
          const eDate = new Date(e.created_at);
          return eDate.getDate() === d.getDate() && eDate.getMonth() === d.getMonth();
        }).length;

        chartData.push({ label: dateStr, value: count });
      }
      setWeeklyData(chartData);

      // Process Distribution Data
      const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      const distData = Array.from(typeMap.entries()).map(([label, value], idx) => ({
        label: label.replace('_', ' '),
        value,
        color: COLORS[idx % COLORS.length]
      })).sort((a, b) => b.value - a.value); // Sort by highest

      setDistributionData(distData);
    }
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

      {/* Graphs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="Weekly Activity"
          data={weeklyData}
          color="#ef4444"
        />
        <SimplePieChart
          title="Event Distribution (7 Days)"
          data={distributionData}
        />
      </div>

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
