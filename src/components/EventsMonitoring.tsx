import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertTriangle, Camera, Brain, Filter } from 'lucide-react';
import { supabase, type Event, type Camera as CameraType } from '../lib/supabase';

export default function EventsMonitoring() {
  const [events, setEvents] = useState<Event[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'acknowledged'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadEvents();
    loadCameras();
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const loadEvents = async () => {
    let query = supabase.from('events').select('*').order('created_at', { ascending: false }).limit(100);

    if (filter === 'acknowledged') {
      query = query.eq('acknowledged', true);
    } else if (filter === 'unacknowledged') {
      query = query.eq('acknowledged', false);
    }

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

  const filteredEvents =
    eventTypeFilter === 'all' ? events : events.filter((e) => e.event_type === eventTypeFilter);

  const uniqueEventTypes = Array.from(new Set(events.map((e) => e.event_type)));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Events Monitoring</h1>
          <p className="text-slate-600 mt-1">AI-detected events from all cameras</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
          <Bell size={20} />
          <span className="text-sm font-medium">
            {events.filter((e) => !e.acknowledged).length} unacknowledged
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'all' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 border border-slate-200'
            }`}
          >
            All Events
          </button>
          <button
            onClick={() => setFilter('unacknowledged')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'unacknowledged' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 border border-slate-200'
            }`}
          >
            Unacknowledged
          </button>
          <button
            onClick={() => setFilter('acknowledged')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'acknowledged' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 border border-slate-200'
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
            className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
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
        <div className="space-y-4">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border p-6 transition-all ${
                event.acknowledged ? 'border-slate-200' : 'border-orange-200 bg-orange-50'
              }`}
            >
              <div className="flex items-start justify-between">
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

                {!event.acknowledged && (
                  <button
                    onClick={() => acknowledgeEvent(event.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle size={18} />
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
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
    </div>
  );
}
