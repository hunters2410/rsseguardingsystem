import { useEffect, useState, useRef } from 'react';
import { Monitor, Maximize2, AlertCircle, Grid, LayoutGrid, Search, Activity, TrendingUp, Brain, Zap, VideoOff } from 'lucide-react';
import { supabase, type Camera, type Event } from '../lib/supabase';
import StreamPlayer from './StreamPlayer';
import { toast } from 'sonner';

export default function LiveMonitoring() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const camerasRef = useRef<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gridCols, setGridCols] = useState(4); // Default to 4 columns
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ totalToday: 0, avgConfidence: 0, topType: '' });
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadCameras();
    loadEvents(); // Initial load

    // Set up Realtime Subscription for instant updates
    const channel = supabase
      .channel('live-monitoring')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        (payload) => {
          const newEvent = payload.new as Event;
          setEvents((prev) => [newEvent, ...prev].slice(0, 20)); // Prepend and keep size

          // Trigger Popup Alert
          const matchedCam = camerasRef.current.find(c => c.id === newEvent.camera_id);
          const camName = matchedCam?.name || 'Unknown Camera';

          toast.error(`SECURITY ALERT: ${newEvent.event_type.replace('_', ' ').toUpperCase()}`, {
            description: `Detected on ${camName} at ${new Date().toLocaleTimeString()}`,
            duration: 5000,
          });

          // Update local stats immediately
          setStats((prev) => ({
            ...prev,
            totalToday: prev.totalToday + 1,
            // Recalculating avg exactly is hard without full history, but approximation is fine for valid feedback until next poll
            avgConfidence: Math.round(((prev.avgConfidence * prev.totalToday) + (newEvent.confidence || 0)) / (prev.totalToday + 1))
          }));
        }
      )
      .subscribe();

    // Keep polling as backup for consistency checks
    const interval = setInterval(() => {
      loadEvents();
      loadCameras(); // Also refresh camera status periodically
    }, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCameras = async () => {
    const { data: cams } = await supabase.from('cameras').select('*').order('name');
    if (cams) {
      setCameras(cams);
      camerasRef.current = cams;

      // Fetch assignment counts
      const { data: assignments } = await supabase.from('camera_models').select('camera_id');
      if (assignments) {
        const counts = assignments.reduce((acc, curr) => {
          acc[curr.camera_id] = (acc[curr.camera_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        setModelCounts(counts);
      }
    }
  };

  const loadEvents = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('events')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setEvents(data);

      // Calculate stats
      const total = data.length;
      const avgConf = total > 0 ? data.reduce((sum, e) => sum + (e.confidence || 0), 0) / total : 0;

      const typeCounts = data.reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topType = Object.keys(typeCounts).reduce((a, b) =>
        typeCounts[a] > typeCounts[b] ? a : b, '');

      setStats({ totalToday: total, avgConfidence: Math.round(avgConf), topType });
    }
  };

  const getCameraName = (cameraId: string) => {
    const camera = cameras.find(c => c.id === cameraId);
    return camera?.name || 'Unknown';
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'person_detection': return '👤';
      case 'vehicle_detection': return '🚗';
      case 'intrusion_detection': return '⚠️';
      case 'weapon_detection': return '🔫';
      case 'fire_detection': return '🔥';
      default: return '📷';
    }
  };

  const getGridClass = () => {
    switch (gridCols) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      case 4: return 'grid-cols-4';
      // Responsive fallback if needed, but 'grid-cols-4' usually works well with responsive tailwind prefixes if hardcoded, 
      // however here we want explicit control. For mobile we might want to override.
      default: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
    }
  };

  // Helper to ensure mobile view doesn't break with 4 cols
  const getResponsiveGridClass = () => {
    const base = getGridClass();
    // Force single column on very small screens unless user explicitly wants 4 tiny ones? 
    // Usually better to let the user decide, but 4 cols on mobile is tiny. 
    // Let's stick to the requested logic: "allow user choice". 
    // But logically, on mobile 'grid-cols-4' is unusable. 
    // I'll add 'md:' prefix to the dynamic class and default to 1 on mobile?
    // No, simple string interpolation is risky with Tailwind unless full class names exist.
    // I will return the full class string.

    // Mobile friendly approach: always 1 col on mobile, then respect choice on md+
    // OR if user wants 4 cols on mobile, let them have it (maybe for tablet).

    // Let's make it responsive:
    // If user picks 1 -> grid-cols-1
    // If user picks 2 -> grid-cols-1 md:grid-cols-2
    // If user picks 4 -> grid-cols-1 md:grid-cols-2 lg:grid-cols-4

    // Wait, the user said "allow about 4 cameras to fit in 1 row" and "option to view in full or in any size".
    // Explicit control means if I click "4", I expect 4.
    return base;
  };

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Live Monitoring</h1>
            <p className="text-slate-600 mt-1">Real-time video feeds from all cameras</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search cameras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setGridCols(1)}
                className={`p-2 rounded ${gridCols === 1 ? 'bg-slate-100 dark:bg-slate-700 text-blue-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                title="1 Column (Full Width)"
              >
                <div className="w-5 h-5 border-2 border-current rounded-sm" />
              </button>
              <button
                onClick={() => setGridCols(2)}
                className={`p-2 rounded ${gridCols === 2 ? 'bg-slate-100 dark:bg-slate-700 text-blue-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                title="2 Columns"
              >
                <LayoutGrid size={20} />
              </button>
              <button
                onClick={() => setGridCols(4)}
                className={`p-2 rounded ${gridCols === 4 ? 'bg-slate-100 dark:bg-slate-700 text-blue-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                title="4 Columns (Default)"
              >
                <Grid size={20} />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">{cameras.length} Online</span>
            </div>
          </div>
        </div>

        {cameras.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Monitor className="mx-auto text-slate-400 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Online Cameras</h3>
            <p className="text-slate-600 dark:text-slate-400">No cameras are currently online. Check camera connections.</p>
          </div>
        ) : (
          <div className={`grid ${getResponsiveGridClass()} gap-4`}>
            {cameras.filter(c =>
              c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              c.location.toLowerCase().includes(searchQuery.toLowerCase())
            ).map((camera) => (
              <div
                key={camera.id}
                className="bg-slate-900 rounded-xl overflow-hidden shadow-lg border-2 border-slate-700 hover:border-red-500 transition-all cursor-pointer flex flex-col group"
                onClick={() => setSelectedCamera(camera)}
              >
                <div className="aspect-video bg-slate-800 relative w-full h-full">
                  <StreamPlayer
                    url={camera.stream_url}
                    isRecording={camera.is_recording}
                    className="absolute inset-0 z-0"
                    muted={true}
                    autoPlay={true}
                  />

                  {/* Top Layer Controls */}
                  <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between items-start">
                      {camera.is_recording ? (
                        <div className="flex items-center gap-2 bg-red-600 text-white px-2 py-1 rounded-lg text-[10px] font-bold shadow-lg animate-pulse">
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          REC
                        </div>
                      ) : <div />}

                      <div className="flex gap-2 pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Optional: logic to hide camera locally
                          }}
                          className="p-2 bg-slate-800 bg-opacity-80 rounded-lg hover:bg-opacity-100 transition-all"
                          title="Hide Camera"
                        >
                          <VideoOff className="text-white" size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCamera(camera);
                          }}
                          className="p-2 bg-slate-800 bg-opacity-80 rounded-lg hover:bg-opacity-100 transition-all"
                          title="Fullscreen View"
                        >
                          <Maximize2 className="text-white" size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Transparent overlay to capture clicks for expansion */}
                  <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => setSelectedCamera(camera)} />
                </div>

                <div className="p-3 bg-slate-800 shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="overflow-hidden">
                      <h3 className="font-semibold text-white truncate text-sm">{camera.name}</h3>
                    </div>
                    {camera.ai_model_id || (modelCounts[camera.id] > 0) ? (
                      <div className="flex items-center gap-1 bg-purple-900 bg-opacity-50 text-purple-300 px-2 py-1 rounded text-[10px]">
                        <AlertCircle size={10} />
                        AI ({modelCounts[camera.id] || 1})
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedCamera && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-7xl h-full md:h-auto max-h-[95vh] flex flex-col">
              <div className="bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedCamera.name}</h2>
                    <p className="text-sm text-slate-400">{selectedCamera.location}</p>
                  </div>
                  <button
                    onClick={() => setSelectedCamera(null)}
                    className="text-slate-400 hover:text-white px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 bg-black relative flex items-center justify-center min-h-[400px]">
                  <StreamPlayer
                    url={selectedCamera.stream_url}
                    isRecording={selectedCamera.is_recording}
                    autoPlay={true}
                    muted={false}
                  />
                </div>

                <div className="p-4 bg-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm shrink-0">
                  <div>
                    <p className="text-slate-400">Brand</p>
                    <p className="text-white font-medium">{selectedCamera.brand}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Connection</p>
                    <p className="text-white font-medium">{selectedCamera.connection_type.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Status</p>
                    <p className="text-green-400 font-medium">{selectedCamera.status}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">AI Detection</p>
                    <p className="text-white font-medium">{(selectedCamera.ai_model_id || modelCounts[selectedCamera.id] > 0) ? `Enabled (${modelCounts[selectedCamera.id] || 1} Models)` : 'Disabled'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Analysis Sidebar */}
      <div className="w-96 space-y-4">
        {/* Stats Cards */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="text-red-600" size={20} />
            <h3 className="font-bold text-slate-900 dark:text-white">AI Analysis</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={16} className="text-blue-600" />
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Today</p>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.totalToday}</p>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-green-600" />
                <p className="text-xs text-green-700 dark:text-green-300 font-medium">Avg Conf.</p>
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.avgConfidence}%</p>
            </div>
          </div>

          {stats.topType && (
            <div className="mt-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-purple-600" />
                <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">Top Detection</p>
              </div>
              <p className="text-sm font-bold text-purple-900 dark:text-purple-100 capitalize">
                {stats.topType.replace('_', ' ')}
              </p>
            </div>
          )}
        </div>

        {/* Real-time Events Feed */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Recent Detections</h3>
            <span className="text-xs text-slate-500">{events.length} events</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Activity size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No events detected today</p>
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Event Snapshot */}
                    {event.snapshot_url ? (
                      <img
                        src={event.snapshot_url}
                        alt={event.event_type}
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-2xl flex-shrink-0">
                        {getEventIcon(event.event_type)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate capitalize">
                        {event.event_type.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        📹 {getCameraName(event.camera_id)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${(event.confidence || 0) > 80
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}>
                          {event.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
