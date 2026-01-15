import { useEffect, useState, useRef } from 'react';
import { X, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase, type Event } from '../lib/supabase';

// Simple alarm sound buffer (Base64) to avoid external dependency issues or CORS
// This is a short "beep-beep" alarm sound
const ALARM_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export default function EventNotification() {
    const [event, setEvent] = useState<Event | null>(null);
    const [visible, setVisible] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize Audio
        audioRef.current = new Audio(ALARM_SOUND);
        audioRef.current.volume = 1.0;

        // Subscribe to new events
        const channel = supabase
            .channel('public:events')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'events' },
                (payload) => {
                    console.log('New Event Received:', payload.new);
                    handleNewEvent(payload.new as Event);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleNewEvent = async (newEvent: Event) => {
        // 1. Fetch related camera name for better context
        const { data: cam } = await supabase
            .from('cameras')
            .select('name')
            .eq('id', newEvent.camera_id)
            .single();

        const enrichedEvent = {
            ...newEvent,
            camera_name: cam?.name || 'Unknown Camera'
        };

        setEvent(enrichedEvent as any);
        setVisible(true);

        // 2. Play Sound
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.error("Audio play failed (interaction required first?):", e));
        }

        // 3. Auto-hide after 10 seconds? Or keep until acknowledged?
        // User requested "pop up that sounds and alarms". Usually alarms shouldn't likely auto-dismiss too quickly if critical.
        // But for UI usability, let's auto-dismiss in 8s but allowing manual close.
        setTimeout(() => {
            setVisible(false);
        }, 10000);
    };

    if (!visible || !event) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in-right">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl border-l-4 border-red-600 p-4 max-w-sm w-full relative overflow-hidden">
                {/* Background Pulse Effect */}
                <div className="absolute inset-0 bg-red-600 opacity-5 animate-pulse pointer-events-none"></div>

                <button
                    onClick={() => setVisible(false)}
                    className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                    <X size={18} />
                </button>

                <div className="flex gap-4">
                    <div className="flex-shrink-0">
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full animate-bounce">
                            <AlertTriangle size={24} />
                        </div>
                    </div>

                    <div className="flex-1">
                        <h4 className="font-bold text-red-600 text-lg flex items-center gap-2">
                            Security Alert!
                        </h4>
                        <p className="text-slate-900 dark:text-white font-medium mt-1">
                            {event.event_type} Detected
                        </p>
                        <p className="text-slate-500 text-sm">
                            {(event as any).camera_name} • Just now
                        </p>

                        {event.snapshot_url && (
                            <div className="mt-3 rounded overflow-hidden border border-slate-200 dark:border-slate-700 relative group cursor-pointer">
                                <img
                                    src={event.snapshot_url}
                                    alt="Event Snapshot"
                                    className="w-full h-32 object-cover"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <ExternalLink className="text-white" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
