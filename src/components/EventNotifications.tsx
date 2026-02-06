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
    const camerasRef = useRef<Camera[]>([]);

    useEffect(() => {
        camerasRef.current = cameras;
    }, [cameras]);

    useEffect(() => {
        loadCameras();
        checkForNewEvents(); // Initial check

        // Request Notification Permission on mount
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }

        // Check for new events every 3 seconds
        const eventsInterval = setInterval(checkForNewEvents, 3000);

        return () => clearInterval(eventsInterval);
    }, []);

    // Load voices immediately to ensure they are ready when needed
    useEffect(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
        }
    }, []);

    const loadCameras = async () => {
        const { data } = await supabase.from('cameras').select('*');
        if (data) setCameras(data);
    };

    const sendSystemNotification = (event: EventNotification) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            const title = `SECURITY ALERT: ${event.event_type.replace('_', ' ').toUpperCase()}`;
            const body = `${getCameraName(event.camera_id)} detected activity.`;

            // Try to play sound via Notification API if possible (OS dependent)
            // or rely on our playSiren() which runs parallel.
            new Notification(title, {
                body: body,
                icon: '/favicon.png', // Ensure this exists
                tag: event.id // Prevent duplicates
            });
        }
    };

    const playSiren = () => {
        try {
            const audio = new Audio('/siren.mp3');
            audio.volume = 0.2; // Significantly lower siren so voice is dominant/special
            audio.play().catch(e => console.log('Audio autoplay blocked:', e));
        } catch (error) {
            console.log('Could not play siren:', error);
        }
    };

    const speakAlert = (event: EventNotification) => {
        if (!('speechSynthesis' in window)) return;

        // Cancel any current speech to prevent overlapping
        window.speechSynthesis.cancel();

        const objectName = event.event_type.replace('_crossing', '').replace('_', ' ');
        let text = "";

        if (event.event_type.includes('_crossing')) {
            text = `Warning! Unauthorized Zone crossing detected. ${objectName} in ${getCameraName(event.camera_id)}`;
        } else {
            text = `Alert! ${objectName} detected in ${getCameraName(event.camera_id)}`;
        }

        const utterance = new SpeechSynthesisUtterance(text);

        // --- VOICE SELECTION LOGIC ---
        // Try to find a "premium" or clear English voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            (voice.name.includes('Google') && voice.lang.includes('en-US')) || // Chrome efficient voice
            (voice.name.includes('Microsoft Zira') || voice.name.includes('Microsoft David')) || // Windows native
            (voice.lang === 'en-US') // Fallback common English
        );

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.rate = 1.0;  // Normal speed
        utterance.pitch = 1.0; // Normal pitch
        utterance.volume = 1.0; // Max volume

        // IMPORTANT: Browser requires user interaction for audio.
        // If this is called purely from background without prior interaction, it might fail.
        // However, since we are likely already playing a siren (which also requires interaction),
        // we assume the user has clicked at least once.

        window.speechSynthesis.speak(utterance);

        // Backup log
        console.log(`TTS Attempting to speak: "${text}" using voice: ${preferredVoice?.name || 'default'}`);
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
                    playSiren();
                    speakAlert(latestEvent);
                    sendSystemNotification(latestEvent); // Trigger system popup
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
        // Use ref to avoid stale closure in intervals
        const camera = camerasRef.current.find(c => c.id === cameraId);
        return camera?.name || 'Unknown Camera';
    };

    return (
        <>
            {/* Event Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm pointer-events-none">
                {notifications.map((notification, index) => (
                    <div
                        key={notification.id}
                        className={`pointer-events-auto bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 overflow-hidden animate-in slide-in-from-right duration-300 ${notification.event_type.includes('_crossing')
                                ? 'border-red-700 ring-4 ring-red-600/30'
                                : 'border-red-500'
                            }`}
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
                                    <h4 className="font-bold text-slate-900 dark:text-white text-lg flex flex-wrap items-center gap-2">
                                        {notification.event_type.replace('_crossing', '').replace('_', ' ').toUpperCase()}
                                        {notification.event_type.includes('_crossing') && (
                                            <span className="bg-red-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded animate-pulse border border-white/20 shadow-sm">
                                                ZONE CROSSED
                                            </span>
                                        )}
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
