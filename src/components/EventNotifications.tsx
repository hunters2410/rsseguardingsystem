import { useEffect, useState, useRef } from 'react';
import { Bell, X, Car, User, Shield, AlertTriangle, CheckCircle, MapPin, Clock } from 'lucide-react';
import { supabase, type Camera, type KnownPlate } from '../lib/supabase';

type EventNotification = {
    id: string;
    event_type: string;
    confidence: number;
    camera_id: string;
    snapshot_url?: string;
    created_at: string;
    metadata?: {
        plate_text?: string;
        owner_name?: string;
        vehicle_desc?: string;
        tag?: string;
        highlight_color?: string;
        alert_on_detect?: boolean;
        [key: string]: any;
    };
};

const CATEGORY_THEMES: Record<string, {
    headerBg: string;
    borderColor: string;
    badgeBg: string;
    badgeText: string;
    icon: string;
    label: string;
    accentColor: string;
}> = {
    vip: {
        headerBg: 'bg-gradient-to-r from-emerald-600 to-teal-700',
        borderColor: 'border-emerald-500 ring-emerald-500/20',
        badgeBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
        badgeText: 'text-emerald-300',
        icon: '👑',
        label: 'VIP / Executive',
        accentColor: '#10B981',
    },
    staff: {
        headerBg: 'bg-gradient-to-r from-blue-600 to-indigo-700',
        borderColor: 'border-blue-500 ring-blue-500/20',
        badgeBg: 'bg-blue-500/15 border-blue-500/40 text-blue-300',
        badgeText: 'text-blue-300',
        icon: '💼',
        label: 'Staff',
        accentColor: '#3B82F6',
    },
    resident: {
        headerBg: 'bg-gradient-to-r from-purple-600 to-violet-700',
        borderColor: 'border-purple-500 ring-purple-500/20',
        badgeBg: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
        badgeText: 'text-purple-300',
        icon: '🏠',
        label: 'Resident',
        accentColor: '#8B5CF6',
    },
    visitor: {
        headerBg: 'bg-gradient-to-r from-amber-600 to-orange-700',
        borderColor: 'border-amber-500 ring-amber-500/20',
        badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
        badgeText: 'text-amber-300',
        icon: '🚗',
        label: 'Visitor',
        accentColor: '#F59E0B',
    },
    watchlist: {
        headerBg: 'bg-gradient-to-r from-red-600 to-rose-700',
        borderColor: 'border-red-500 ring-red-500/30',
        badgeBg: 'bg-red-500/20 border-red-500/50 text-red-300',
        badgeText: 'text-red-300',
        icon: '⚠️',
        label: 'Watchlist Alert',
        accentColor: '#EF4444',
    },
    blocked: {
        headerBg: 'bg-gradient-to-r from-rose-800 to-red-950',
        borderColor: 'border-rose-700 ring-rose-700/30',
        badgeBg: 'bg-rose-500/20 border-rose-500/50 text-rose-300',
        badgeText: 'text-rose-300',
        icon: '⛔',
        label: 'Blocked / Banned',
        accentColor: '#991B1B',
    },
    unknown: {
        headerBg: 'bg-gradient-to-r from-slate-700 to-slate-800',
        borderColor: 'border-slate-500 ring-slate-500/20',
        badgeBg: 'bg-slate-500/20 border-slate-400/40 text-slate-300',
        badgeText: 'text-slate-300',
        icon: '❓',
        label: 'Unknown',
        accentColor: '#64748B',
    },
};

