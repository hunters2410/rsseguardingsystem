import { useEffect, useState } from 'react';
import { Bell, Save, Camera as CameraIcon, Globe, Shield, AlertTriangle, CheckCircle2, RefreshCw, Plus, X } from 'lucide-react';
import { supabase, type AlertRule, type Camera } from '../lib/supabase';
import { toast } from 'sonner';

// Common object types from YOLO models
const DEFAULT_OBJECTS = [
    { value: 'person', label: 'Person', category: 'security', icon: '👤' },
    { value: 'car', label: 'Car', category: 'vehicle', icon: '🚗' },
    { value: 'truck', label: 'Truck', category: 'vehicle', icon: '🚚' },
    { value: 'motorcycle', label: 'Motorcycle', category: 'vehicle', icon: '🏍️' },
    { value: 'bicycle', label: 'Bicycle', category: 'vehicle', icon: '🚲' },
    { value: 'bus', label: 'Bus', category: 'vehicle', icon: '🚌' },
    { value: 'dog', label: 'Dog', category: 'animal', icon: '🐕' },
    { value: 'cat', label: 'Cat', category: 'animal', icon: '🐈' },
    { value: 'bird', label: 'Bird', category: 'animal', icon: '🐦' },
    { value: 'weapon', label: 'Weapon', category: 'threat', icon: '🔫' },
    { value: 'gun', label: 'Gun', category: 'threat', icon: '🔫' },
    { value: 'knife', label: 'Knife', category: 'threat', icon: '🔪' },
    { value: 'fire', label: 'Fire', category: 'threat', icon: '🔥' },
    { value: 'smoke', label: 'Smoke', category: 'threat', icon: '💨' },
];

const PRESETS = {
    high_security: {
        name: 'High Security',
        enabled_objects: ['person', 'weapon', 'gun', 'knife', 'car', 'truck', 'motorcycle'],
        mode: 'whitelist' as const,
        confidence_threshold: 0.35,
    },
    office_hours: {
        name: 'Office Hours',
        enabled_objects: [],
        disabled_objects: ['bird', 'cat'],
        mode: 'blacklist' as const,
        confidence_threshold: 0.28,
    },
    after_hours: {
        name: 'After Hours',
        enabled_objects: ['person', 'car', 'truck'],
        mode: 'whitelist' as const,
        confidence_threshold: 0.40,
    },
    perimeter_only: {
        name: 'Perimeter Only',
        enabled_objects: ['person', 'car', 'truck', 'motorcycle'],
        mode: 'whitelist' as const,
        confidence_threshold: 0.30,
    },
};

