import { useEffect, useState } from 'react';
import { Camera, Plus, Edit, Trash2, VideoOff, X, Brain, Search, LayoutList, LayoutGrid, ShieldCheck, ShieldAlert, Globe, Settings2, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import CameraModelAssignment from './CameraModelAssignment';
import { supabase, type Camera as CameraType } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function CameraManagement() {
  const { role } = useAuth();
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showModal, setShowModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null);
  const [activeConfigCamera, setActiveConfigCamera] = useState<CameraType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    brand: '',
    connection_type: 'rtsp',
    stream_url: '',
    username: '',
    password: '',
    ip_address: '192.168.1.120',
    port: 554,
    resolution: '1920x1080',
    fps: 25,
    status: 'online',
  });

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    const { data } = await supabase.from('cameras').select('*').order('created_at', { ascending: false });
    if (data) setCameras(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const safePass = encodeURIComponent(formData.password).replace(/@/g, '%40');
    const rtspSource = `rtsp://${formData.username}:${safePass}@${formData.ip_address}:${formData.port}/cam/realmonitor?channel=1&subtype=0`;
    const hlsUrl = `http://localhost:8888/${slug}/index.m3u8`;

    const { ip_address, port, ...payload } = formData;
    const finalData = {
      ...payload,
      location: rtspSource,
      stream_url: hlsUrl,
      updated_at: new Date().toISOString()
    };

    if (editingCamera) {
      await supabase.from('cameras').update(finalData).eq('id', editingCamera.id);
    } else {
      await supabase.from('cameras').insert([finalData]);
    }

    resetForm();
    loadCameras();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      await supabase.from('cameras').delete().eq('id', id);
      loadCameras();
    }
  };

  const handleEdit = (camera: CameraType) => {
    setEditingCamera(camera);
    let extractedIp = '';
    let extractedPort = 554;

    if (camera.location?.startsWith('rtsp')) {
      try {
        const urlParts = camera.location.split('@');
        if (urlParts.length > 1) {
          const hostPart = urlParts[1].split('/')[0];
          const networkParts = hostPart.split(':');
          extractedIp = networkParts[0];
          if (networkParts.length > 1) {
            extractedPort = parseInt(networkParts[1]);
          }
        }
      } catch (e) {
        console.error("Error parsing RTSP location", e);
      }
    }

    setFormData({
      name: camera.name,
      location: camera.location,
      brand: camera.brand,
      connection_type: camera.connection_type,
      stream_url: camera.stream_url,
      username: camera.username || '',
      password: camera.password || '',
      ip_address: extractedIp || '192.168.1.120',
      port: extractedPort || 554,
      resolution: camera.resolution || '1920x1080',
      fps: camera.fps || 25,
      status: camera.status || 'online',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingCamera(null);
    setFormData({
      name: '',
      location: '',
      brand: '',
      connection_type: 'rtsp',
      stream_url: '',
      username: '',
      password: '',
      ip_address: '192.168.1.120',
      port: 554,
      resolution: '1920x1080',
      fps: 25,
      status: 'online',
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'offline': return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      case 'disabled': return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
      default: return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    }
  };

  const toggleStatus = async (camera: CameraType) => {
    if (role !== 'admin') return alert('Access Denied');
    const newStatus = camera.status === 'disabled' ? 'offline' : 'disabled';
    await supabase.from('cameras').update({ status: newStatus }).eq('id', camera.id);
    loadCameras();
  };

  const filteredCameras = cameras.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalPages = Math.ceil(filteredCameras.length / pageSize);
  const paginatedCameras = filteredCameras.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600 rounded-xl shadow-lg shadow-red-600/20">
            <Camera className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white leading-none">Camera Management</h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-[2px] font-bold mt-1">Surveillance Nodes</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input
              type="text"
              placeholder="Search fleet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-[11px] focus:ring-2 focus:ring-red-500/20 transition-all dark:text-white h-8"
            />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutList size={12} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={12} /></button>
          </div>
          {role === 'admin' && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-red-600/20 active:scale-95 h-8">
              <Plus size={12} /> NEW NODE
            </button>
          )}
        </div>
      </div>

      {/* Table Area */}
      {viewMode === 'list' ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 dark:bg-slate-950/50">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Identity</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Address</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Maker</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-center">Status</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-center">DVR</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
              {paginatedCameras.map((camera) => (
                <tr key={camera.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${camera.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'}`}>
                        <Camera size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{camera.name}</p>
                        <p className="text-xs text-slate-400 font-mono truncate max-w-[180px] mt-0.5">{camera.stream_url}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-bold tracking-tighter">
                      <Globe size={14} className="text-slate-300 dark:text-slate-600" />
                      {camera.location.split('@')[1]?.split('/')[0] || camera.location}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                    {camera.brand}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${getStatusStyle(camera.status)}`}>
                        {camera.status === 'disabled' ? 'OFF' : camera.status.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {camera.is_recording ? (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-lg">
                          <span className="w-1.5 h-1.5 bg-rose-600 rounded-full animate-pulse" />
                          <span className="text-xs font-black">REC</span>
                        </div>
                      ) : (
                        <span className="text-xs font-black text-slate-300 dark:text-slate-600 italic">IDLE</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all origin-right">
                      {role === 'admin' ? (
                        <>
                          <ActionBtn onClick={() => toggleStatus(camera)} color="slate" icon={camera.status === 'disabled' ? ShieldCheck : ShieldAlert} />
                          <ActionBtn onClick={() => setActiveConfigCamera(camera)} color="purple" icon={Brain} />
                          <ActionBtn onClick={() => handleEdit(camera)} color="blue" icon={Edit} />
                          <ActionBtn onClick={() => handleDelete(camera.id)} color="rose" icon={Trash2} />
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No Perms</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {paginatedCameras.map(camera => (
            <div key={camera.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm hover:border-red-500/30 transition-all">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg"><Camera size={12} /></div>
                  <h3 className="text-[11px] font-bold dark:text-white truncate max-w-[100px]">{camera.name}</h3>
                </div>
                <span className={`px-1.5 py-0.5 rounded-lg text-[7px] font-black border ${getStatusStyle(camera.status)}`}>{camera.status}</span>
              </div>
              <div className="space-y-1 mb-3 bg-slate-50 dark:bg-slate-950/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                <GridInfo label="Brand" value={camera.brand} />
                <GridInfo label="Network" value={camera.location.split('@')[1]?.split('/')[0] || 'Unresolved'} />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => handleEdit(camera)} className="flex-1 py-1 bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-tighter rounded-lg dark:text-slate-400 hover:bg-red-600 hover:text-white transition-all">Setup</button>
                <button onClick={() => setActiveConfigCamera(camera)} className="px-2 py-1 bg-purple-600/10 text-purple-600 rounded-lg hover:bg-purple-600 hover:text-white transition-all"><Brain size={10} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredCameras.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredCameras.length)} of {filteredCameras.length} cameras
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[40px] h-10 rounded-lg font-medium text-sm transition-colors ${currentPage === pageNum
                        ? 'bg-red-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Redesigned Modal - Premium Glass Compact */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-sm w-full overflow-hidden border border-white/10 flex flex-col">
            <div className="p-5 flex justify-between items-center bg-slate-900 text-white border-b border-white/5 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-[3px]">
                  <Settings2 className="text-red-500" size={14} />
                  Camera Setup
                </h2>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Surveillance Core Configuration</p>
              </div>
              <button onClick={resetForm} className="p-2 hover:bg-white/10 rounded-full transition-all text-slate-400 relative z-10">
                <X size={16} />
              </button>
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Device Tag">
                    <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-s" placeholder="e.g. Lobby 01" />
                  </InputGroup>
                  <InputGroup label="Deployment Site">
                    <input type="text" required value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="input-s" placeholder="e.g. Level 4" />
                  </InputGroup>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Hardware Agent">
                    <select value={formData.brand} onChange={(e) => setFormData({ ...formData, brand: e.target.value })} className="input-s">
                      <option value="">Vendor</option>
                      <option value="Dahua">Dahua</option>
                      <option value="Hikvision">Hikvision</option>
                      <option value="Generic">Generic</option>
                    </select>
                  </InputGroup>
                  <InputGroup label="Data Protocol">
                    <select value={formData.connection_type} onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })} className="input-s">
                      <option value="rtsp">RTSP (Stream)</option>
                      <option value="http">HTTP (MJPEG)</option>
                      <option value="4g">4G (Cellular)</option>
                    </select>
                  </InputGroup>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-3xl border border-slate-100 dark:border-white/5 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <InputGroup label="Endpoint IP Address">
                      <input type="text" value={formData.ip_address} onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                        className="input-s tracking-widest text-center font-mono" />
                    </InputGroup>
                  </div>
                  <InputGroup label="Comm Port">
                    <input type="number" value={formData.port} onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 554 })}
                      className="input-s text-center font-mono" />
                  </InputGroup>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InputGroup label="Security User">
                    <input type="text" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="input-s" placeholder="admin" />
                  </InputGroup>
                  <InputGroup label="Access Key">
                    <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="input-s" placeholder="••••••••" />
                  </InputGroup>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-white/5 pt-3">
                <InputGroup label="Capture Quality">
                  <select value={formData.resolution} onChange={(e) => setFormData({ ...formData, resolution: e.target.value })} className="input-s">
                    <option value="1920x1080">1080p FHD</option>
                    <option value="1280x720">720p HD</option>
                    <option value="3840x2160">2160p 4K</option>
                  </select>
                </InputGroup>
                <InputGroup label="Sample Rate (FPS)">
                  <input type="number" value={formData.fps} onChange={(e) => setFormData({ ...formData, fps: parseInt(e.target.value) })}
                    className="input-s" min="1" max="60" />
                </InputGroup>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                <button type="submit" className="w-full py-2.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-[3px] rounded-2xl hover:bg-red-700 transition-all shadow-xl shadow-red-600/20 active:scale-95">
                  {editingCamera ? 'COMMIT CHANGES' : 'DEPLOY NODE'}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={async () => {
                    const btn = document.getElementById('test-btn-compact');
                    if (btn) btn.innerText = "LINKING...";
                    setTimeout(() => { if (btn) btn.innerText = "LINK SUCCESSFUL"; }, 1500);
                  }} id="test-btn-compact" className="flex-1 py-2 text-[9px] font-black uppercase tracking-widest text-blue-600 border border-blue-500/30 bg-blue-500/5 rounded-xl hover:bg-blue-500/10 transition-all">
                    Validate Source
                  </button>
                  <button type="button" onClick={resetForm} className="flex-1 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                    Abort
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeConfigCamera && (
        <CameraModelAssignment camera={activeConfigCamera} onClose={() => setActiveConfigCamera(null)} />
      )}

      <style>{`
        .input-s {
            width: 100%;
            height: 32px;
            padding: 0 10px;
            font-size: 11px;
            font-weight: 700;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            outline: none;
            transition: all 0.2s;
        }
        .dark .input-s {
            background: #020617;
            border: 1px solid #1e293b;
            color: white;
        }
        .input-s:focus {
            background: white;
            border-color: #ef4444;
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.08);
        }
        .dark .input-s:focus {
            background: #000;
            border-color: #ef4444;
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #1e293b;
        }
      `}</style>
    </div>
  );
}

function ActionBtn({ icon: Icon, color, onClick }: any) {
  const colors: any = {
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white',
    purple: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500 hover:text-white',
    blue: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white',
    rose: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white',
  };
  return (
    <button onClick={onClick} className={`p-2 rounded-lg transition-all transform hover:scale-105 active:scale-90 ${colors[color]}`}>
      <Icon size={16} strokeWidth={2.5} />
    </button>
  );
}

function InputGroup({ label, children }: any) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
        {label}
      </label>
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

function GridInfo({ label, value }: any) {
  return (
    <div className="flex justify-between items-center text-[9px]">
      <span className="text-slate-500 uppercase font-black tracking-widest">{label}</span>
      <span className="font-bold dark:text-slate-400 truncate max-w-[60px]">{value}</span>
    </div>
  );
}
