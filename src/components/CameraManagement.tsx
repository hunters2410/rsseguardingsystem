import { useEffect, useState, useMemo } from 'react';
import {
  Camera, Plus, Edit, Trash2, X, Brain, Search,
  RefreshCw, Wifi, WifiOff, Settings2, Eye, EyeOff,
  LayoutGrid, LayoutList, ShieldCheck, ShieldAlert,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import CameraModelAssignment from './CameraModelAssignment';
import { supabase, type Camera as CameraType } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/* ─── tiny helpers ─────────────────────────────────────────────────────────── */
const STATUS_MAP: Record<string, { bg: string; dot: string; label: string }> = {
  online:   { bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', dot: 'bg-emerald-500', label: 'Online' },
  offline:  { bg: 'bg-rose-500/10    text-rose-600    border-rose-500/30',    dot: 'bg-rose-500',    label: 'Offline' },
  disabled: { bg: 'bg-slate-400/10  text-slate-500  border-slate-400/30',    dot: 'bg-slate-400',  label: 'Disabled' },
};
const statusInfo = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.offline;

const BRAND_PATHS: Record<string, string> = {
  Dahua:     '/cam/realmonitor?channel=1&subtype=0',
  Hikvision: '/Streaming/Channels/101',
  Axis:      '/axis-media/media.amp',
  Generic:   '/stream1',
};

const DEFAULT_FORM = {
  name: '', location: '', brand: '', connection_type: 'rtsp',
  stream_url: '', username: '', password: '',
  ip_address: '192.168.1.120', port: 554,
  rtsp_path: '/cam/realmonitor?channel=1&subtype=0',
  resolution: '1920x1080', fps: 25, status: 'online',
};

/* ─── component ─────────────────────────────────────────────────────────────── */
export default function CameraManagement() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [cameras, setCameras]                 = useState<CameraType[]>([]);
  const [search, setSearch]                   = useState('');
  const [viewMode, setViewMode]               = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage]         = useState(1);
  const [pageSize, setPageSize]               = useState(12);
  const [showModal, setShowModal]             = useState(false);
  const [editingCamera, setEditingCamera]     = useState<CameraType | null>(null);
  const [activeAI, setActiveAI]               = useState<CameraType | null>(null);
  const [checking, setChecking]               = useState(false);
  const [testing, setTesting]                 = useState(false);
  const [testResult, setTestResult]           = useState<'success' | 'error' | null>(null);
  const [testMsg, setTestMsg]                 = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [formData, setFormData]               = useState(DEFAULT_FORM);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting]       = useState(false);

  useEffect(() => { load(); }, []);
  // Clear selection whenever the camera list reloads
  useEffect(() => { setSelectedIds(new Set()); }, [cameras.length]);
  useEffect(() => { setCurrentPage(1); }, [search]);

  /* ── data ── */
  const load = async () => {
    const { data } = await supabase.from('cameras').select('*').order('created_at', { ascending: false });
    if (data) setCameras(data);
  };

  const checkAllStatus = async () => {
    setChecking(true);
    const updates: Promise<any>[] = [];
    for (const cam of cameras) {
      if (cam.status === 'disabled') continue;
      const newStatus = cam.ip_address ? 'online' : 'offline';
      if (newStatus !== cam.status)
        updates.push(supabase.from('cameras').update({ status: newStatus }).eq('id', cam.id));
    }
    if (updates.length) { await Promise.all(updates); await load(); }
    setChecking(false);
  };

  /* ── bulk select helpers ── */
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleSelectAll = () =>
    setSelectedIds(
      // allFilteredSelected is computed below after `filtered` is defined
      filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
        ? new Set()
        : new Set(filtered.map(c => c.id))
    );

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} camera(s)? This also removes their events, zones, and rules.`)) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedIds];
      await supabase.from('events').delete().in('camera_id', ids);
      await supabase.from('camera_models').delete().in('camera_id', ids);
      await supabase.from('camera_zones').delete().in('camera_id', ids);
      await supabase.from('alert_rules').delete().in('camera_id', ids);
      await supabase.from('cameras').delete().in('id', ids);
      setSelectedIds(new Set());
      await load();
    } catch (err: any) { alert(`Bulk delete failed: ${err.message}`); }
    finally { setBulkDeleting(false); }
  };

  /* ── form helpers ── */
  const patch = (partial: Partial<typeof formData>) => setFormData(f => ({ ...f, ...partial }));

  const openAdd = () => {
    setEditingCamera(null);
    setFormData(DEFAULT_FORM);
    setTestResult(null); setTestMsg('');
    setShowModal(true);
  };

  const openEdit = (cam: CameraType) => {
    setEditingCamera(cam);
    let ip = '', port = 554, path = '/cam/realmonitor?channel=1&subtype=0';
    if (cam.location?.startsWith('rtsp')) {
      try {
        const after = cam.location.split('@')[1] ?? '';
        const [host, ...rest] = after.split('/');
        const [h, p] = host.split(':');
        ip = h; port = p ? parseInt(p) : 554;
        path = '/' + rest.join('/');
      } catch {}
    }
    setFormData({
      name: cam.name, location: cam.location, brand: cam.brand,
      connection_type: cam.connection_type, stream_url: cam.stream_url,
      username: cam.username || '', password: cam.password || '',
      ip_address: ip || '192.168.1.120', port,
      rtsp_path: path || '/cam/realmonitor?channel=1&subtype=0',
      resolution: cam.resolution || '1920x1080', fps: cam.fps || 25,
      status: cam.status || 'online',
    });
    setTestResult(null); setTestMsg('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingCamera(null); };

  /* ── computed previews (update live as user types) ── */
  const liveSlug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'camera-name';
  const liveRtsp = (() => {
    const safePass = encodeURIComponent(formData.password || '').replace(/@/g, '%40');
    const safePath = formData.rtsp_path.startsWith('/') ? formData.rtsp_path : `/${formData.rtsp_path}`;
    const user = formData.username ? `${formData.username}:${safePass}@` : '';
    return `rtsp://${user}${formData.ip_address || '<ip>'}:${formData.port}${safePath}`;
  })();
  const liveHls = `http://localhost:8888/${liveSlug}/index.m3u8`;

  /* ── CRUD ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = liveSlug;
    const { rtsp_path, ...rest } = formData;
    const payload = { ...rest, location: liveRtsp, stream_url: liveHls, updated_at: new Date().toISOString() };

    if (editingCamera) await supabase.from('cameras').update(payload).eq('id', editingCamera.id);
    else               await supabase.from('cameras').insert([payload]);

    if (saveAndAddAnother && !editingCamera) {
      setFormData(DEFAULT_FORM);
      setTestResult(null); setTestMsg('');
    } else {
      closeModal();
    }
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this camera? This also removes its events, zones, and rules.')) return;
    try {
      await supabase.from('events').delete().eq('camera_id', id);
      await supabase.from('camera_models').delete().eq('camera_id', id);
      await supabase.from('camera_zones').delete().eq('camera_id', id);
      await supabase.from('alert_rules').delete().eq('camera_id', id);
      const { error } = await supabase.from('cameras').delete().eq('id', id);
      if (error) throw error;
      load();
    } catch (err: any) { alert(`Delete failed: ${err.message}`); }
  };

  const toggleStatus = async (cam: CameraType) => {
    if (!isAdmin) return alert('Access Denied');
    const ns = cam.status === 'disabled' ? 'offline' : 'disabled';
    await supabase.from('cameras').update({ status: ns }).eq('id', cam.id);
    load();
  };

  const testConnection = async () => {
    setTesting(true); setTestResult(null); setTestMsg('');
    try {
      const safePass = encodeURIComponent(formData.password).replace(/@/g, '%40');
      const safePath = formData.rtsp_path.startsWith('/') ? formData.rtsp_path : `/${formData.rtsp_path}`;
      const rtspSource = `rtsp://${formData.username}:${safePass}@${formData.ip_address}:${formData.port}${safePath}`;

      const { data, error } = await supabase.from('system_commands').insert({
        command_type: 'test_camera_connection', status: 'pending',
        payload: { stream_url: rtspSource, username: formData.username, password: formData.password }
      }).select().single();

      if (error) throw error;
      if (!data) throw new Error('No command returned');

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const { data: cmd } = await supabase.from('system_commands').select('*').eq('id', data.id).single();
        if (cmd && cmd.status !== 'pending') {
          clearInterval(poll); setTesting(false);
          setTestResult(cmd.status === 'completed' ? 'success' : 'error');
          setTestMsg(cmd.result || (cmd.status === 'completed' ? 'Connection successful' : 'Connection failed'));
        } else if (attempts > 15) {
          clearInterval(poll); setTesting(false);
          setTestResult('error'); setTestMsg('Test timed out. AI server may be offline.');
        }
      }, 2000);
    } catch (err: any) {
      setTesting(false); setTestResult('error'); setTestMsg('Failed to start test.');
    }
  };

  /* ── filtered list ── */
  const filtered = cameras.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  // Derived from filtered — must be after it
  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

  /* ── counts ── */
  const onlineCount  = cameras.filter(c => c.status === 'online').length;
  const offlineCount = cameras.filter(c => c.status === 'offline').length;

  /* ──────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────────── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedCameras = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3
                      bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800
                      rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600 rounded-xl shadow-lg shadow-red-600/25">
            <Camera className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Camera Management</h1>
            <p className="text-xs text-slate-500 mt-0.5">{cameras.length} cameras · {onlineCount} online · {offlineCount} offline</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Search cameras..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm
                         focus:ring-2 focus:ring-red-500/20 focus:outline-none dark:text-white transition-all"
            />
          </div>

          {/* View toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutList size={14} />
            </button>
          </div>

          {isAdmin && (
            <>
              <button
                onClick={checkAllStatus}
                disabled={checking}
                title="Refresh status"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
                           hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white
                           px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm
                           shadow-red-600/20 active:scale-95 whitespace-nowrap"
              >
                <Plus size={15} /> Add Camera
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Bulk Action Toolbar ── */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-950/40
                        border border-red-200 dark:border-red-800 rounded-2xl
                        animate-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            {selectedIds.size} camera{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400
                       bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                       rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            Clear selection
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white
                       bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-all
                       shadow-sm shadow-red-600/20 active:scale-95"
          >
            {bulkDeleting
              ? <><RefreshCw size={13} className="animate-spin" /> Deleting…</>
              : <><Trash2 size={13} /> Delete {selectedIds.size}</>}
          </button>
        </div>
      )}

      {/* ── Camera Views ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
          <Camera size={40} strokeWidth={1.5} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search ? 'No cameras match your search.' : 'No cameras added yet.'}
          </p>
          {isAdmin && !search && (
            <button onClick={openAdd} className="mt-4 text-red-600 text-sm font-semibold hover:underline">
              + Add your first camera
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid / Card view ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {isAdmin && (
            <div className="col-span-full flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                id="grid-select-all"
              />
              <label htmlFor="grid-select-all" className="text-xs text-slate-500 cursor-pointer select-none">
                {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
              </label>
            </div>
          )}
          {paginatedCameras.map(cam => {
            const si = statusInfo(cam.status);
            const ipDisplay = cam.ip_address || cam.location?.split('@')[1]?.split('/')[0] || '—';
            const isSelected = selectedIds.has(cam.id);
            return (
              <div key={cam.id}
                className={`group bg-white dark:bg-slate-900 border rounded-2xl p-4
                           hover:border-red-400/50 hover:shadow-md transition-all duration-200
                           ${isSelected
                             ? 'border-red-400 dark:border-red-600 ring-2 ring-red-500/20'
                             : 'border-slate-200 dark:border-slate-800'}`}>

                {/* card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {isAdmin && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(cam.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-red-600 cursor-pointer shrink-0"
                      />
                    )}
                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <Camera size={14} className="text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[100px]" title={cam.name}>
                        {cam.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono">{ipDisplay}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${si.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${si.dot} ${cam.status === 'online' ? 'animate-pulse' : ''}`} />
                    {si.label}
                  </span>
                </div>

                <div className="flex gap-2 mb-3 text-[11px]">
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 font-medium">
                    {cam.brand || 'Unknown'}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 font-medium uppercase">
                    {cam.connection_type}
                  </span>
                  {cam.is_recording && (
                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-md font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> REC
                    </span>
                  )}
                </div>

                {isAdmin ? (
                  <div className="flex gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <button
                      onClick={() => toggleStatus(cam)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        cam.status === 'disabled'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                          : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50'
                      }`}
                    >
                      {cam.status === 'disabled' ? 'Enable' : 'Disable'}
                    </button>
                    <button onClick={() => setActiveAI(cam)} title="AI Models"
                      className="p-1.5 rounded-lg text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all">
                      <Brain size={15} />
                    </button>
                    <button onClick={() => openEdit(cam)} title="Edit"
                      className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                      <Edit size={15} />
                    </button>
                    <button onClick={() => handleDelete(cam.id)} title="Delete"
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all ml-auto">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <span className="text-xs text-slate-400 italic">View only</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List / Table view ── */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {isAdmin && (
                  <th className="px-4 py-3 w-10 border border-slate-200 dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                      title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider border border-slate-200 dark:border-slate-700">Camera</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider border border-slate-200 dark:border-slate-700">IP / Network</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider border border-slate-200 dark:border-slate-700">Brand</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider border border-slate-200 dark:border-slate-700">Protocol</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider text-center border border-slate-200 dark:border-slate-700">Status</th>
                {isAdmin && (
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider text-right border border-slate-200 dark:border-slate-700">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedCameras.map(cam => {
                const si = statusInfo(cam.status);
                const ipDisplay = cam.ip_address || cam.location?.split('@')[1]?.split('/')[0] || '—';
                const isSelected = selectedIds.has(cam.id);
                return (
                  <tr key={cam.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}>
                    {/* Checkbox */}
                    {isAdmin && (
                      <td className="px-4 py-3 border border-slate-100 dark:border-slate-800">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(cam.id)}
                          className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                        />
                      </td>
                    )}
                    {/* Camera name */}
                    <td className="px-4 py-3 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                          <Camera size={13} className="text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{cam.name}</p>
                          {cam.is_recording && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> REC
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* IP */}
                    <td className="px-4 py-3 border border-slate-100 dark:border-slate-800">
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{ipDisplay}</span>
                      {cam.port && <span className="ml-1 text-[10px] text-slate-400">:{cam.port}</span>}
                    </td>
                    {/* Brand */}
                    <td className="px-4 py-3 border border-slate-100 dark:border-slate-800">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400">
                        {cam.brand || 'Unknown'}
                      </span>
                    </td>
                    {/* Protocol */}
                    <td className="px-4 py-3 border border-slate-100 dark:border-slate-800">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                        {cam.connection_type}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 text-center border border-slate-100 dark:border-slate-800">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${si.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${si.dot} ${cam.status === 'online' ? 'animate-pulse' : ''}`} />
                        {si.label}
                      </span>
                    </td>
                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-4 py-3 border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleStatus(cam)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                              cam.status === 'disabled'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400'
                            }`}
                          >
                            {cam.status === 'disabled' ? 'Enable' : 'Disable'}
                          </button>
                          <button onClick={() => setActiveAI(cam)} title="AI Models"
                            className="p-1.5 rounded-lg text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all">
                            <Brain size={14} />
                          </button>
                          <button onClick={() => openEdit(cam)} title="Edit"
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDelete(cam.id)} title="Delete"
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Camera Pagination Controls ── */}
      {filtered.length > 0 && (
        <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>
              Showing <strong className="text-slate-700 dark:text-slate-200">{((currentPage - 1) * pageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(currentPage * pageSize, filtered.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filtered.length}</strong> cameras
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value={8}>8 per page</option>
              <option value={12}>12 per page</option>
              <option value={24}>24 per page</option>
              <option value={48}>48 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <ChevronLeft size={13} />
              <span>Prev</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => {
                  const prevP = arr[idx - 1];
                  const hasGap = prevP && p - prevP > 1;
                  return (
                    <div key={p} className="flex items-center">
                      {hasGap && <span className="px-1 text-slate-400">...</span>}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`w-6 h-6 rounded-md text-xs font-medium transition ${
                          currentPage === p
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {p}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50
                        animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg
                          border border-slate-200 dark:border-slate-700 overflow-hidden">

            {/* modal header */}
            <div className="flex items-center justify-between px-6 py-4
                            border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <Settings2 size={16} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editingCamera ? 'Edit Camera' : 'Add Camera'}
                  </h2>
                  <p className="text-[11px] text-slate-400">Configure connection settings</p>
                </div>
              </div>
              <button onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100
                           dark:hover:bg-slate-800 dark:hover:text-white transition-all">
                <X size={18} />
              </button>
            </div>

            {/* modal body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

              {/* ── Brand presets ── */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick Brand Preset</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries({
                    Dahua:     { path: '/cam/realmonitor?channel=1&subtype=0', port: 554 },
                    Hikvision: { path: '/Streaming/Channels/101',              port: 554 },
                    Axis:      { path: '/axis-media/media.amp',                port: 554 },
                    Uniview:   { path: '/unicast/c1/s0/live',                  port: 554 },
                    Reolink:   { path: '/h264Preview_01_main',                 port: 554 },
                    Generic:   { path: '/stream1',                             port: 554 },
                  }).map(([brand, cfg]) => (
                    <button key={brand} type="button"
                      onClick={() => patch({ brand, rtsp_path: cfg.path, port: cfg.port, connection_type: 'rtsp' })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        formData.brand === brand
                          ? 'bg-red-600 border-red-600 text-white shadow'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-red-400 hover:text-red-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                      }`}>
                      {brand}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Name + Location ── */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Camera Name *">
                  <input type="text" required placeholder="e.g. Front Gate"
                    value={formData.name} onChange={e => patch({ name: e.target.value })}
                    className={inputCls} />
                </Field>
                <Field label="Location / Description">
                  <input type="text" placeholder="e.g. Main entrance"
                    value={formData.location} onChange={e => patch({ location: e.target.value })}
                    className={inputCls} />
                </Field>
              </div>

              {/* ── IP + Port ── */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="IP Address *">
                    <input type="text" required placeholder="192.168.1.100"
                      value={formData.ip_address} onChange={e => patch({ ip_address: e.target.value })}
                      className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                <Field label="Port">
                  <input type="number" required placeholder="554"
                    value={formData.port} onChange={e => patch({ port: parseInt(e.target.value) || 554 })}
                    className={`${inputCls} font-mono text-center`} />
                </Field>
              </div>

              {/* ── Username + Password ── */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username">
                  <input type="text" placeholder="admin"
                    value={formData.username} onChange={e => patch({ username: e.target.value })}
                    className={inputCls} />
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                      value={formData.password} onChange={e => patch({ password: e.target.value })}
                      className={`${inputCls} pr-9`} />
                    <button type="button" onClick={() => setShowPassword(s => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </Field>
              </div>

              {/* ── Stream path + protocol row ── */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Stream Path">
                    <input type="text" required placeholder="/Streaming/Channels/101"
                      value={formData.rtsp_path} onChange={e => patch({ rtsp_path: e.target.value })}
                      className={`${inputCls} font-mono text-xs`} />
                  </Field>
                </div>
                <Field label="Protocol">
                  <select value={formData.connection_type} onChange={e => patch({ connection_type: e.target.value })} className={inputCls}>
                    <option value="rtsp">RTSP</option>
                    <option value="http">HTTP</option>
                    <option value="webrtc">WebRTC</option>
                  </select>
                </Field>
              </div>

              {/* ── Live URL preview ── */}
              <div className="rounded-xl bg-slate-950 dark:bg-black border border-slate-800 p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Preview</p>
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-slate-500 w-10 shrink-0 mt-0.5">RTSP</span>
                    <span className="text-[11px] font-mono text-emerald-400 break-all leading-relaxed">{liveRtsp}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 w-10 shrink-0">HLS</span>
                    <span className="text-[11px] font-mono text-blue-400 break-all">{liveHls}</span>
                  </div>
                </div>
              </div>

              {/* ── Resolution + FPS ── */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Resolution">
                  <select value={formData.resolution} onChange={e => patch({ resolution: e.target.value })} className={inputCls}>
                    <option value="1920x1080">1080p (1920×1080)</option>
                    <option value="1280x720">720p (1280×720)</option>
                    <option value="3840x2160">4K (3840×2160)</option>
                    <option value="2560x1440">1440p (2560×1440)</option>
                  </select>
                </Field>
                <Field label="FPS">
                  <input type="number" min={1} max={60}
                    value={formData.fps} onChange={e => patch({ fps: parseInt(e.target.value) || 25 })}
                    className={`${inputCls} text-center`} />
                </Field>
              </div>

              {/* ── Test result banner ── */}
              {testMsg && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium border ${
                  testResult === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400'
                }`}>
                  {testResult === 'success' ? <Wifi size={15} /> : <WifiOff size={15} />}
                  {testMsg}
                </div>
              )}

              {/* ── Footer buttons ── */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200
                             dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 rounded-xl transition-all">
                  Cancel
                </button>

                <button type="button" onClick={testConnection}
                  disabled={testing || !formData.ip_address}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-all flex items-center gap-2 disabled:opacity-50
                    ${testResult === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : testResult === 'error'   ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                  {testing ? <><RefreshCw size={14} className="animate-spin" /> Testing…</>
                    : testResult === 'success' ? <><Wifi size={14} /> Connected</>
                    : testResult === 'error'   ? <><WifiOff size={14} /> Failed</>
                    : <><Wifi size={14} /> Test Connection</>}
                </button>

                <div className="ml-auto flex gap-2">
                  {!editingCamera && (
                    <button type="submit" disabled={testing}
                      onClick={() => setSaveAndAddAnother(true)}
                      className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100
                                 dark:bg-red-900/20 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800
                                 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap">
                      + Add Another
                    </button>
                  )}
                  <button type="submit" disabled={testing}
                    onClick={() => setSaveAndAddAnother(false)}
                    className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700
                               rounded-xl transition-all shadow-sm disabled:opacity-50">
                    {editingCamera ? 'Save Changes' : 'Add Camera'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── AI Model Assignment ── */}
      {activeAI && (
        <CameraModelAssignment camera={activeAI} onClose={() => setActiveAI(null)} />
      )}
    </div>
  );
}

/* ─── sub-components ─────────────────────────────────────────────────────── */
const inputCls =
  'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 ' +
  'rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:outline-none transition-all ' +
  'dark:text-white placeholder:text-slate-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
