import { useEffect, useState, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { supabase, type Camera } from '../lib/supabase';

type EventNotification = {
    id: string;
    event_type: string;
    confidence: number;
    camera_id: string;
    snapshot_url?: string;
    created_at: string;
};

export default function EventNotifications() {
    const [notifications, setNotifications] = useState<EventNotification[]>([]);
    const lastEventIdRef = useRef<string>('');
    const [cameras, setCameras] = useState<Camera[]>([]);

    useEffect(() => {
        loadCameras();
        checkForNewEvents(); // Initial check

        // Check for new events every 3 seconds
        const eventsInterval = setInterval(checkForNewEvents, 3000);

        return () => clearInterval(eventsInterval);
    }, []);

    const loadCameras = async () => {
        const { data } = await supabase.from('cameras').select('*');
        if (data) setCameras(data);
    };

    const playBeep = () => {
        try {
            // Create audio context and play beep sound
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800; // Frequency in Hz
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.log('Could not play beep:', error);
        }
    };

    const checkForNewEvents = async () => {
        try {
            const { data: latestEvent } = await supabase
                .from('events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestEvent && latestEvent.id !== lastEventIdRef.current) {
                // New event detected!
                if (lastEventIdRef.current) { // Only notify if we've already loaded (not first load)
                    playBeep();
                    setNotifications(prev => {
                        const updated = [latestEvent, ...prev].slice(0, 5);
                        return updated;
                    });
                }
                lastEventIdRef.current = latestEvent.id;
            }
        } catch (error) {
            // No events yet or error - silent fail
        }
    };

    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const getEventTypeEmoji = (type: string) => {
        switch (type) {
            case 'person_detection': return '👤';
            case 'vehicle_detection': return '🚗';
            case 'intrusion_detection': return '⚠️';
            case 'weapon_detection': return '🔫';
            case 'fire_detection': return '🔥';
            case 'motion_detection': return '🏃';
            default: return '📷';
        }
    };

    const getCameraName = (cameraId: string) => {
        const camera = cameras.find(c => c.id === cameraId);
        return camera?.name || 'Unknown Camera';
    };

    return (
        <>
            {/* Event Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm pointer-events-none">
                {notifications.map((notification, index) => (
                    <div
                        key={notification.id}
                        className="pointer-events-auto bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 border-red-500 overflow-hidden animate-in slide-in-from-right duration-300"
                        style={{ animationDelay: `${index * 100}ms` }}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-red-600 to-red-700 p-3 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell size={18} className="animate-pulse" />
                                <span className="font-bold text-sm">New Detection!</span>
                            </div>
                            <button
                                onClick={() => dismissNotification(notification.id)}
                                className="hover:bg-white/20 rounded-full p-1 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="text-4xl">{getEventTypeEmoji(notification.event_type)}</div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-lg">
                                        {notification.event_type.replace('_', ' ').toUpperCase()}
                                    </h4>
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 space-y-1">
                                        <p>Confidence: <span className="font-semibold text-red-600">{notification.confidence}%</span></p>
                                        <p className="flex items-center gap-1">
                                            <span className="text-slate-500">📹</span>
                                            <span className="font-semibold text-slate-900 dark:text-white">{getCameraName(notification.camera_id)}</span>
                                        </p>
                                        <p className="text-slate-500">{new Date(notification.created_at).toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            </div>

                            {notification.snapshot_url && (
                                <img
                                    src={notification.snapshot_url}
                                    alt="Event snapshot"
                                    className="w-full h-24 object-cover rounded-lg mt-3 border border-slate-200 dark:border-slate-700"
                                />
                            )}
                        </div>

                        {/* Progress bar for auto-dismiss */}
                        <div className="relative h-1 bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                                className="absolute inset-0 bg-red-600 animate-shrink-width"
                                style={{ animation: 'shrinkWidth 8s linear forwards' }}
                                onAnimationEnd={() => dismissNotification(notification.id)}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
        </>
    );
}
