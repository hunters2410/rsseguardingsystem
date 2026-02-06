import { useEffect, useRef } from 'react';
import { supabase, type Event } from '../lib/supabase';
import { toast } from 'sonner';

// Simple alarm sound buffer
// Siren sound for alerts
// Siren sound for alerts
const ALARM_SOUND = '/siren.mp3';

export default function EventNotification() {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        audioRef.current = new Audio(ALARM_SOUND);
        audioRef.current.volume = 1.0;

        const channel = supabase
            .channel('global-notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'events' },
                async (payload) => {
                    const newEvent = payload.new as Event;

                    // Fetch camera name
                    const { data: cam } = await supabase
                        .from('cameras')
                        .select('name')
                        .eq('id', newEvent.camera_id)
                        .single();

                    const camName = cam?.name || 'Unknown Camera';

                    // Play Sound
                    if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
                    }

                    // Show Toast
                    toast.error(`${newEvent.event_type} Detected!`, {
                        description: `Camera: ${camName}`,
                        duration: 20000,
                        action: newEvent.snapshot_url ? {
                            label: 'View',
                            onClick: () => window.open(newEvent.snapshot_url, '_blank')
                        } : undefined,
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return null; // This component handles side effects only
}
