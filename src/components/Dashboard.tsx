import { useEffect, useState, useRef } from 'react';
import { Camera, Server, Brain, Activity, Bell, X } from 'lucide-react';
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

type EventNotification = {
  id: string;
  event_type: string;
  confidence: number;
  camera_id: string;
  snapshot_url?: string;
  created_at: string;
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
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const lastEventIdRef = useRef<string>('');

  useEffect(() => {
    loadStats();
    loadChartData();
    loadCountingData();
    checkForNewEvents(); // Initial check

    const statsInterval = setInterval(() => {
      loadStats();
      loadChartData();
    }, 10000);

    // Check for new events more frequently
    const eventsInterval = setInterval(checkForNewEvents, 3000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(eventsInterval);
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

  const playBeep = () => {
    try {
      // Create audio context and play beep sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.log('Could not play beep:', error);
    }
  };

  const checkForNewEvents = async () => {
    try {
      const { data: latestEvent } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('Checking for new events...', {
        latestEventId: latestEvent?.id,
        lastEventId: lastEventIdRef.current,
        isNew: latestEvent && latestEvent.id !== lastEventIdRef.current
      });

      if (latestEvent && latestEvent.id !== lastEventIdRef.current) {
        // New event detected!
        console.log('🎯 New event detected!', latestEvent);

        if (lastEventIdRef.current) { // Only notify if we've already loaded (not first load)
          console.log('Playing beep and showing notification...');
          playBeep();
          setNotifications(prev => {
            const updated = [latestEvent, ...prev].slice(0, 5);
            console.log('Updated notifications:', updated);
            return updated;
          });
        }
        lastEventIdRef.current = latestEvent.id;
      }
    } catch (error) {
      console.log('Error checking events or no events:', error);
    }
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getEventTypeEmoji = (type: string) => {
    switch (type) {
      case 'person_detection': return '👤';
      case 'vehicle_detection': return '🚗';
      case 'intrusion_detection': return '⚠️';
      case 'weapon_detection': return '🔫';
      case 'fire_detection': return '🔥';
      case 'motion_detection': return '🏃';
      default: return '📷';
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



      {/* Event Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm pointer-events-none">
        {notifications.map((notification, index) => (
          <div
            key={notification.id}
            className="pointer-events-auto bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 border-red-500 overflow-hidden animate-in slide-in-from-right duration-300"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="animate-pulse" />
                <span className="font-bold text-sm">New Detection!</span>
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
                className="hover:bg-white/20 rounded-full p-1 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="text-4xl">{getEventTypeEmoji(notification.event_type)}</div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 dark:text-white text-lg">
                    {notification.event_type.replace('_', ' ').toUpperCase()}
                  </h4>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 space-y-1">
                    <p>Confidence: <span className="font-semibold text-red-600">{notification.confidence}%</span></p>
                    <p>Camera ID: {notification.camera_id.substring(0, 8)}...</p>
                    <p className="text-slate-500">{new Date(notification.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              </div>

              {notification.snapshot_url && (
                <img
                  src={notification.snapshot_url}
                  alt="Event snapshot"
                  className="w-full h-24 object-cover rounded-lg mt-3 border border-slate-200 dark:border-slate-700"
                />
              )}
            </div>

            {/* Progress bar for auto-dismiss */}
            <div className="relative h-1 bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="absolute inset-0 bg-red-600 animate-shrink-width"
                style={{ animation: 'shrinkWidth 8s linear forwards' }}
                onAnimationEnd={() => dismissNotification(notification.id)}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
