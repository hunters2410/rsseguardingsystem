import { useEffect, useState } from 'react';
import { Monitor, Maximize2, AlertCircle } from 'lucide-react';
import { supabase, type Camera } from '../lib/supabase';
import StreamPlayer from './StreamPlayer';

export default function LiveMonitoring() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    const { data } = await supabase.from('cameras').select('*').order('name');
    if (data) setCameras(data);
  };

  const getGridClass = () => {
    const count = cameras.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Live Monitoring</h1>
          <p className="text-slate-600 mt-1">Real-time video feeds from all cameras</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">{cameras.length} cameras online</span>
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
        <div className={`grid ${getGridClass()} gap-4`}>
          {cameras.map((camera) => (
            <div
              key={camera.id}
              className="bg-slate-900 rounded-xl overflow-hidden shadow-lg border-2 border-slate-700 hover:border-red-500 transition-all cursor-pointer flex flex-col"
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
                  className="absolute top-3 right-3 p-2 bg-slate-800 bg-opacity-80 rounded-lg hover:bg-opacity-100 transition-all z-20"
                >
                  <Maximize2 className="text-white" size={16} />
                </button>
              </div>

              <div className="p-4 bg-slate-800 shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{camera.name}</h3>
                    <p className="text-sm text-slate-400">{camera.location}</p>
                  </div>
                  {camera.ai_model_id && (
                    <div className="flex items-center gap-1 bg-purple-900 bg-opacity-50 text-purple-300 px-2 py-1 rounded text-xs">
                      <AlertCircle size={12} />
                      AI Active
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
          <div className="w-full max-w-6xl">
            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
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

              <div className="aspect-video bg-black relative flex items-center justify-center">
                <StreamPlayer
                  url={selectedCamera.stream_url}
                  isRecording={selectedCamera.is_recording}
                  autoPlay={true}
                  muted={false}
                />
              </div>

              <div className="p-4 bg-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
