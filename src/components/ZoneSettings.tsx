import { useEffect, useState, useRef } from 'react';
import { supabase, type Camera } from '../lib/supabase';
import { MousePointer2, Save, Trash2, Video, ScanLine, Info, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Point = [number, number]; // [x, y] normalized 0-1
type Zone = {
    id?: string;
    camera_id?: string;
    type: 'line' | 'zone';
    points: Point[];
    label: string;
    alert_enabled?: boolean;
};

export default function ZoneSettings() {
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>('');
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [zones, setZones] = useState<Zone[]>([]);
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawType, setDrawType] = useState<'line' | 'zone'>('line');
    const [loading, setLoading] = useState(false);
    const [manualUrl, setManualUrl] = useState('');
    const [showManualInput, setShowManualInput] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        loadCameras();
    }, []);

    useEffect(() => {
        if (selectedCameraId) {
            loadLatestSnapshot(selectedCameraId);
            loadZones(selectedCameraId);
            setZones([]);
            setCurrentPoints([]);
            setIsDrawing(false);
            setManualUrl('');
            setShowManualInput(false);
        }
    }, [selectedCameraId]);

    useEffect(() => {
        drawCanvas();
    }, [zones, currentPoints, snapshotUrl]);

    const loadCameras = async () => {
        const { data } = await supabase.from('cameras').select('*').order('name');
        if (data) {
            setCameras(data);
            if (data.length > 0 && !selectedCameraId) setSelectedCameraId(data[0].id);
        }
    };

    const loadZones = async (cameraId: string) => {
        setLoading(true);
        const { data } = await supabase.from('camera_zones').select('*').eq('camera_id', cameraId);
        if (data) {
            const loadedZones = data.map(z => ({
                ...z,
                points: z.points as Point[]
            }));
            setZones(loadedZones);
        }
        setLoading(false);
    };

    const loadLatestSnapshot = async (cameraId: string) => {
        setSnapshotUrl(null);
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('events')
                .select('snapshot_url')
                .eq('camera_id', cameraId)
                .not('snapshot_url', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                console.log('No snapshot found for this camera yet — user can paste a manual URL');
                // Don't toast an error — the empty state UI explains what to do
            } else if (data) {
                setSnapshotUrl(data.snapshot_url);
                toast.success('Snapshot loaded successfully');
            }
        } catch (err) {
            console.error('Error loading snapshot:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        // Calculate scale factors
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX / canvasRef.current.width;
        const y = (e.clientY - rect.top) * scaleY / canvasRef.current.height;

        const newPoints = [...currentPoints, [x, y] as Point];
        setCurrentPoints(newPoints);

        // If we have 2 points for a line, calculate finish
        if (drawType === 'line' && newPoints.length === 2) {
            // Finish line
            const newZone: Zone = {
                type: 'line',
                points: newPoints,
                label: `Boundary ${zones.length + 1}`,
                alert_enabled: true
            };
            setZones([...zones, newZone]);
            setCurrentPoints([]);
            setIsDrawing(false);
            toast.success("Boundary line added");
        }
    };

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw existing zones
        zones.forEach((zone, index) => {
            if (zone.points.length < 2) return;

            const start = zone.points[0];
            const end = zone.points[1];

            // Scale to canvas
            const x1 = start[0] * canvas.width;
            const y1 = start[1] * canvas.height;
            const x2 = end[0] * canvas.width;
            const y2 = end[1] * canvas.height;

            // Draw Line
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#ef4444'; // Red-500
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Draw Endpoints
            ctx.fillStyle = '#fff';
            [zone.points[0], zone.points[1]].forEach(p => {
                ctx.beginPath();
                ctx.arc(p[0] * canvas.width, p[1] * canvas.height, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });

            // Draw Label background
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            ctx.font = 'bold 14px sans-serif';
            const text = zone.label || `Boundary ${index + 1}`;
            const metrics = ctx.measureText(text);
            const pad = 8;

            ctx.fillStyle = 'rgba(220, 38, 38, 0.8)'; // Red background
            ctx.fillRect(midX - metrics.width / 2 - pad, midY - 24, metrics.width + pad * 2, 28);

            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(text, midX, midY - 6);
        });

        // Draw current drawing
        if (currentPoints.length > 0) {
            currentPoints.forEach((p, i) => {
                const x = p[0] * canvas.width;
                const y = p[1] * canvas.height;
                ctx.fillStyle = '#3b82f6'; // Blue
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fill();

                if (i > 0) {
                    const prev = currentPoints[i - 1];
                    ctx.beginPath();
                    ctx.moveTo(prev[0] * canvas.width, prev[1] * canvas.height);
                    ctx.lineTo(x, y);
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 3;
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            });

            // Draw hints
            if (currentPoints.length === 1) {
                const p = currentPoints[0];
                const x = p[0] * canvas.width;
                const y = p[1] * canvas.height;
                ctx.fillStyle = '#fff';
                ctx.font = '12px sans-serif';
                ctx.fillText("Click end point", x, y - 15);
            }
        }
    };

    const saveZones = async () => {
        if (!selectedCameraId) {
            toast.error('No camera selected');
            return;
        }

        if (zones.length === 0) {
            // Explicitly handle "Delete All" / "Clear" case
            if (!confirm("Are you sure you want to delete all boundaries for this camera?")) return;

            setLoading(true);
            try {
                const { error } = await supabase
                    .from('camera_zones')
                    .delete()
                    .eq('camera_id', selectedCameraId);

                if (error) throw error;

                // Notify AI server
                await supabase.from('system_commands').insert({
                    command_type: 'update_zones',
                    status: 'pending',
                    payload: { camera_id: selectedCameraId }
                });

                toast.success("Boundary deleted permanently.");
            } catch (err) {
                console.error("Delete error:", err);
                toast.error("Failed to delete boundary.");
            } finally {
                setLoading(false);
            }
            return;
        }

        setLoading(true);
        try {
            // Standard Update Flow: Delete existing -> Insert new
            // Delete existing zones for this camera
            const { error: deleteError } = await supabase
                .from('camera_zones')
                .delete()
                .eq('camera_id', selectedCameraId);

            if (deleteError) throw deleteError;

            // Insert new zones
            const zonesToInsert = zones.map(z => ({
                camera_id: selectedCameraId,
                type: z.type,
                points: z.points,
                label: z.label,
                alert_enabled: true // Always enable alerts for new zones
            }));

            const { error: insertError } = await supabase
                .from('camera_zones')
                .insert(zonesToInsert);

            if (insertError) throw insertError;

            // Notify AI server to reload zones (legacy ack) + force immediate config refresh
            await supabase.from('system_commands').insert({
                command_type: 'update_zones',
                status: 'pending',
                payload: { camera_id: selectedCameraId }
            });
            await supabase.from('system_commands').insert({
                command_type: 'force_refresh',
                status: 'pending',
                payload: { source: 'zones', camera_id: selectedCameraId }
            });

            toast.success(`✅ ${zones.length} zone(s) saved successfully!`);
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save zones. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <ScanLine className="text-red-600" />
                        Zone Configuration
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">Define virtual boundaries for automated detection.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Tools Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    {/* Camera Selector */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-3 text-slate-900 dark:text-white font-semibold">
                            <Video size={18} className="text-blue-500" />
                            Target Camera
                        </div>
                        <select
                            value={selectedCameraId}
                            onChange={(e) => setSelectedCameraId(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white transition-all"
                        >
                            {cameras.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => selectedCameraId && loadLatestSnapshot(selectedCameraId)}
                            className="w-full mt-3 flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <RefreshCw size={12} /> Refresh Snapshot
                        </button>
                    </div>

                    {/* Drawing Tools */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="font-semibold mb-4 dark:text-white flex items-center gap-2">
                            <MousePointer2 size={18} className="text-purple-500" />
                            Drawing Tools
                        </h3>

                        <button
                            onClick={() => {
                                setDrawType('line');
                                setIsDrawing(true);
                                setCurrentPoints([]);
                            }}
                            disabled={isDrawing || !snapshotUrl}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-3 transition-all font-medium border-2 ${isDrawing
                                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-white border-slate-200 hover:border-blue-400 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                <Plus size={18} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="text-left">
                                <span className="block text-sm">Add Tripwire</span>
                                <span className="text-[10px] opacity-70 font-normal">Detect crossing objects</span>
                            </div>
                        </button>

                        <button
                            onClick={() => { setZones([]); toast.info("All zones cleared"); }}
                            disabled={zones.length === 0}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border-2 bg-white border-slate-200 hover:border-red-400 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:text-red-600 disabled:opacity-50"
                        >
                            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                                <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                            </div>
                            <span className="text-sm">Clear Board</span>
                        </button>
                    </div>

                    {/* Info Card */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
                        <div className="flex gap-3">
                            <Info className="flex-shrink-0 text-blue-600 dark:text-blue-400" size={20} />
                            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                                Click on the image to set the start and end points of a tripwire. Objects crossing this line will trigger alerts.
                            </p>
                        </div>
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={saveZones}
                        disabled={loading}
                        className="w-full group flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-2xl hover:from-red-500 hover:to-red-600 font-bold shadow-lg shadow-red-500/30 transition-all active:scale-95 disabled:opacity-70 disabled:grayscale disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <RefreshCw size={20} className="animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={20} className="group-hover:scale-110 transition-transform" />
                                Save Configuration
                            </>
                        )}
                    </button>
                </div>

                {/* Canvas Editor */}
                <div className="lg:col-span-3">
                    <div className="bg-slate-900 rounded-2xl overflow-hidden relative aspect-video flex items-center justify-center border-4 border-slate-800 shadow-2xl">
                        {snapshotUrl ? (
                            <div className="relative w-full h-full group cursor-crosshair">
                                <img
                                    ref={imageRef}
                                    src={snapshotUrl}
                                    alt="Camera View"
                                    className="w-full h-full object-contain pointer-events-none select-none opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

                                <canvas
                                    ref={canvasRef}
                                    className="absolute inset-0 w-full h-full"
                                    width={1280}
                                    height={720}
                                    onClick={handleCanvasClick}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setIsDrawing(false);
                                        setCurrentPoints([]);
                                        toast("Drawing cancelled");
                                    }}
                                />

                                {/* Overlay Indicators */}
                                <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                                    <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${isDrawing ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                                        {isDrawing ? 'Drawing Mode Active' : 'View Mode'}
                                    </div>
                                    {zones.length > 0 && (
                                        <div className="bg-red-600/80 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10">
                                            {zones.length} Active Zones
                                        </div>
                                    )}
                                </div>

                                {isDrawing && currentPoints.length === 0 && (
                                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium animate-bounce pointer-events-none">
                                        Click to set start point
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center text-slate-500 px-6 py-8 w-full">
                                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Video size={28} />
                                </div>
                                <h3 className="text-base font-semibold text-slate-300 mb-1">No Snapshot Available</h3>
                                <p className="text-xs text-slate-500 max-w-xs mx-auto mb-5">
                                    A snapshot is captured automatically after the first AI detection event on this camera.
                                    Until then, paste any image URL below to use as a drawing reference.
                                </p>
                                {!showManualInput ? (
                                    <button
                                        onClick={() => setShowManualInput(true)}
                                        className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
                                    >
                                        <Plus size={14} /> Use Custom Image URL
                                    </button>
                                ) : (
                                    <div className="flex gap-2 max-w-sm mx-auto">
                                        <input
                                            autoFocus
                                            type="url"
                                            value={manualUrl}
                                            onChange={e => setManualUrl(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && manualUrl.trim()) {
                                                    setSnapshotUrl(manualUrl.trim());
                                                    setShowManualInput(false);
                                                    toast.success('Custom image loaded');
                                                }
                                            }}
                                            placeholder="https://... (image URL)"
                                            className="flex-1 px-3 py-2 text-xs rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button
                                            onClick={() => {
                                                if (manualUrl.trim()) {
                                                    setSnapshotUrl(manualUrl.trim());
                                                    setShowManualInput(false);
                                                    toast.success('Custom image loaded');
                                                }
                                            }}
                                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                                        >
                                            Load
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Zone List (New) */}
                    {zones.length > 0 && (
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {zones.map((zone, i) => (
                                <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                                            <ScanLine size={16} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-slate-900 dark:text-white text-sm">{zone.label}</div>
                                            <div className="text-xs text-slate-500">{zone.type.toUpperCase()} • {zone.points.length} Points</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newZones = [...zones];
                                            newZones.splice(i, 1);
                                            setZones(newZones);
                                        }}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
