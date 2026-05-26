import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertTriangle, Camera, Filter, LayoutList, LayoutGrid, Trash2, ExternalLink, CheckSquare, Square, ChevronLeft, ChevronRight, Search, Calendar, X, AlertCircle, FileDown } from 'lucide-react';
import { supabase, type Event, type Camera as CameraType } from '../lib/supabase';
import EventNotifications from './EventNotifications';
import EventStatistics from './EventStatistics';

export default function EventsMonitoring() {
  const [events, setEvents] = useState<Event[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'acknowledged'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleSelectAll = () => {
    if (selectedEventIds.size === filteredEvents.length && filteredEvents.length > 0) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(filteredEvents.map(e => e.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedEventIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedEventIds(newSelected);
  };

  const handleBulkAcknowledge = async () => {
    const ids = Array.from(selectedEventIds);
    if (ids.length === 0) return;
    await supabase.from('events').update({ acknowledged: true }).in('id', ids);
    setSelectedEventIds(new Set());
    loadEvents();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedEventIds);
    if (ids.length === 0) return;
    if (confirm(`Delete ${ids.length} selected event(s)? This cannot be undone.`)) {
      await supabase.from('events').delete().in('id', ids);
      setSelectedEventIds(new Set());
      loadEvents();
    }
  };

  const handleBulkExport = (format: 'csv' | 'json' = 'csv') => {
    const ids = Array.from(selectedEventIds);
    const toExport = ids.length > 0
      ? events.filter(e => ids.includes(e.id))
      : filteredEvents;         // export all visible if nothing selected
    if (toExport.length === 0) return;

    if (format === 'json') {
      // JSON export
      const rows = toExport.map(e => ({
        id: e.id,
        event_type: e.event_type,
        camera: getCameraName(e.camera_id),
        camera_id: e.camera_id,
        confidence: e.confidence,
        acknowledged: e.acknowledged,
        snapshot_url: e.snapshot_url || '',
        metadata: JSON.stringify(e.metadata || {}),
        created_at: e.created_at,
      }));
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `events-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }

    // CSV export
    const headers = ['ID','Event Type','Camera','Confidence (%)','Acknowledged','Snapshot URL','Metadata','Timestamp'];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      headers.join(','),
      ...toExport.map(e => [
        escape(e.id),
        escape(e.event_type),
        escape(getCameraName(e.camera_id)),
        escape(e.confidence ?? ''),
        escape(e.acknowledged ? 'Yes' : 'No'),
        escape(e.snapshot_url || ''),
        escape(JSON.stringify(e.metadata || {})),
        escape(new Date(e.created_at).toLocaleString()),
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `events-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setEventTypeFilter('all');
    setFilter('all');
    setCurrentPage(1);
  };

  const handleClearAllEvents = async () => {
    setShowClearAllModal(true);
  };

  const confirmClearAllEvents = async () => {
    if (confirmText !== 'DELETE ALL') return;

    try {
      await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setEvents([]);
      setSelectedEventIds(new Set());
      setShowClearAllModal(false);
      setConfirmText('');
      loadEvents();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete events.');
    }
  };

  const closeClearAllModal = () => {
    setShowClearAllModal(false);
    setConfirmText('');
  };



  useEffect(() => {
    loadEvents();
    loadCameras();
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const loadEvents = async () => {
    let query = supabase.from('events').select('*').order('created_at', { ascending: false });

    if (filter === 'acknowledged') {
      query = query.eq('acknowledged', true);
    } else if (filter === 'unacknowledged') {
      query = query.eq('acknowledged', false);
    }

    // Apply date filters if set
    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }
    if (endDate) {
      // Add one day to include the entire end date
      const endDateTime = new Date(endDate);
      endDateTime.setDate(endDateTime.getDate() + 1);
      query = query.lt('created_at', endDateTime.toISOString());
    }

    query = query.limit(1000); // Increase limit for date filtering

    const { data } = await query;
    if (data) setEvents(data);
  };

  const loadCameras = async () => {
    const { data } = await supabase.from('cameras').select('*');
    if (data) setCameras(data);
  };

  const acknowledgeEvent = async (eventId: string) => {
    await supabase.from('events').update({ acknowledged: true }).eq('id', eventId);
    loadEvents();
  };

  const deleteEvent = async (eventId: string) => {
    if (confirm('Delete this event? This action cannot be undone.')) {
      await supabase.from('events').delete().eq('id', eventId);
      loadEvents();
    }
  };

  const getCameraName = (cameraId: string) => {
    const camera = cameras.find((c) => c.id === cameraId);
    return camera ? camera.name : 'Unknown Camera';
  };

  const getEventTypeIcon = (eventType: string) => {
    const t = eventType.toLowerCase();
    if (t.includes('blacklist')) return '🚫';
    if (t.includes('unknown face')) return '👤';
    if (t.includes('face detected') || t.includes('face recognized')) return '🆔';
    if (t.includes('authorized')) return '✅';
    if (t.includes('loitering')) return '⏳';
    if (t.includes('crowd')) return '👥';
    if (t.includes('fight') || t.includes('aggression')) return '🥊';
    if (t.includes('fall')) return '🚨';
    if (t.includes('dress_code') || t.includes('dress code')) return '👕';
    if (t.includes('abandoned')) return '🎒';
    if (t.includes('illegal_parking') || t.includes('parking')) return '🅿️';
    if (t.includes('fire')) return '🔥';
    if (t.includes('smoke')) return '💨';
    if (t.includes('_crossing')) return '🚷';
    if (t.includes('_entry')) return '⚠️';
    if (t.includes('weapon') || t.includes('gun') || t.includes('knife') || t.includes('pistol') || t.includes('rifle') || t.includes('firearm')) return '🔫';
    if (t.includes('no-hardhat') || t.includes('no-helmet')) return '👷‍♂️';
    if (t.includes('no-safety vest') || t.includes('no-vest')) return '🦺';
    if (t.includes('no-mask')) return '😷';
    if (t.includes('hardhat') || t.includes('helmet')) return '⛑️';
    if (t.includes('safety vest') || t.includes('vest')) return '🦺';
    if (t.includes('license_plate') || t.includes('number_plate') || t.includes('license-plate')) return '🪧';
    if (t.includes('person')) return '👤';
    if (t.includes('vehicle') || t.includes('car') || t.includes('truck')) return '🚗';
    if (t.includes('dog') || t.includes('cat') || t.includes('animal')) return '🐾';
    if (t.includes('tamper')) return '📵';
    if (t.includes('motion')) return '🔄';
    if (t.includes('intrusion')) return '⚠️';
    return '📍';
  };

  const getEventTypeColor = (eventType: string) => {
    const t = eventType.toLowerCase();
    if (t.includes('blacklist')) return 'bg-red-700 text-white font-bold animate-pulse';
    if (t.includes('unknown face')) return 'bg-red-500 text-white font-bold';
    if (t.includes('weapon') || t.includes('gun') || t.includes('knife') || t.includes('pistol') || t.includes('rifle')) return 'bg-red-600 text-white animate-pulse';
    if (t.includes('fire') || t.includes('smoke')) return 'bg-orange-600 text-white animate-pulse';
    if (t.includes('fight') || t.includes('aggression') || t.includes('fall')) return 'bg-red-500 text-white';
    if (t.includes('_crossing') || t.includes('_entry')) return 'bg-purple-600 text-white border-2 border-purple-400';
    if (t.includes('no-hardhat') || t.includes('no-safety vest') || t.includes('no-mask') || t.includes('no-helmet') || t.includes('no-vest')) return 'bg-orange-100 text-orange-800 border-2 border-orange-500';
    if (t.includes('loitering')) return 'bg-amber-100 text-amber-800 border border-amber-400';
    if (t.includes('crowd')) return 'bg-amber-200 text-amber-900';
    if (t.includes('dress_code') || t.includes('dress code')) return 'bg-purple-100 text-purple-800 border border-purple-300';
    if (t.includes('abandoned') || t.includes('parking')) return 'bg-yellow-100 text-yellow-800';
    if (t.includes('face detected') || t.includes('face recognized')) return 'bg-blue-100 text-blue-700';
    if (t.includes('authorized')) return 'bg-emerald-100 text-emerald-700';
    if (t.includes('hardhat') || t.includes('safety vest')) return 'bg-green-100 text-green-700';
    if (t.includes('license_plate') || t.includes('number_plate')) return 'bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold';
    if (t.includes('person')) return 'bg-blue-100 text-blue-700';
    if (t.includes('vehicle') || t.includes('car') || t.includes('truck')) return 'bg-sky-100 text-sky-700';
    if (t.includes('tamper')) return 'bg-red-100 text-red-700 border border-red-300';
    return 'bg-slate-100 text-slate-700';
  };

  // Render rich metadata from AI event as readable badges
  const MetadataBadges = ({ metadata }: { metadata: Record<string, any> }) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    const badges: { label: string; value: string; color: string }[] = [];
    if (metadata.person_name) badges.push({ label: '👤', value: metadata.person_name, color: 'bg-blue-50 text-blue-700 border-blue-200' });
    if (metadata.role) badges.push({ label: '🏷️', value: metadata.role, color: 'bg-slate-50 text-slate-600 border-slate-200' });
    if (metadata.department) badges.push({ label: '🏢', value: metadata.department, color: 'bg-slate-50 text-slate-500 border-slate-200' });
    if (metadata.face_confidence) badges.push({ label: '🎯', value: `${metadata.face_confidence}% match`, color: 'bg-indigo-50 text-indigo-600 border-indigo-200' });
    if (metadata.dwell_time_min) badges.push({ label: '⏱️', value: `${metadata.dwell_time_min}m dwell`, color: 'bg-amber-50 text-amber-700 border-amber-200' });
    if (metadata.colors_detected) badges.push({ label: '🎨', value: (metadata.colors_detected as string[]).join(', '), color: 'bg-purple-50 text-purple-700 border-purple-200' });
    if (metadata.violation_type) badges.push({ label: '⚠️', value: metadata.violation_type, color: 'bg-red-50 text-red-600 border-red-200' });
    if (metadata.plate_text) badges.push({ label: '🪧', value: metadata.plate_text, color: 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold' });
    if (metadata.vehicle) badges.push({ label: '🚗', value: metadata.vehicle, color: 'bg-sky-50 text-sky-700 border-sky-200' });
    if (metadata.stationary_minutes) badges.push({ label: '🅿️', value: `${metadata.stationary_minutes}m parked`, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' });
    if (metadata.crowd_count) badges.push({ label: '👥', value: `${metadata.crowd_count} people`, color: 'bg-amber-50 text-amber-700 border-amber-200' });
    if (badges.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1.5">
        {badges.map((b, i) => (
          <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${b.color}`}>
            {b.label} {b.value}
          </span>
        ))}
      </div>
    );
  };

  // Apply search query filter
  let filteredEvents = eventTypeFilter === 'all' ? events : events.filter((e) => e.event_type === eventTypeFilter);

  if (searchQuery.trim()) {
    filteredEvents = filteredEvents.filter(e =>
      e.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getCameraName(e.camera_id).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  const totalPages = Math.ceil(filteredEvents.length / pageSize);
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const uniqueEventTypes = Array.from(new Set(events.map((e) => e.event_type)));

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, eventTypeFilter]);

  return (
    <>
      <EventNotifications />
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Events Monitoring</h1>
            <p className="text-slate-600 mt-1">AI-detected events from all cameras</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg text-sm font-medium border border-blue-100 dark:border-blue-900/50">
              <Bell size={16} />
              <span>{events.filter((e) => !e.acknowledged).length} unacknowledged</span>
            </div>
            <button
              onClick={handleClearAllEvents}
              className="px-3 py-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
              title="Permanently delete ALL events"
            >
              Clear History
            </button>
          </div>
        </div>

        <EventStatistics />

        {/* Unified Toolbar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 space-y-4">
          {/* Top Row: Search & View Options */}
          <div className="flex flex-col lg:flex-row gap-4 justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-red-500 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Search events (e.g. 'person', 'camera 1')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
              />
            </div>

            {/* View Toggles & Bulk Actions */}
            <div className="flex items-center gap-3">
              {selectedEventIds.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <button
                    onClick={handleBulkAcknowledge}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm hover:shadow"
                  >
                    <CheckCircle size={16} />
                    <span className="hidden sm:inline">Ack ({selectedEventIds.size})</span>
                  </button>
                  <button
                    onClick={() => handleBulkExport('csv')}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm hover:shadow"
                    title="Export selected events as CSV"
                  >
                    <FileDown size={16} />
                    <span className="hidden sm:inline">CSV ({selectedEventIds.size})</span>
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium shadow-sm hover:shadow"
                  >
                    <Trash2 size={16} />
                    <span className="hidden sm:inline">Del ({selectedEventIds.size})</span>
                  </button>
                </div>
              )}

              <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden sm:block" />

              <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                  title="List View"
                >
                  <LayoutList size={18} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                  title="Grid View"
                >
                  <LayoutGrid size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Second Row: Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4">

            {/* Status Tabs */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg self-start sm:self-auto">
              {['all', 'unacknowledged', 'acknowledged'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilter(status as any)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${filter === status
                    ? 'bg-white dark:bg-slate-700 string shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none h-10">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                  className="h-full pl-9 pr-8 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none appearance-none cursor-pointer hover:border-slate-300 transition-colors w-full sm:w-48"
                >
                  <option value="all">All Event Types</option>
                  {uniqueEventTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 h-10 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 hover:border-slate-300 transition-colors">
                <Calendar className="text-slate-400" size={16} />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm text-slate-600 dark:text-slate-300 focus:ring-0 w-28"
                />
                <span className="text-slate-300">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm text-slate-600 dark:text-slate-300 focus:ring-0 w-28"
                />
              </div>

              {(searchQuery || startDate || endDate || eventTypeFilter !== 'all' || filter !== 'all') && (
                <button
                  onClick={handleClearFilters}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Clear Filters"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Bell className="mx-auto text-slate-400 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Events</h3>
            <p className="text-slate-600 dark:text-slate-400">No events match your current filters</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "space-y-4" : "overflow-x-auto"}>
            {viewMode === 'list' ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-4 w-12 border border-slate-200 dark:border-slate-700">
                        <button
                          onClick={handleSelectAll}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                        >
                          {selectedEventIds.size === filteredEvents.length && filteredEvents.length > 0 ? (
                            <CheckSquare size={18} />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Type</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Camera</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Confidence</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Time</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Snapshot</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Status</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {paginatedEvents.map((event) => (
                      <tr key={event.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${selectedEventIds.has(event.id) ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                        <td className="p-4 border border-slate-100 dark:border-slate-700">
                          <button
                            onClick={() => handleToggleSelect(event.id)}
                            className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                          >
                            {selectedEventIds.has(event.id) ? (
                              <CheckSquare size={18} className="text-red-600 dark:text-red-500" />
                            ) : (
                              <Square size={18} />
                            )}
                          </button>
                        </td>
                        <td className="p-4 font-medium text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <div className="text-xl">{getEventTypeIcon(event.event_type)}</div>
                            <div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getEventTypeColor(event.event_type)}`}>
                                {event.event_type.replace(/_/g, ' ')}
                              </span>
                              <MetadataBadges metadata={event.metadata} />
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">{getCameraName(event.camera_id)}</td>
                        <td className="p-4 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">{event.confidence}%</td>
                        <td className="p-4 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                          {new Date(event.created_at).toLocaleString()}
                        </td>
                        <td className="p-4 border border-slate-100 dark:border-slate-700">
                          {event.snapshot_url ? (
                            <a
                              href={event.snapshot_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                            >
                              <ExternalLink size={14} />
                              View
                            </a>
                          ) : (
                            <span className="text-slate-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="p-4 border border-slate-100 dark:border-slate-700">
                          {event.acknowledged ? (
                            <span className="flex items-center gap-1 text-sm text-green-600">
                              <CheckCircle size={16} />
                              Ack
                            </span>
                          ) : (
                            <span className="text-sm text-orange-600">New</span>
                          )}
                        </td>
                        <td className="p-4 border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            {!event.acknowledged && (
                              <button
                                onClick={() => acknowledgeEvent(event.id)}
                                className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                              >
                                <CheckCircle size={14} />
                                Ack
                              </button>
                            )}
                            <button
                              onClick={() => deleteEvent(event.id)}
                              className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                            >
                              <Trash2 size={14} />
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              paginatedEvents.map((event) => (
                <div
                  key={event.id}
                  className={`group bg-white dark:bg-slate-800 rounded-2xl shadow-sm border transition-all hover:shadow-md ${event.acknowledged
                    ? 'border-slate-200 dark:border-slate-700'
                    : 'border-orange-200 dark:border-orange-900/50 bg-orange-50/30'
                    } ${selectedEventIds.has(event.id) ? 'ring-2 ring-red-500' : ''}`}
                >
                  <div className="relative aspect-video bg-slate-100 dark:bg-slate-900 rounded-t-2xl overflow-hidden">
                    {/* Selection Checkbox Overlay */}
                    <div className={`absolute top-2 right-2 z-10 transition-opacity ${selectedEventIds.has(event.id) || 'hidden group-hover:block'}`}>
                      <button
                        onClick={() => handleToggleSelect(event.id)}
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-red-600 backdrop-blur-sm text-white transition-colors"
                      >
                        {selectedEventIds.has(event.id) ? (
                          <CheckSquare size={18} className="text-white" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    </div>

                    {/* Snapshot or Fallback */}
                    {event.snapshot_url ? (
                      <img
                        src={event.snapshot_url}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        alt={event.event_type}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-300">
                        <div className="text-6xl">{getEventTypeIcon(event.event_type)}</div>
                      </div>
                    )}

                    {/* Type Badge */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1.5 max-w-[70%]">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-md border border-white/10 ${getEventTypeColor(event.event_type).includes('bg-red') ? 'bg-red-600/90 text-white' : 'bg-white/90 text-slate-900'
                        }`}>
                        {getEventTypeIcon(event.event_type)} {event.event_type.replace(/_/g, ' ')}
                      </span>
                      {event.metadata?.person_name && (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-600/90 text-white shadow-sm backdrop-blur-md">
                          👤 {event.metadata.person_name}
                        </span>
                      )}
                      {event.metadata?.plate_text && (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-indigo-600/90 text-white shadow-sm backdrop-blur-md">
                          🪧 {event.metadata.plate_text}
                        </span>
                      )}
                    </div>

                    {/* Bottom Info Gradient */}
                    <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

                    <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end text-white text-xs font-medium">
                      <div className="flex items-center gap-1.5 text-white/90">
                        <Camera size={14} className="text-white/70" />
                        <span className="truncate max-w-[120px]">{getCameraName(event.camera_id)}</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10 ${(event.confidence || 0) > 80 ? 'bg-green-500/40 text-green-100' : 'bg-yellow-500/40 text-yellow-100'
                        }`}>
                        {Math.round(event.confidence || 0)}%
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                          {new Date(event.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-lg font-bold text-slate-800 dark:text-white tabular-nums">
                          {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {event.acknowledged ? (
                        <span className="flex items-center gap-1.5 text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full text-xs font-semibold border border-green-100 dark:border-green-900/50">
                          <CheckCircle size={12} className="stroke-[2.5]" />
                          Ack
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400 px-2.5 py-1 rounded-full text-xs font-semibold border border-orange-100 dark:border-orange-900/50 animate-pulse">
                          <AlertCircle size={12} className="stroke-[2.5]" />
                          New
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                      {!event.acknowledged ? (
                        <>
                          <button
                            onClick={() => acknowledgeEvent(event.id)}
                            className="flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium text-sm transition-all shadow-sm hover:shadow active:scale-95"
                          >
                            <CheckCircle size={16} />
                            Ack
                          </button>
                          <button
                            onClick={() => deleteEvent(event.id)}
                            className="flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 font-medium text-sm transition-all active:scale-95"
                          >
                            <Trash2 size={16} />
                            Del
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => deleteEvent(event.id)}
                          className="col-span-2 flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 font-medium text-sm transition-all active:scale-95 group/del"
                        >
                          <Trash2 size={16} className="group-hover/del:text-red-500" />
                          Delete Event
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Pagination Controls */}
        {filteredEvents.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredEvents.length)} of {filteredEvents.length} events
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
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

        <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-blue-600 flex-shrink-0" size={24} />
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">About Events</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Events are automatically detected by AI models running on your cameras. Each event includes confidence
                scores and metadata. Acknowledge events after reviewing them to keep your dashboard organized.
              </p>
            </div>
          </div>
        </div>

        {/* Clear All Events Confirmation Modal */}
        {showClearAllModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full border-2 border-red-500 overflow-hidden animate-in zoom-in-95 duration-300">
              {/* Header */}
              <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-white">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-full">
                    <AlertCircle size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Danger Zone</h2>
                    <p className="text-red-100 text-sm mt-1">This action is permanent and irreversible</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Warning Message */}
                <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={24} />
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">
                        You are about to delete ALL events
                      </h3>
                      <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                        This will permanently remove <strong className="font-black text-lg">{events.length}</strong> event{events.length !== 1 ? 's' : ''} from your database.
                      </p>
                      <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 ml-4">
                        <li>• All event history will be lost</li>
                        <li>• Snapshots and metadata will be removed</li>
                        <li>• This action CANNOT be undone</li>
                        <li>• No backup will be created</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Type to Confirm */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Type <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded font-mono text-red-600 dark:text-red-400">DELETE ALL</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type here..."
                    className="w-full px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-slate-700 dark:text-white font-mono text-lg"
                    autoFocus
                  />
                  {confirmText && confirmText !== 'DELETE ALL' && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <AlertCircle size={14} />
                      Text must match exactly (case-sensitive)
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={closeClearAllModal}
                    className="flex-1 px-6 py-3 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-semibold"
                  >
                    <X className="inline-block mr-2" size={18} />
                    Cancel (Keep Events)
                  </button>
                  <button
                    onClick={confirmClearAllEvents}
                    disabled={confirmText !== 'DELETE ALL'}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/30"
                  >
                    <Trash2 className="inline-block mr-2" size={18} />
                    Delete All {events.length} Events
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
