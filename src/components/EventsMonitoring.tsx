import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertTriangle, Camera, Brain, Filter, LayoutList, LayoutGrid, Trash2, ExternalLink, CheckSquare, Square, ChevronLeft, ChevronRight, Search, Calendar, X, AlertCircle } from 'lucide-react';
import { supabase, type Event, type Camera as CameraType } from '../lib/supabase';
import EventNotifications from './EventNotifications';

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

  // Original handleClearAllEvents_OLD - removing
  const handleClearAllEvents_OLD = async () => {
    const totalEvents = events.length;

    // First confirmation
    if (!confirm(`⚠️ WARNING: This will permanently delete ALL ${totalEvents} events from the database!\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?`)) {
      return;
    }

    // Second confirmation
    const confirmText = prompt(
      `Type "DELETE ALL" (in capitals) to confirm deletion of all ${totalEvents} events:`
    );

    if (confirmText !== "DELETE ALL") {
      alert('Deletion cancelled. Events are safe.');
      return;
    }

    try {
      // Delete all events
      const { error } = await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;

      alert(`Successfully deleted all ${totalEvents} events from database.`);
      setEvents([]);
      setSelectedEventIds(new Set());
      loadEvents();
    } catch (error) {
      console.error('Error deleting events:', error);
      alert('Failed to delete events. Please try again.');
    }
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
    switch (eventType) {
      case 'person_detected':
        return '👤';
      case 'vehicle_detected':
        return '🚗';
      case 'motion':
        return '🔄';
      case 'intrusion':
        return '⚠️';
      default:
        return '📍';
    }
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'person_detected':
        return 'bg-blue-100 text-blue-700';
      case 'vehicle_detected':
        return 'bg-green-100 text-green-700';
      case 'motion':
        return 'bg-yellow-100 text-yellow-700';
      case 'intrusion':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700';
    }
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
            {selectedEventIds.size > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkAcknowledge}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <CheckCircle size={16} />
                  Acknowledge ({selectedEventIds.size})
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  <Trash2 size={16} />
                  Delete ({selectedEventIds.size})
                </button>
              </div>
            )}
            <button
              onClick={handleClearAllEvents}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium border-2 border-red-700"
              title="Permanently delete ALL events from database"
            >
              <AlertCircle size={16} />
              Clear All Events
            </button>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
              <Bell size={20} />
              <span className="text-sm font-medium">
                {events.filter((e) => !e.acknowledged).length} unacknowledged
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-slate-900 dark:text-white"
                />
              </div>
              <button
                onClick={loadEvents}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium whitespace-nowrap"
              >
                <Search size={16} />
                Search
              </button>
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm font-medium whitespace-nowrap border border-slate-200 dark:border-slate-600"
                title="Clear all filters"
              >
                <X size={16} />
                Clear All
              </button>
            </div>

            {/* Date Range Filters */}
            <div className="flex gap-2">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900 dark:text-white"
                  placeholder="Start Date"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900 dark:text-white"
                  placeholder="End Date"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${filter === 'all' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              All Events
            </button>
            <button
              onClick={() => setFilter('unacknowledged')}
              className={`px-4 py-2 rounded-lg transition-colors ${filter === 'unacknowledged' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              Unacknowledged
            </button>
            <button
              onClick={() => setFilter('acknowledged')}
              className={`px-4 py-2 rounded-lg transition-colors ${filter === 'acknowledged' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              Acknowledged
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={20} className="text-slate-400" />
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
            >
              <option value="all">All Types</option>
              {uniqueEventTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ')}
                </option>
              ))}
            </select>
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
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-4 w-12">
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
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Type</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Camera</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Confidence</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Time</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Snapshot</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Status</th>
                      <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {paginatedEvents.map((event) => (
                      <tr key={event.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedEventIds.has(event.id) ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                        <td className="p-4">
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
                        <td className="p-4 font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <div className="text-xl">{getEventTypeIcon(event.event_type)}</div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getEventTypeColor(event.event_type)}`}>
                              {event.event_type.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-400">{getCameraName(event.camera_id)}</td>
                        <td className="p-4 text-slate-600 dark:text-slate-400">{event.confidence}%</td>
                        <td className="p-4 text-slate-600 dark:text-slate-400">
                          {new Date(event.created_at).toLocaleString()}
                        </td>
                        <td className="p-4">
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
                        <td className="p-4">
                          {event.acknowledged ? (
                            <span className="flex items-center gap-1 text-sm text-green-600">
                              <CheckCircle size={16} />
                              Ack
                            </span>
                          ) : (
                            <span className="text-sm text-orange-600">New</span>
                          )}
                        </td>
                        <td className="p-4">
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
                  className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border p-6 transition-all relative ${event.acknowledged ? 'border-slate-200' : 'border-orange-200 bg-orange-50'
                    } ${selectedEventIds.has(event.id) ? 'ring-2 ring-red-500' : ''}`}
                >
                  <div className="absolute top-4 right-4 z-10">
                    <button
                      onClick={() => handleToggleSelect(event.id)}
                      className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                    >
                      {selectedEventIds.has(event.id) ? (
                        <CheckSquare size={20} className="text-red-600 dark:text-red-500" />
                      ) : (
                        <Square size={20} />
                      )}
                    </button>
                  </div>
                  <div className="flex items-start justify-between pr-10">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="text-4xl">{getEventTypeIcon(event.event_type)}</div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getEventTypeColor(event.event_type)}`}>
                            {event.event_type.replace('_', ' ')}
                          </span>
                          {event.confidence && (
                            <span className="text-sm text-slate-600 dark:text-slate-400">Confidence: {event.confidence}%</span>
                          )}
                          {event.acknowledged && (
                            <span className="flex items-center gap-1 text-sm text-green-600">
                              <CheckCircle size={16} />
                              Acknowledged
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-slate-600 mb-3">
                          <div className="flex items-center gap-2">
                            <Camera size={16} />
                            <span>{getCameraName(event.camera_id)}</span>
                          </div>
                          {event.ai_model_id && (
                            <div className="flex items-center gap-2">
                              <Brain size={16} />
                              <span>AI Model</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span>{new Date(event.created_at).toLocaleString()}</span>
                          </div>
                        </div>

                        {event.snapshot_url && (
                          <div className="mb-3">
                            <a
                              href={event.snapshot_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                            >
                              <ExternalLink size={16} />
                              View Snapshot
                            </a>
                          </div>
                        )}

                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-sm">
                            <p className="font-medium text-slate-700 mb-1">Event Details:</p>
                            <pre className="text-slate-600 whitespace-pre-wrap">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!event.acknowledged && (
                        <button
                          onClick={() => acknowledgeEvent(event.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle size={18} />
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => deleteEvent(event.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <Trash2 size={18} />
                        Delete
                      </button>
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
