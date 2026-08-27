import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase, type NumberPlate, type KnownPlate } from '../lib/supabase';
import { 
  Car, Search, RefreshCw, Calendar, Clock, MapPin, Trash2, Edit2, X, Check, 
  Eye, User, Shield, AlertTriangle, UserCheck, Plus, Bell, Volume2, 
  VolumeX, CheckCircle2, HelpCircle, ChevronLeft, ChevronRight
} from 'lucide-react';

export const VEHICLE_TAGS = [
  { value: 'unknown', label: 'Unknown', color: '#64748B', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700', icon: '❓' },
  { value: 'vip', label: 'VIP', color: '#10B981', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: '👑' },
  { value: 'staff', label: 'Staff', color: '#3B82F6', bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800', icon: '💼' },
  { value: 'resident', label: 'Resident', color: '#8B5CF6', bg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800', icon: '🏠' },
  { value: 'visitor', label: 'Visitor', color: '#F59E0B', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800', icon: '🚗' },
  { value: 'watchlist', label: 'Watchlist', color: '#EF4444', bg: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800', icon: '⚠️' },
  { value: 'blocked', label: 'Blocked', color: '#991B1B', bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 dark:border-rose-800', icon: '⛔' },
] as const;

export const HIGHLIGHT_COLORS = [
  { name: 'Slate', hex: '#64748B' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Red', hex: '#EF4444' },
];

export default function NumberPlatesLog() {
  const [activeTab, setActiveTab] = useState<'logs' | 'directory'>('logs');
  const [plates, setPlates] = useState<NumberPlate[]>([]);
  const [knownPlates, setKnownPlates] = useState<KnownPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  
  // Pagination State for Detections and Directory
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(10);
  const [dirPage, setDirPage] = useState(1);
  const [dirPageSize, setDirPageSize] = useState(10);
  
  // Edit / Register Modal State
  const [editingPlate, setEditingPlate] = useState<{
    plate_text: string;
    owner_name?: string;
    vehicle_desc?: string;
    tag?: string;
    highlight_color?: string;
    alert_on_detect?: boolean;
    notes?: string;
    snapshot_url?: string;
    id?: string;
    isNew?: boolean;
  } | null>(null);

  const [editPlateText, setEditPlateText] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editVehicleDesc, setEditVehicleDesc] = useState('');
  const [editTag, setEditTag] = useState<string>('unknown');
  const [editColor, setEditColor] = useState<string>('#64748B');
  const [editAlertOnDetect, setEditAlertOnDetect] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const knownMapRef = useRef<Map<string, KnownPlate>>(new Map());

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchKnownPlates = async () => {
    setDirectoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('known_plates')
        .select('*')
        .order('last_seen', { ascending: false });

      if (!error && data) {
        setKnownPlates(data);
        const map = new Map<string, KnownPlate>();
        data.forEach(kp => map.set(kp.plate_text, kp));
        knownMapRef.current = map;
      }
    } catch (err) {
      console.error('Error fetching known plates:', err);
    } finally {
      setDirectoryLoading(false);
    }
  };

  const fetchPlates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('number_plates')
        .select(`
          *,
          cameras ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(150);

      if (error) throw error;
      setPlates(data || []);
    } catch (err) {
      console.error('Error fetching number plates:', err);
    } finally {
      setLoading(false);
    }
  };

  const deletePlate = async (id: string) => {
    if (!window.confirm('Delete this plate log?')) return;
    try {
      await supabase.from('number_plates').delete().eq('id', id);
      setPlates(plates.filter(p => p.id !== id));
      showToast('Plate log deleted.');
    } catch (err) {
      console.error(err);
    }
  };

  const deleteDirectoryPlate = async (plateText: string, id: string) => {
    if (!window.confirm(`Remove ${plateText} from directory?`)) return;
    try {
      await supabase.from('known_plates').delete().eq('id', id);
      setKnownPlates(knownPlates.filter(k => k.id !== id));
      knownMapRef.current.delete(plateText);
      showToast(`Removed ${plateText} from directory.`);
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (item: {
    plate_text: string;
    owner_name?: string;
    vehicle_desc?: string;
    tag?: string;
    highlight_color?: string;
    alert_on_detect?: boolean;
    notes?: string;
    snapshot_url?: string;
    id?: string;
    isNew?: boolean;
  }) => {
    const known = knownMapRef.current.get(item.plate_text);
    
    setEditingPlate(item);
    setEditPlateText(item.plate_text || '');
    setEditOwnerName(item.owner_name || known?.owner_name || '');
    setEditVehicleDesc(item.vehicle_desc || known?.vehicle_desc || '');
    setEditTag(item.tag || known?.tag || 'unknown');
    setEditColor(item.highlight_color || known?.highlight_color || '#64748B');
    setEditAlertOnDetect(item.alert_on_detect !== undefined ? item.alert_on_detect : (known?.alert_on_detect ?? false));
    setEditNotes(item.notes || known?.notes || '');
  };

  const handleSaveVehicleProfile = async () => {
    if (!editPlateText.trim()) return;
    setSaving(true);

    const cleanedPlate = editPlateText.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const owner = editOwnerName.trim();
    const vehicle = editVehicleDesc.trim();
    const tag = editTag || 'unknown';
    const color = editColor || '#64748B';
    const alertOn = editAlertOnDetect;
    const notes = editNotes.trim();

    try {
      // 1. Upsert into known_plates
      const directoryPayload: Record<string, any> = {
        plate_text: cleanedPlate,
        owner_name: owner,
        vehicle_desc: vehicle,
        tag: tag,
        highlight_color: color,
        alert_on_detect: alertOn,
        notes: notes,
        source: 'manual_registration',
        last_seen: new Date().toISOString(),
      };

      try {
        await supabase
          .from('known_plates')
          .upsert(directoryPayload, { onConflict: 'plate_text' });
      } catch {
        await supabase
          .from('known_plates')
          .upsert({ plate_text: cleanedPlate, image_hash: 'manual_entry', source: 'manual_registration' }, { onConflict: 'plate_text' });
      }

      // 2. Update historical number_plates
      try {
        await supabase
          .from('number_plates')
          .update({
            plate_text: cleanedPlate,
            owner_name: owner,
            tag: tag,
            highlight_color: color
          })
          .eq('plate_text', cleanedPlate);
      } catch {}

      if (editingPlate?.id && !editingPlate.isNew) {
        try {
          await supabase
            .from('number_plates')
            .update({
              plate_text: cleanedPlate,
              owner_name: owner,
              tag: tag,
              highlight_color: color
            })
            .eq('id', editingPlate.id);
        } catch {}
      }

      showToast(`Vehicle ${cleanedPlate} saved as ${tag.toUpperCase()}${owner ? ` (${owner})` : ''}`);
      setEditingPlate(null);
      
      fetchKnownPlates();
      fetchPlates();
    } catch (err) {
      console.error('Error saving vehicle profile:', err);
      alert('Failed to save vehicle details.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchKnownPlates();
    fetchPlates();
    
    // Realtime table update
    const channel = supabase
      .channel('public:number_plates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'number_plates' },
        () => {
          fetchPlates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getTagDetails = (tagValue?: string) => {
    const cleanTag = (tagValue || 'unknown').toLowerCase();
    return VEHICLE_TAGS.find(t => t.value === cleanTag) || VEHICLE_TAGS[0];
  };

  // Filter logs
  const filteredPlates = useMemo(() => {
    return plates.filter(p => {
      const known = knownMapRef.current.get(p.plate_text);
      const owner = p.owner_name || known?.owner_name || '';
      const tag = (p.tag || known?.tag || 'unknown').toLowerCase();

      const matchesSearch = 
        p.plate_text.toLowerCase().includes(search.toLowerCase()) ||
        owner.toLowerCase().includes(search.toLowerCase()) ||
        (p.cameras?.name || '').toLowerCase().includes(search.toLowerCase());
      
      const matchesTag = tagFilter === 'all' || tag === tagFilter;
      return matchesSearch && matchesTag;
    });
  }, [plates, search, tagFilter]);

  const totalLogsPages = Math.max(1, Math.ceil(filteredPlates.length / logsPageSize));
  const paginatedPlates = useMemo(() => {
    const start = (logsPage - 1) * logsPageSize;
    return filteredPlates.slice(start, start + logsPageSize);
  }, [filteredPlates, logsPage, logsPageSize]);

  // Filter directory
  const filteredDirectory = useMemo(() => {
    return knownPlates.filter(kp => {
      const matchesSearch = 
        kp.plate_text.toLowerCase().includes(search.toLowerCase()) ||
        (kp.owner_name && kp.owner_name.toLowerCase().includes(search.toLowerCase())) ||
        (kp.vehicle_desc && kp.vehicle_desc.toLowerCase().includes(search.toLowerCase()));
      
      const tag = (kp.tag || 'unknown').toLowerCase();
      const matchesTag = tagFilter === 'all' || tag === tagFilter;
      return matchesSearch && matchesTag;
    });
  }, [knownPlates, search, tagFilter]);

  const totalDirPages = Math.max(1, Math.ceil(filteredDirectory.length / dirPageSize));
  const paginatedDirectory = useMemo(() => {
    const start = (dirPage - 1) * dirPageSize;
    return filteredDirectory.slice(start, start + dirPageSize);
  }, [filteredDirectory, dirPage, dirPageSize]);

  // Reset pagination on search or filter change
  useEffect(() => {
    setLogsPage(1);
    setDirPage(1);
  }, [search, tagFilter]);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Car size={22} className="text-indigo-600 dark:text-indigo-400" />
            License Plates
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track license plate detections, owner profiles, and category alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openEditModal({ plate_text: '', tag: 'unknown', highlight_color: '#64748B', isNew: true })}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={15} />
            Register Vehicle
          </button>
        </div>
      </div>

      {/* Tabs & Search Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Simple Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg self-start">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeTab === 'logs'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Detections ({plates.length})
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeTab === 'directory'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Owner Directory ({knownPlates.length})
          </button>
        </div>

        {/* Search & Category Dropdown */}
        <div className="flex items-center gap-2 flex-1 md:justify-end">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input 
              type="text"
              placeholder="Search plate or owner..."
              className="w-full pl-8 pr-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {VEHICLE_TAGS.map(t => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>

          <button 
            onClick={() => { fetchPlates(); fetchKnownPlates(); }}
            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw size={15} className={`text-slate-500 ${loading || directoryLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: DETECTION LOGS TABLE (Clean & Simple) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Plate</th>
                  <th className="py-3 px-4">Category / Owner</th>
                  <th className="py-3 px-4">Camera</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Crop</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredPlates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No matching license plate records.
                    </td>
                  </tr>
                ) : (
                  paginatedPlates.map((plate) => {
                    const known = knownMapRef.current.get(plate.plate_text);
                    const owner = plate.owner_name || known?.owner_name;
                    const tagValue = plate.tag || known?.tag || 'unknown';
                    const tagInfo = getTagDetails(tagValue);
                    const color = plate.highlight_color || known?.highlight_color || tagInfo.color;

                    return (
                      <tr key={plate.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition">
                        {/* Plate Text */}
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5">
                            <span 
                              className="px-2 py-0.5 font-mono font-bold rounded bg-amber-400 text-slate-950 text-sm tracking-wider border border-amber-500"
                              style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                            >
                              {plate.plate_text}
                            </span>
                            {plate.confidence ? (
                              <span className="text-[11px] text-slate-400">
                                {plate.confidence.toFixed(0)}%
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Category & Owner */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tagInfo.bg}`}>
                              <span>{tagInfo.icon}</span>
                              <span>{tagInfo.label}</span>
                            </span>
                            {owner ? (
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {owner}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </div>
                        </td>

                        {/* Camera */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {plate.cameras?.name || 'Car Park'}
                        </td>

                        {/* Time */}
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {new Date(plate.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(plate.created_at).toLocaleDateString()}
                        </td>

                        {/* Crop */}
                        <td className="py-2 px-4">
                          {plate.snapshot_url ? (
                            <div 
                              onClick={() => setPreviewImage({ url: plate.snapshot_url, title: `${plate.plate_text} ${owner ? `(${owner})` : ''}` })}
                              className="w-20 h-9 rounded overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center hover:opacity-80 transition"
                            >
                              <img 
                                src={plate.snapshot_url} 
                                alt={plate.plate_text}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No image</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right space-x-1">
                          <button 
                            onClick={() => openEditModal({
                              plate_text: plate.plate_text,
                              owner_name: owner,
                              vehicle_desc: known?.vehicle_desc,
                              tag: tagValue,
                              highlight_color: color,
                              alert_on_detect: known?.alert_on_detect ?? false,
                              snapshot_url: plate.snapshot_url,
                              id: plate.id,
                            })}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                            title="Edit Category & Owner"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => deletePlate(plate.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Detections Pagination Footer */}
          {filteredPlates.length > 0 && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span>
                  Showing <strong className="text-slate-700 dark:text-slate-200">{((logsPage - 1) * logsPageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(logsPage * logsPageSize, filteredPlates.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredPlates.length}</strong> detections
                </span>
                <select
                  value={logsPageSize}
                  onChange={(e) => {
                    setLogsPageSize(Number(e.target.value));
                    setLogsPage(1);
                  }}
                  className="ml-2 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLogsPage(prev => Math.max(1, prev - 1))}
                  disabled={logsPage === 1}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                >
                  <ChevronLeft size={13} />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalLogsPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalLogsPages || Math.abs(p - logsPage) <= 1)
                    .map((p, idx, arr) => {
                      const prevP = arr[idx - 1];
                      const hasGap = prevP && p - prevP > 1;
                      return (
                        <div key={p} className="flex items-center">
                          {hasGap && <span className="px-1 text-slate-400">...</span>}
                          <button
                            onClick={() => setLogsPage(p)}
                            className={`w-6 h-6 rounded text-xs font-medium transition ${
                              logsPage === p
                                ? 'bg-indigo-600 text-white shadow-sm'
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
                  onClick={() => setLogsPage(prev => Math.min(totalLogsPages, prev + 1))}
                  disabled={logsPage === totalLogsPages}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: VEHICLE & OWNER DIRECTORY */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'directory' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Plate</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Owner Name</th>
                  <th className="py-3 px-4">Vehicle Model</th>
                  <th className="py-3 px-4">Siren Alert</th>
                  <th className="py-3 px-4">Times Seen</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredDirectory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No vehicles registered in directory.
                    </td>
                  </tr>
                ) : (
                  paginatedDirectory.map((kp) => {
                    const tagInfo = getTagDetails(kp.tag);
                    const color = kp.highlight_color || tagInfo.color;

                    return (
                      <tr key={kp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition">
                        <td className="py-3 px-4">
                          <span 
                            className="px-2 py-0.5 font-mono font-bold rounded bg-amber-400 text-slate-950 text-sm tracking-wider border border-amber-500"
                            style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                          >
                            {kp.plate_text}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tagInfo.bg}`}>
                            <span>{tagInfo.icon}</span>
                            <span>{tagInfo.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {kp.owner_name || <span className="text-slate-400 italic">None</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {kp.vehicle_desc || '—'}
                        </td>
                        <td className="py-3 px-4">
                          {kp.alert_on_detect ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Bell size={12} /> ON (Siren)
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              OFF (Silent)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {kp.times_seen || 1}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button 
                            onClick={() => openEditModal({
                              plate_text: kp.plate_text,
                              owner_name: kp.owner_name,
                              vehicle_desc: kp.vehicle_desc,
                              tag: kp.tag || 'unknown',
                              highlight_color: color,
                              alert_on_detect: kp.alert_on_detect ?? false,
                              notes: kp.notes,
                              id: kp.id
                            })}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => deleteDirectoryPlate(kp.plate_text, kp.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Directory Pagination Footer */}
          {filteredDirectory.length > 0 && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span>
                  Showing <strong className="text-slate-700 dark:text-slate-200">{((dirPage - 1) * dirPageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(dirPage * dirPageSize, filteredDirectory.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredDirectory.length}</strong> vehicles
                </span>
                <select
                  value={dirPageSize}
                  onChange={(e) => {
                    setDirPageSize(Number(e.target.value));
                    setDirPage(1);
                  }}
                  className="ml-2 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDirPage(prev => Math.max(1, prev - 1))}
                  disabled={dirPage === 1}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                >
                  <ChevronLeft size={13} />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalDirPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalDirPages || Math.abs(p - dirPage) <= 1)
                    .map((p, idx, arr) => {
                      const prevP = arr[idx - 1];
                      const hasGap = prevP && p - prevP > 1;
                      return (
                        <div key={p} className="flex items-center">
                          {hasGap && <span className="px-1 text-slate-400">...</span>}
                          <button
                            onClick={() => setDirPage(p)}
                            className={`w-6 h-6 rounded text-xs font-medium transition ${
                              dirPage === p
                                ? 'bg-indigo-600 text-white shadow-sm'
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
                  onClick={() => setDirPage(prev => Math.min(totalDirPages, prev + 1))}
                  disabled={dirPage === totalDirPages}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SIMPLE & COMPACT VEHICLE / OWNER MODAL (No Scrollbar) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {editingPlate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-5 shadow-xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Car size={16} className="text-indigo-600 dark:text-indigo-400" />
                {editingPlate.isNew ? 'Register Vehicle' : 'Edit Vehicle Details'}
              </h3>
              <button 
                onClick={() => setEditingPlate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-3 space-y-3">
              {/* Row 1: Plate & Owner */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Plate Number *
                  </label>
                  <input 
                    type="text" 
                    value={editPlateText}
                    onChange={(e) => setEditPlateText(e.target.value.toUpperCase())}
                    placeholder="AGC6689"
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm font-bold text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Owner / Driver Name
                  </label>
                  <input 
                    type="text" 
                    value={editOwnerName}
                    onChange={(e) => setEditOwnerName(e.target.value)}
                    placeholder="e.g. John Moyo"
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Vehicle Model & Color */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Vehicle Model / Description
                </label>
                <input 
                  type="text" 
                  value={editVehicleDesc}
                  onChange={(e) => setEditVehicleDesc(e.target.value)}
                  placeholder="e.g. Silver Toyota Hilux GD-6"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Row 3: Category Selector */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Category (Default: Unknown)
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {VEHICLE_TAGS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setEditTag(t.value);
                        setEditColor(t.color);
                        if (t.value === 'watchlist' || t.value === 'blocked' || t.value === 'vip') {
                          setEditAlertOnDetect(true);
                        }
                      }}
                      className={`p-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition ${
                        editTag === t.value
                          ? `${t.bg} ring-1 ring-indigo-500`
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{t.icon}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: Siren & Realtime Alert Override Switch */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bell size={14} className={editAlertOnDetect ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
                    Siren & Arrival Alert Override
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {editAlertOnDetect ? 'Enabled — Plays siren & announces arrival' : 'Disabled — Silent capture without siren'}
                  </p>
                </div>
                <input 
                  type="checkbox"
                  checked={editAlertOnDetect}
                  onChange={(e) => setEditAlertOnDetect(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              {/* Row 5: Notes */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Access Notes / Instructions
                </label>
                <input 
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Reserved bay #2, visitor pass..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEditingPlate(null)}
                className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVehicleProfile}
                disabled={saving || !editPlateText.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check size={14} />
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Preview Zoom Modal */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 rounded-xl overflow-hidden max-w-xl w-full p-3 shadow-2xl border border-slate-700 relative"
          >
            <div className="flex items-center justify-between pb-2 text-white border-b border-slate-800 mb-2">
              <span className="font-mono font-bold text-amber-400 text-sm">{previewImage.title}</span>
              <button onClick={() => setPreviewImage(null)} className="text-slate-400 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center justify-center bg-black rounded-lg p-1 min-h-[180px]">
              <img 
                src={previewImage.url} 
                alt="Zoom" 
                className="max-w-full max-h-[65vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