export default function EventNotifications() {
    const [notifications, setNotifications] = useState<EventNotification[]>([]);
    const lastEventIdRef = useRef<string>('');
    const [cameras, setCameras] = useState<Camera[]>([]);
    const camerasRef = useRef<Camera[]>([]);
    const knownPlatesRef = useRef<Map<string, KnownPlate>>(new Map());

    useEffect(() => {
        camerasRef.current = cameras;
    }, [cameras]);

    const loadKnownPlates = async () => {
        try {
            const { data } = await supabase.from('known_plates').select('*');
            if (data) {
                const map = new Map<string, KnownPlate>();
                data.forEach(kp => map.set(kp.plate_text, kp));
                knownPlatesRef.current = map;
            }
        } catch (e) {
            console.error('Error loading known plates cache:', e);
        }
    };

    useEffect(() => {
        loadCameras();
        loadKnownPlates();
        checkForNewEvents();

        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }

        const eventsInterval = setInterval(checkForNewEvents, 3000);
        return () => clearInterval(eventsInterval);
    }, []);

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

            new Notification(title, {
                body: body,
                icon: '/favicon.png',
                tag: event.id
            });
        }
    };

    const playSiren = () => {
        try {
            const audio = new Audio('/siren.mp3');
            audio.volume = 0.25;
            audio.play().catch(() => {});
        } catch (error) {
            console.log('Could not play siren:', error);
        }
    };

    const speakAlert = (event: EventNotification) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();

        const objectName = event.event_type.replace('_crossing', '').replace('_', ' ');
        let text = "";

        if (event.event_type.startsWith('license plate')) {
            const plate = event.metadata?.plate_text || event.event_type.replace('license plate:', '').trim();
            const known = knownPlatesRef.current.get(plate);
            const owner = event.metadata?.owner_name || known?.owner_name;
            const tag = (event.metadata?.tag || known?.tag || 'unknown').toLowerCase();
            
            if (owner) {
                text = `${tag === 'vip' ? 'VIP Arrival: ' : ''}Vehicle ${plate}, registered to ${owner}, has arrived at ${getCameraName(event.camera_id)}`;
            } else {
                text = `Vehicle ${plate} detected at ${getCameraName(event.camera_id)}`;
            }
        } else if (event.event_type.includes('_crossing')) {
            text = `Warning! Unauthorized Zone crossing detected. ${objectName} in ${getCameraName(event.camera_id)}`;
        } else {
            text = `Alert! ${objectName} detected in ${getCameraName(event.camera_id)}`;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            (voice.name.includes('Google') && voice.lang.includes('en-US')) ||
            (voice.name.includes('Microsoft Zira') || voice.name.includes('Microsoft David')) ||
            (voice.lang === 'en-US')
        );

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        window.speechSynthesis.speak(utterance);
    };

    const checkForNewEvents = async () => {
        try {
            const { data: latestEvent } = await supabase
                .from('events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestEvent && latestEvent.id !== lastEventIdRef.current) {
                if (lastEventIdRef.current) {
                    const isPlate = latestEvent.event_type?.startsWith('license plate');
                    const plateText = latestEvent.metadata?.plate_text || latestEvent.event_type.replace('license plate:', '').trim();
                    const known = knownPlatesRef.current.get(plateText);
                    
                    const alertEnabled = latestEvent.metadata?.alert_on_detect ?? known?.alert_on_detect ?? false;
                    const tag = (latestEvent.metadata?.tag || known?.tag || 'unknown').toLowerCase();
                    const isUrgent = tag === 'watchlist' || tag === 'blocked' || tag === 'vip';

                    // Siren & Alert Override: If plate alert is disabled and not urgent, stay silent
                    const shouldAlert = !isPlate || alertEnabled === true || isUrgent;

                    if (shouldAlert) {
                        playSiren();
                        speakAlert(latestEvent);
                        sendSystemNotification(latestEvent);
                    }

                    // Always show the notification card
                    setNotifications(prev => {
                        const updated = [latestEvent, ...prev].slice(0, 4);
                        return updated;
                    });
                }
                lastEventIdRef.current = latestEvent.id;
            }
        } catch {
            // Silent fail
        }
    };

    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const getCameraName = (cameraId: string) => {
        const camera = camerasRef.current.find(c => c.id === cameraId);
        return camera?.name || 'Car Park';
    };

    const getTheme = (event: EventNotification) => {
        if (event.event_type.startsWith('license plate')) {
            const plate = event.metadata?.plate_text || event.event_type.replace('license plate:', '').trim();
            const known = knownPlatesRef.current.get(plate);
            const tag = (event.metadata?.tag || known?.tag || 'unknown').toLowerCase();
            return CATEGORY_THEMES[tag] || CATEGORY_THEMES.unknown;
        }

        // Standard security detection theme
        if (event.event_type.includes('_crossing') || event.event_type.includes('weapon')) {
            return {
                headerBg: 'bg-gradient-to-r from-red-600 to-red-700',
                borderColor: 'border-red-500 ring-red-500/30',
                badgeBg: 'bg-red-500/20 border-red-500/50 text-red-300',
                badgeText: 'text-red-300',
                icon: '⚠️',
                label: 'Security Alert',
                accentColor: '#EF4444',
            };
        }

        return {
            headerBg: 'bg-gradient-to-r from-indigo-600 to-blue-700',
            borderColor: 'border-indigo-500 ring-indigo-500/20',
            badgeBg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300',
            badgeText: 'text-indigo-300',
            icon: '🔔',
            label: 'AI Detection',
            accentColor: '#4F46E5',
        };
    };

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2.5 max-w-xs sm:max-w-sm w-full pointer-events-none">
            {notifications.map((notification, index) => {
                const isPlate = notification.event_type.startsWith('license plate');
                const plateText = notification.metadata?.plate_text || (isPlate ? notification.event_type.replace(/license plate:\s*/i, '').split(' ')[0] : '');
                const known = knownPlatesRef.current.get(plateText);
                const ownerName = notification.metadata?.owner_name || known?.owner_name || '';
                const vehicleDesc = notification.metadata?.vehicle_desc || known?.vehicle_desc || '';
                const theme = getTheme(notification);

                return (
                    <div
                        key={notification.id}
                        className={`pointer-events-auto bg-slate-900/95 text-slate-100 rounded-xl shadow-2xl border ${theme.borderColor} ring-2 backdrop-blur-md overflow-hidden animate-in slide-in-from-right duration-200`}
                        style={{ animationDelay: `${index * 80}ms` }}
                    >
                        {/* Header with Category Gradient & Colors */}
                        <div className={`${theme.headerBg} px-3 py-2 text-white flex items-center justify-between shadow-sm`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm">{theme.icon}</span>
                                <span className="font-bold text-xs truncate">
                                    {isPlate ? `Plate: ${plateText}` : 'Detection Alert'}
                                </span>
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border ${theme.badgeBg}`}>
                                    {theme.label.split('/')[0]}
                                </span>
                            </div>
                            <button
                                onClick={() => dismissNotification(notification.id)}
                                className="hover:bg-white/20 rounded-md p-1 transition text-white/80 hover:text-white ml-2 flex-shrink-0"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Content Area with Reduced Text Size */}
                        <div className="p-3 text-xs space-y-2">
                            {/* License Plate Specific Details */}
                            {isPlate ? (
                                <div className="space-y-1.5">
                                    {/* Plate Display + Owner Status */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <span 
                                                className="px-2 py-0.5 bg-amber-400 text-slate-950 font-mono font-bold rounded text-xs tracking-wider border border-amber-500"
                                                style={{ borderLeftWidth: '3px', borderLeftColor: theme.accentColor }}
                                            >
                                                {plateText}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-medium">
                                            {notification.confidence ? `${notification.confidence.toFixed(0)}% match` : ''}
                                        </span>
                                    </div>

                                    {/* Categorized Owner & Vehicle Details */}
                                    {ownerName ? (
                                        <div className="bg-slate-800/80 rounded-lg p-2 border border-slate-700/60 space-y-0.5">
                                            <div className="flex items-center gap-1 text-slate-200 font-semibold text-xs">
                                                <User size={13} className="text-slate-400 flex-shrink-0" />
                                                <span className="truncate">{ownerName}</span>
                                            </div>
                                            {vehicleDesc && (
                                                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                    <Car size={12} className="text-slate-500 flex-shrink-0" />
                                                    <span className="truncate">{vehicleDesc}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-slate-400 italic bg-slate-800/40 px-2 py-1 rounded border border-slate-800">
                                            Category: <strong className="text-slate-300 not-italic">Unknown (Unassigned)</strong>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Non-Plate Event Details */
                                <div>
                                    <h4 className="font-bold text-slate-100 text-xs flex items-center gap-1">
                                        <span>{notification.event_type.replace('_crossing', '').replace('_', ' ').toUpperCase()}</span>
                                        {notification.event_type.includes('_crossing') && (
                                            <span className="bg-red-600 text-white text-[9px] font-extrabold px-1 py-0.5 rounded">
                                                ZONE CROSSED
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        Confidence: <span className="font-semibold text-amber-400">{notification.confidence}%</span>
                                    </p>
                                </div>
                            )}

                            {/* Camera Location & Timestamp */}
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                                <span className="flex items-center gap-1 text-slate-300 font-medium truncate">
                                    <MapPin size={11} className="text-indigo-400 flex-shrink-0" />
                                    {getCameraName(notification.camera_id)}
                                </span>
                                <span className="flex items-center gap-1 text-slate-500 flex-shrink-0">
                                    <Clock size={11} />
                                    {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            </div>

                            {/* Snapshot Thumbnail Crop */}
                            {notification.snapshot_url && (
                                <div className="rounded-lg overflow-hidden border border-slate-700/80 bg-black mt-1.5 max-h-20 flex items-center justify-center">
                                    <img
                                        src={notification.snapshot_url}
                                        alt="Detection Snapshot"
                                        className="w-full h-20 object-cover"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Animated Auto-Dismiss Progress Bar */}
                        <div className="relative h-0.5 bg-slate-800 overflow-hidden">
                            <div
                                className="absolute inset-0 animate-shrink-width"
                                style={{ 
                                    backgroundColor: theme.accentColor,
                                    animation: 'shrinkWidth 8s linear forwards' 
                                }}
                                onAnimationEnd={() => dismissNotification(notification.id)}
                            />
                        </div>
                    </div>
                );
            })}

            <style>{`
                @keyframes shrinkWidth {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}</style>
        </div>
    );
}
