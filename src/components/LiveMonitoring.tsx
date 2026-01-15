import { useEffect, useState } from 'react';
import { Monitor, Maximize2, AlertCircle, Grid, LayoutGrid } from 'lucide-react';
import { supabase, type Camera } from '../lib/supabase';
import StreamPlayer from './StreamPlayer';

export default function LiveMonitoring() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [gridCols, setGridCols] = useState(4); // Default to 4 columns

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    const { data } = await supabase.from('cameras').select('*').order('name');
    if (data) setCameras(data);
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Live Monitoring</h1>
          <p className="text-slate-600 mt-1">Real-time video feeds from all cameras</p>
        </div>

        <div className="flex items-center gap-4">
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
          {cameras.map((camera) => (
            <div
              key={camera.id}
              className="bg-slate-900 rounded-xl overflow-hidden shadow-lg border-2 border-slate-700 hover:border-red-500 transition-all cursor-pointer flex flex-col group"
              onClick={() => setSelectedCamera(camera)}
            >
              <div className="aspect-video bg-slate-800 relative w-full h-full">
                <StreamPlayer
                  url={camera.stream_url}
                  isRecording={camera.is_recording}
                  className="absolute inset-0"
                  muted={true}
                  autoPlay={false}
                />

                {/* Transparent overlay to capture clicks when controls are hidden or native player consumes clicks */}
                <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => setSelectedCamera(camera)} />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCamera(camera);
                  }}
                  className="absolute top-3 right-3 p-2 bg-slate-800 bg-opacity-80 rounded-lg hover:bg-opacity-100 transition-all z-20 opacity-0 group-hover:opacity-100"
                  title="Fullscreen View"
                >
                  <Maximize2 className="text-white" size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-800 shrink-0">
                <div className="flex items-start justify-between">
                  <div className="overflow-hidden">
                    <h3 className="font-semibold text-white truncate">{camera.name}</h3>
                    <p className="text-xs text-slate-400 truncate">{camera.location}</p>
                  </div>
                  {camera.ai_model_id && (
                    <div className="flex items-center gap-1 bg-purple-900 bg-opacity-50 text-purple-300 px-2 py-1 rounded text-[10px]">
                      <AlertCircle size={10} />
                      AI
                    </div>
                  )}
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
                  <p className="text-white font-medium">{selectedCamera.ai_model_id ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