export default function AlertConfiguration() {
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [globalRule, setGlobalRule] = useState<AlertRule | null>(null);
    const [cameraRules, setCameraRules] = useState<Record<string, AlertRule>>({});
    const [selectedCameraId, setSelectedCameraId] = useState<string>('');
    const [globalLoading, setGlobalLoading] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [customObjects, setCustomObjects] = useState<typeof DEFAULT_OBJECTS>([]);
    const [newObjectName, setNewObjectName] = useState('');
    const [newObjectIcon, setNewObjectIcon] = useState('🎯');
    const [showAddCustom, setShowAddCustom] = useState(false);

    const allObjects = [...DEFAULT_OBJECTS, ...customObjects];

    useEffect(() => {
        loadCameras();
        loadAlertRules();
        loadCustomObjects();
    }, []);

    const loadCameras = async () => {
        const { data } = await supabase.from('cameras').select('*').order('name');
        if (data) setCameras(data);
    };

    const loadCustomObjects = () => {
        const saved = localStorage.getItem('custom_alert_objects');
        if (saved) {
            try {
                setCustomObjects(JSON.parse(saved));
            } catch (e) {
                console.error('Error loading custom objects:', e);
            }
        }
    };

    const saveCustomObjects = (objects: typeof DEFAULT_OBJECTS) => {
        localStorage.setItem('custom_alert_objects', JSON.stringify(objects));
        setCustomObjects(objects);
    };

    const addCustomObject = () => {
        if (!newObjectName.trim()) {
            toast.error('Please enter an object name');
            return;
        }

        const newObj = {
            value: newObjectName.toLowerCase().replace(/\s+/g, '_'),
            label: newObjectName,
            category: 'custom',
            icon: newObjectIcon,
        };

        const updated = [...customObjects, newObj];
        saveCustomObjects(updated);
        setNewObjectName('');
        setNewObjectIcon('🎯');
        setShowAddCustom(false);
        toast.success(`Added custom object: ${newObjectName}`);
    };

    const removeCustomObject = (value: string) => {
        const updated = customObjects.filter(obj => obj.value !== value);
        saveCustomObjects(updated);
        toast.success('Custom object removed');
    };

    const loadAlertRules = async () => {
        try {
            const { data } = await supabase.from('alert_rules').select('*');
            if (data) {
                const global = data.find(r => r.camera_id === null);
                const cameraSpecific = data.filter(r => r.camera_id !== null);

                setGlobalRule(global || null);

                const rulesMap: Record<string, AlertRule> = {};
                cameraSpecific.forEach(rule => {
                    if (rule.camera_id) rulesMap[rule.camera_id] = rule;
                });
                setCameraRules(rulesMap);
            }
        } catch (error) {
            console.error('Error loading alert rules:', error);
            toast.error('Failed to load alert rules');
        }
    };

    const saveGlobalRule = async () => {
        if (!globalRule) return;

        setGlobalLoading(true);
        try {
            const { error } = await supabase
                .from('alert_rules')
                .upsert({
                    ...globalRule,
                    camera_id: null,
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;
            toast.success('✅ Global rules saved!');
        } catch (error) {
            console.error('Error saving global rule:', error);
            toast.error('Failed to save global rules');
        } finally {
            setGlobalLoading(false);
        }
    };

    const saveCameraRule = async () => {
        if (!selectedCameraId) {
            toast.warning('Please select a camera');
            return;
        }

        // Get existing rule or create new one
        const rule = cameraRules[selectedCameraId] || {
            id: crypto.randomUUID(),
            camera_id: selectedCameraId,
            enabled_objects: [],
            disabled_objects: [],
            mode: 'whitelist' as const,
            apply_to_zones_only: false,
            confidence_threshold: 0.28,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        setCameraLoading(true);
        try {
            const { error } = await supabase
                .from('alert_rules')
                .upsert({
                    ...rule,
                    camera_id: selectedCameraId,
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;

            // Reload rules to get the saved data
            await loadAlertRules();
            toast.success('✅ Camera rules saved!');
        } catch (error) {
            console.error('Error saving camera rule:', error);
            toast.error('Failed to save camera rules');
        } finally {
            setCameraLoading(false);
        }
    };

    const resetCameraToGlobal = async () => {
        if (!selectedCameraId) return;

        setCameraLoading(true);
        try {
            const { error } = await supabase
                .from('alert_rules')
                .delete()
                .eq('camera_id', selectedCameraId);

            if (error) throw error;

            const newRules = { ...cameraRules };
            delete newRules[selectedCameraId];
            setCameraRules(newRules);

            toast.success('Camera reset to global rules');
        } catch (error) {
            console.error('Error resetting camera rule:', error);
            toast.error('Failed to reset camera rules');
        } finally {
            setCameraLoading(false);
        }
    };

    const applyPreset = (presetKey: keyof typeof PRESETS) => {
        const preset = PRESETS[presetKey];
        if (!globalRule) return;

        setGlobalRule({
            ...globalRule,
            enabled_objects: preset.enabled_objects,
            disabled_objects: 'disabled_objects' in preset ? preset.disabled_objects : [],
            mode: preset.mode,
            confidence_threshold: preset.confidence_threshold,
        });

        toast.info(`Applied ${preset.name} preset`);
    };

    const toggleGlobalObject = (objectValue: string) => {
        if (!globalRule) return;

        const isBlacklist = globalRule.mode === 'blacklist';
        const listKey = isBlacklist ? 'disabled_objects' : 'enabled_objects';
        const currentList = globalRule[listKey] || [];

        const newList = [...currentList];
        const index = newList.indexOf(objectValue);

        if (index > -1) {
            newList.splice(index, 1);
        } else {
            newList.push(objectValue);
        }

        setGlobalRule({ ...globalRule, [listKey]: newList });
    };

    const toggleCameraObject = (objectValue: string) => {
        if (!selectedCameraId) return;

        const rule = cameraRules[selectedCameraId] || {
            id: '',
            camera_id: selectedCameraId,
            enabled_objects: [],
            disabled_objects: [],
            mode: 'whitelist' as const,
            apply_to_zones_only: false,
            confidence_threshold: 0.28,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const isBlacklist = rule.mode === 'blacklist';
        const listKey = isBlacklist ? 'disabled_objects' : 'enabled_objects';
        const currentList = rule[listKey] || [];

        const newList = [...currentList];
        const index = newList.indexOf(objectValue);

        if (index > -1) {
            newList.splice(index, 1);
        } else {
            newList.push(objectValue);
        }

        setCameraRules({
            ...cameraRules,
            [selectedCameraId]: { ...rule, [listKey]: newList },
        });
    };

    const selectedCamera = cameras.find(c => c.id === selectedCameraId);
    const selectedCameraRule = selectedCameraId ? cameraRules[selectedCameraId] : null;
    const hasOverride = selectedCameraId && !!cameraRules[selectedCameraId];

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Bell className="text-red-600" size={20} />
                        Alert Configuration
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Control which detected objects trigger alerts
                    </p>
                </div>
            </div>

            {/* Global Rules */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-3 text-white">
                    <div className="flex items-center gap-2">
                        <Globe size={18} />
                        <div>
                            <h3 className="text-sm font-bold">Global Rules</h3>
                            <p className="text-xs text-red-100">Apply to all cameras by default</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {globalRule && (
                        <>
                            {/* Mode Selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Alert Mode
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setGlobalRule({ ...globalRule, mode: 'whitelist' })}
                                        className={`flex-1 p-2 rounded-lg border transition-all text-xs ${globalRule.mode === 'whitelist'
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-green-300'
                                            }`}
                                    >
                                        <CheckCircle2 className="mx-auto mb-1" size={16} />
                                        <div className="font-bold">Whitelist</div>
                                    </button>
                                    <button
                                        onClick={() => setGlobalRule({ ...globalRule, mode: 'blacklist' })}
                                        className={`flex-1 p-2 rounded-lg border transition-all text-xs ${globalRule.mode === 'blacklist'
                                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-orange-300'
                                            }`}
                                    >
                                        <AlertTriangle className="mx-auto mb-1" size={16} />
                                        <div className="font-bold">Blacklist (Advanced)</div>
                                    </button>
                                </div>
                            </div>

                            {/* Quick Presets */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Quick Presets
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {Object.entries(PRESETS).map(([key, preset]) => (
                                        <button
                                            key={key}
                                            onClick={() => applyPreset(key as keyof typeof PRESETS)}
                                            className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 transition-all text-left"
                                        >
                                            <div className="font-bold text-xs dark:text-white">{preset.name}</div>
                                            <div className="text-[10px] text-slate-500">{preset.enabled_objects.length} objects</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Object Selection */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        {globalRule.mode === 'whitelist' ? 'Trigger alerts for:' : 'Exclude from alerts (Disabled):'}
                                    </label>
                                    <button
                                        onClick={() => setShowAddCustom(!showAddCustom)}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <Plus size={12} />
                                        Add Custom
                                    </button>
                                </div>

                                {/* Add Custom Object Form */}
                                {showAddCustom && (
                                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Object name (e.g., helmet)"
                                                value={newObjectName}
                                                onChange={(e) => setNewObjectName(e.target.value)}
                                                className="flex-1 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Icon"
                                                value={newObjectIcon}
                                                onChange={(e) => setNewObjectIcon(e.target.value)}
                                                className="w-16 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center"
                                            />
                                            <button
                                                onClick={addCustomObject}
                                                className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700"
                                            >
                                                Add
                                            </button>
                                            <button
                                                onClick={() => setShowAddCustom(false)}
                                                className="px-2 py-1 text-slate-500 hover:text-slate-700"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                    {allObjects.map(obj => {
                                        const isBlacklist = globalRule.mode === 'blacklist';
                                        const listToCheck = isBlacklist ? globalRule.disabled_objects : globalRule.enabled_objects;
                                        const isSelected = listToCheck?.includes(obj.value) || false;
                                        const isCustom = obj.category === 'custom';

                                        return (
                                            <div key={obj.value} className="relative group">
                                                <button
                                                    onClick={() => toggleGlobalObject(obj.value)}
                                                    className={`w-full p-2 rounded-lg border transition-all text-left ${isSelected
                                                            ? isBlacklist ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-lg">{obj.icon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-[10px] dark:text-white truncate">{obj.label}</div>
                                                        </div>
                                                        {isSelected && <CheckCircle2 size={10} className={isBlacklist ? "text-orange-600" : "text-blue-600"} />}
                                                    </div>
                                                </button>
                                                {isCustom && (
                                                    <button
                                                        onClick={() => removeCustomObject(obj.value)}
                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remove custom object"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Confidence Threshold */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Confidence: {(globalRule.confidence_threshold * 100).toFixed(0)}%
                                </label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="0.9"
                                    step="0.05"
                                    value={globalRule.confidence_threshold}
                                    onChange={(e) => setGlobalRule({ ...globalRule, confidence_threshold: parseFloat(e.target.value) })}
                                    className="w-full h-1"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                                    <span>More alerts</span>
                                    <span>Fewer alerts</span>
                                </div>
                            </div>

                            {/* Save Button */}
                            <button
                                onClick={saveGlobalRule}
                                disabled={globalLoading}
                                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                            >
                                {globalLoading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                Save Global Rules
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Camera-Specific Overrides */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-white">
                    <div className="flex items-center gap-2">
                        <CameraIcon size={18} />
                        <div>
                            <h3 className="text-sm font-bold">Camera-Specific Overrides</h3>
                            <p className="text-xs text-blue-100">Configure rules for individual cameras</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {/* Camera Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Select Camera
                        </label>
                        <select
                            value={selectedCameraId}
                            onChange={(e) => setSelectedCameraId(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
                        >
                            <option value="">Choose a camera...</option>
                            {cameras.map(cam => (
                                <option key={cam.id} value={cam.id}>
                                    {cam.name} {cameraRules[cam.id] ? '(Custom)' : '(Global)'}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedCamera && (
                        <>
                            {!hasOverride && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                    <div className="flex items-start gap-2">
                                        <Shield className="text-blue-600 flex-shrink-0 mt-0.5" size={14} />
                                        <div>
                                            <div className="font-bold text-xs text-blue-900 dark:text-blue-100">Using Global Rules</div>
                                            <div className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">
                                                Select objects below to create a custom override
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Object Selection for Camera */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Trigger alerts for:
                                </label>
                                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                    {allObjects.map(obj => {
                                        const rule = selectedCameraRule || globalRule;
                                        if (!rule) return null;

                                        const isBlacklist = rule.mode === 'blacklist';
                                        const listToCheck = isBlacklist ? rule.disabled_objects : rule.enabled_objects;
                                        const isSelected = listToCheck?.includes(obj.value) || false;

                                        return (
                                            <button
                                                key={obj.value}
                                                onClick={() => toggleCameraObject(obj.value)}
                                                className={`p-2 rounded-lg border transition-all text-left ${isSelected
                                                        ? isBlacklist ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span className="text-lg">{obj.icon}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-[10px] dark:text-white truncate">{obj.label}</div>
                                                    </div>
                                                    {isSelected && <CheckCircle2 size={10} className={isBlacklist ? "text-orange-600" : "text-blue-600"} />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                <button
                                    onClick={saveCameraRule}
                                    disabled={cameraLoading}
                                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                >
                                    {cameraLoading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                    Save Camera Rules
                                </button>
                                {hasOverride && (
                                    <button
                                        onClick={resetCameraToGlobal}
                                        disabled={cameraLoading}
                                        className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
