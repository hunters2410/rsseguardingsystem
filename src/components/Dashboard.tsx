import { useEffect, useState } from 'react';
import { Camera, Server, Brain, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
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
    loadCountingData();

    const statsInterval = setInterval(() => {
      loadStats();
      loadChartData();
    }, 10000);

    return () => {
      clearInterval(statsInterval);
    };
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

  const loadCountingData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: events } = await supabase
        .from('events')
        .select('event_type, created_at')
        .gte('created_at', today.toISOString());

      if (events) {
        const hourly = new Array(24).fill(0);
        events.forEach(e => {
          const hour = new Date(e.created_at).getHours();
          hourly[hour]++;
        });

        // Counting data loaded but state removed to fix layout
      }
    } catch (error) {
      console.error('Error loading counting data:', error);
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                    {card.title}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                    {card.value}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {card.subtitle}
                  </p>
                </div>
                <div className={`p-4 rounded-xl ${card.color} text-white shadow-lg`}>
                  <Icon size={24} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="Weekly Detection Activity"
          data={weeklyData}
          color="#ef4444"
        />
        <SimplePieChart
          title="Event Distribution (7 Days)"
          data={distributionData}
        />
      </div>
    </div>
  );
}
