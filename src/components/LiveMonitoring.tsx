import { useEffect, useState, useRef } from 'react';
import { Monitor, Maximize2, AlertCircle, Grid, LayoutGrid, Search, Activity, TrendingUp, Brain, Zap, Video, X, MapPin, Wifi, Shield, Clock } from 'lucide-react';
import { supabase, type Camera, type Event } from '../lib/supabase';
import StreamPlayer from './StreamPlayer';
import { toast } from 'sonner';

export default function LiveMonitoring() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const camerasRef = useRef<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gridCols, setGridCols] = useState(4);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ totalToday: 0, avgConfidence: 0, topType: '' });
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});
  const [detectionsMap, setDetectionsMap] = useState<Record<string, any[]>>({});
  const [alertCameras, setAlertCameras] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    loadCameras();
    loadEvents();

    const channel = supabase
      .channel('live-monitoring')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
        const newEvent = payload.new as Event;
        setEvents((prev) => [newEvent, ...prev].slice(0, 20));

        if (newEvent.metadata?.box) {
          const detection = {
            id: newEvent.id,
            label: newEvent.event_type.replace('_', ' ').toUpperCase(),
            confidence: newEvent.confidence,
            box: newEvent.metadata.box,
            timestamp: Date.now(),
          };
          setDetectionsMap(prev => ({
            ...prev,
            [newEvent.camera_id]: [...(prev[newEvent.camera_id] || []), detection],
          }));
          setTimeout(() => {
            setDetectionsMap(prev => ({
              ...prev,
              [newEvent.camera_id]: (prev[newEvent.camera_id] || []).filter(d => d.id !== newEvent.id),
            }));
          }, 5000);
        }

        setAlertCameras(prev => new Set(prev).add(newEvent.camera_id));
        setTimeout(() => {
          setAlertCameras(prev => { const next = new Set(prev); next.delete(newEvent.camera_id); return next; });
        }, 4000);

        const matchedCam = camerasRef.current.find(c => c.id === newEvent.camera_id);
        const camName = matchedCam?.name || 'Unknown Camera';
        toast.error(`SECURITY ALERT: ${newEvent.event_type.replace('_', ' ').toUpperCase()}`, {
          description: `Detected on ${camName} at ${new Date().toLocaleTimeString()}`,
          duration: 5000,
        });

        setStats((prev) => ({
          ...prev,
          totalToday: prev.totalToday + 1,
          avgConfidence: Math.round(((prev.avgConfidence * prev.totalToday) + (newEvent.confidence || 0)) / (prev.totalToday + 1)),
        }));
      })
      .subscribe();

    const interval = setInterval(() => { loadEvents(); loadCameras(); }, 10000);
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, []);

  const loadCameras = async () => {
    const { data: cams } = await supabase.from('cameras').select('*').order('name');
    if (cams) {
      setCameras(cams);
      camerasRef.current = cams;
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
      .from('events').select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setEvents(data);
      const total = data.length;
      const avgConf = total > 0 ? data.reduce((sum, e) => sum + (e.confidence || 0), 0) / total : 0;
      const typeCounts = data.reduce((acc, e) => { acc[e.event_type] = (acc[e.event_type] || 0) + 1; return acc; }, {} as Record<string, number>);
      const topType = Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b, '');
      setStats({ totalToday: total, avgConfidence: Math.round(avgConf), topType });
    }
  };

  const getCameraName = (cameraId: string) => cameras.find(c => c.id === cameraId)?.name || 'Unknown';

  const toggleRecording = async (cameraId: string) => {
    const cam = cameras.find(c => c.id === cameraId);
    if (!cam) return;
    const newStatus = !cam.is_recording;
    setCameras(prev => prev.map(c => c.id === cameraId ? { ...c, is_recording: newStatus } : c));
    try {
      await supabase.from('cameras').update({ is_recording: newStatus }).eq('id', cameraId);
      toast.success(newStatus ? 'Recording started on ' + cam.name : 'Recording stopped');
    } catch (e) {
      toast.error('Failed to update recording status');
      setCameras(prev => prev.map(c => c.id === cameraId ? { ...c, is_recording: !newStatus } : c));
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'person_detection': return '👤';
      case 'vehicle_detection': return '🚗';
      case 'intrusion_detection': return '⚠️';
      case 'weapon_detection': case 'gun': case 'pistol': case 'rifle': case 'firearm': return '🔫';
      case 'knife': return '🔪';
      case 'fire_detection': return '🔥';
      case 'no-helmet': case 'NO-Hardhat': return '👷‍♂️';
      case 'no-vest': case 'NO-Safety Vest': return '🦺';
      default: return type.includes('_crossing') ? '🚷' : '📷';
    }
  };

  const getEventColor = (type: string) => {
    if (type.includes('weapon') || type.includes('gun') || type.includes('pistol') || type.includes('rifle') || type.includes('knife') || type.includes('firearm'))
      return 'border-l-red-500 bg-red-50';
    if (type.includes('intrusion')) return 'border-l-orange-500 bg-orange-50';
    if (type.includes('person')) return 'border-l-blue-500 bg-blue-50';
    if (type.includes('vehicle')) return 'border-l-cyan-500 bg-cyan-50';
    if (type.includes('fire')) return 'border-l-yellow-500 bg-yellow-50';
    return 'border-l-slate-400 bg-slate-50';
  };

  const getGridClass = () => {
    switch (gridCols) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      default: return 'grid-cols-4';
    }
  };

  const filteredCameras = cameras.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.location.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const onlineCameras = cameras.filter(c => c.status === 'online').length;

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>

      {/* ── Main Camera Grid ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-red-500 rounded-full" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Live Monitoring</h1>
              <p className="text-xs text-slate-500">Real-time video feeds · {filteredCameras.length} cameras</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live clock */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 text-xs font-mono">
              <Clock size={12} className="text-red-500" />
              {currentTime.toLocaleTimeString()}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search cameras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-700 w-40"
              />
            </div>

            {/* Grid selector */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 gap-0.5">
              {[
                { cols: 1, icon: <div className="w-4 h-4 border-2 border-current rounded-sm" />, label: '1 Column' },
                { cols: 2, icon: <LayoutGrid size={16} />, label: '2 Columns' },
                { cols: 3, icon: <Grid size={16} />, label: '3 Columns' },
                { cols: 4, icon: <Grid size={16} />, label: '4 Columns' },
              ].map(({ cols, icon, label }) => (
                <button
                  key={cols}
                  onClick={() => setGridCols(cols)}
                  title={label}
                  className={`p-1.5 rounded-md transition-all text-xs font-bold ${gridCols === cols
                    ? 'bg-red-600 text-white shadow'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Online pill */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${onlineCameras > 0
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${onlineCameras > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {onlineCameras} / {cameras.length} Online
            </div>
          </div>
        </div>

        {/* Camera Grid */}
        {cameras.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <div className="text-center">
              <Monitor className="mx-auto text-slate-300 mb-3" size={48} />
              <h3 className="text-base font-semibold text-slate-500 mb-1">No Cameras Found</h3>
              <p className="text-sm text-slate-400">Add cameras in the Camera Management section.</p>
            </div>
          </div>
        ) : (
          <div className={`grid ${getGridClass()} gap-2`}>
            {filteredCameras.map((camera) => {
              const isAlert = alertCameras.has(camera.id);
              const hasAI = camera.ai_model_id || (modelCounts[camera.id] > 0);
              return (
                <div
                  key={camera.id}
                  onClick={() => setSelectedCamera(camera)}
                  className={`relative bg-slate-900 rounded-xl overflow-hidden cursor-pointer group transition-all duration-300
                    ${isAlert
                      ? 'ring-2 ring-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                      : 'ring-1 ring-slate-300 hover:ring-red-400 hover:shadow-lg'}`}
                >
                  {/* Video feed */}
                  <div className="aspect-video bg-black relative">
                    <StreamPlayer
                      url={camera.stream_url}
                      cameraName={camera.name}
                      isRecording={camera.is_recording}
                      className="absolute inset-0 z-0"
                      muted={true}
                      autoPlay={true}
                      detections={detectionsMap[camera.id] || []}
                    />

                    {/* Alert pulse border */}
                    {isAlert && (
                      <div className="absolute inset-0 z-10 pointer-events-none border-2 border-red-500 rounded-xl animate-pulse" />
                    )}

                    {/* Overlay controls */}
                    <div className="absolute inset-0 z-20 pointer-events-none">
                      <div className="flex justify-between items-start p-2">
                        {camera.is_recording ? (
                          <div className="flex items-center gap-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold animate-pulse">
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                            REC
                          </div>
                        ) : <div />}

                        <div className="flex gap-1 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRecording(camera.id); }}
                            className={`p-1.5 rounded-lg text-white transition-all ${camera.is_recording ? 'bg-red-600 hover:bg-red-700' : 'bg-black/50 hover:bg-black/75 backdrop-blur-sm'}`}
                            title={camera.is_recording ? 'Stop Recording' : 'Start Recording'}
                          >
                            <Video size={12} className={camera.is_recording ? 'fill-current' : ''} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedCamera(camera); }}
                            className="p-1.5 bg-black/50 hover:bg-black/75 backdrop-blur-sm rounded-lg text-white transition-all"
                            title="Expand"
                          >
                            <Maximize2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => setSelectedCamera(camera)} />
                  </div>

                  {/* Camera label bar — kept dark since it's always under video */}
                  <div className={`px-2.5 py-2 flex items-center justify-between transition-colors ${isAlert ? 'bg-red-900' : 'bg-slate-800'}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${camera.status === 'online' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      <span className="text-white text-xs font-semibold truncate">{camera.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {hasAI && (
                        <span className="flex items-center gap-0.5 bg-purple-700/60 text-purple-200 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                          <Brain size={9} /> AI
                        </span>
                      )}
                      {isAlert && (
                        <span className="flex items-center gap-0.5 bg-red-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold animate-pulse">
                          <AlertCircle size={9} /> ALERT
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right Sidebar ── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">

        {/* AI Stats card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-red-50 rounded-lg">
              <Brain size={16} className="text-red-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">AI Analysis</h3>
            <div className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              LIVE
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity size={12} className="text-blue-500" />
                <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">Today</p>
              </div>
              <p className="text-2xl font-black text-blue-900">{stats.totalToday}</p>
              <p className="text-[10px] text-blue-500 mt-0.5">detections</p>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp size={12} className="text-emerald-600" />
                <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">Avg Conf</p>
              </div>
              <p className="text-2xl font-black text-emerald-900">{stats.avgConfidence}%</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">accuracy</p>
            </div>
          </div>

          {stats.topType && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 flex items-center gap-3">
              <div className="p-1.5 bg-purple-100 rounded-lg">
                <Zap size={14} className="text-purple-600" />
              </div>
              <div>
                <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wide">Top Detection</p>
                <p className="text-sm font-bold text-purple-900 capitalize">{stats.topType.replace(/_/g, ' ')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Events feed */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-50 rounded-lg">
                <Shield size={14} className="text-orange-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Recent Detections</h3>
            </div>
            <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {events.length} events
            </span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-0.5" style={{ maxHeight: '460px' }}>
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Activity size={28} className="mb-2 opacity-40" />
                <p className="text-xs">No events detected today</p>
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-lg p-2.5 border-l-2 ${getEventColor(event.event_type)}`}
                >
                  <div className="flex items-start gap-2.5">
                    {event.snapshot_url ? (
                      <img
                        src={event.snapshot_url}
                        alt={event.event_type}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xl flex-shrink-0">
                        {getEventIcon(event.event_type)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate capitalize">
                        {event.event_type.replace(/_/g, ' ')}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={9} className="text-slate-400 flex-shrink-0" />
                        <p className="text-[10px] text-slate-500 truncate">{getCameraName(event.camera_id)}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          (event.confidence || 0) > 80
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-yellow-100 text-yellow-700 border border-yellow-200'
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

      {/* ── Fullscreen Modal ── */}
      {selectedCamera && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedCamera(null)}
        >
          <div
            className="w-full max-w-7xl flex flex-col"
            style={{ maxHeight: '95vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-2xl flex flex-col">

              {/* Modal header - sticky above video */}
              <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{selectedCamera.name}</h2>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin size={10} /> {selectedCamera.location}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCamera(null)}
                  className="flex items-center gap-1.5 text-slate-700 hover:text-white px-4 py-2 bg-white hover:bg-red-600 border-2 border-slate-300 hover:border-red-600 rounded-xl transition-all text-sm font-bold shadow-sm"
                >
                  <X size={16} /> Close
                </button>
              </div>

              {/* Video - floating close button as fallback */}
              <div className="bg-black relative flex items-center justify-center" style={{ minHeight: '420px', maxHeight: '62vh' }}>
                <StreamPlayer
                  url={selectedCamera.stream_url}
                  cameraName={selectedCamera.name}
                  isRecording={selectedCamera.is_recording}
                  autoPlay={true}
                  muted={false}
                  detections={detectionsMap[selectedCamera.id] || []}
                />

              </div>

              {/* Details bar */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
                {[
                  { icon: <Wifi size={13} className="text-slate-400" />, label: 'Brand', value: selectedCamera.brand, className: 'text-slate-800' },
                  { icon: <Zap size={13} className="text-slate-400" />, label: 'Connection', value: selectedCamera.connection_type.toUpperCase(), className: 'text-slate-800' },
                  { icon: <Activity size={13} className="text-slate-400" />, label: 'Status', value: selectedCamera.status, className: selectedCamera.status === 'online' ? 'text-emerald-600' : 'text-red-500' },
                  {
                    icon: <Brain size={13} className="text-slate-400" />,
                    label: 'AI Detection',
                    value: (selectedCamera.ai_model_id || modelCounts[selectedCamera.id] > 0)
                      ? `Enabled (${modelCounts[selectedCamera.id] || 1} Models)`
                      : 'Disabled',
                    className: (selectedCamera.ai_model_id || modelCounts[selectedCamera.id] > 0) ? 'text-purple-600' : 'text-slate-400',
                  },
                ].map(({ icon, label, value, className }) => (
                  <div key={label} className="flex items-start gap-2">
                    <div className="mt-0.5">{icon}</div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
                      <p className={`text-sm font-semibold ${className}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
