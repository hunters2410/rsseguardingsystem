import { useEffect, useState } from 'react';
import { X, Check, Brain, Loader2, Power } from 'lucide-react';
import { supabase, type Camera, type AIModel } from '../lib/supabase';

type Props = {
    camera: Camera;
    onClose: () => void;
};

export default function CameraModelAssignment({ camera, onClose }: Props) {
    const [models, setModels] = useState<AIModel[]>([]);
    const [assignments, setAssignments] = useState<string[]>([]); // List of model_ids assigned
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [togglingStatus, setTogglingStatus] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [camera.id]);

    const loadData = async () => {
        setLoading(true);
        // Fetch all active models
        const { data: allModels } = await supabase
            .from('ai_models')
            .select('*')
            .order('name');

        // Fetch current assignments for this camera
        const { data: currentAssignments } = await supabase
            .from('camera_models')
            .select('ai_model_id')
            .eq('camera_id', camera.id);

        if (allModels) setModels(allModels);
        if (currentAssignments) setAssignments(currentAssignments.map(a => a.ai_model_id));
        setLoading(false);
    };

    const toggleAssignment = async (modelId: string) => {
        setProcessing(modelId);
        const isAssigned = assignments.includes(modelId);

        if (isAssigned) {
            // Remove
            await supabase
                .from('camera_models')
                .delete()
                .eq('camera_id', camera.id)
                .eq('ai_model_id', modelId);
            setAssignments(prev => prev.filter(id => id !== modelId));
        } else {
            // Add
            await supabase
                .from('camera_models')
                .insert({
                    camera_id: camera.id,
                    ai_model_id: modelId
                });
            setAssignments(prev => [...prev, modelId]);
        }
        setProcessing(null);
    };

    const toggleModelStatus = async (e: any, model: AIModel) => {
        e.stopPropagation(); // Prevent assigning/unassigning when clicking toggle
        setTogglingStatus(model.id);

        const { error } = await supabase
            .from('ai_models')
            .update({ is_active: !model.is_active })
            .eq('id', model.id);

        if (!error) {
            // Update local state to reflect change immediately
            setModels(prev => prev.map(m =>
                m.id === model.id ? { ...m, is_active: !m.is_active } : m
            ));
        }
        setTogglingStatus(null);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold dark:text-white">AI Configuration</h3>
                        <p className="text-sm text-slate-500">{camera.name}</p>
                    </div>
                    <button onClick={onClose}><X className="text-slate-400 hover:text-slate-600 dark:hover:text-white" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-red-600" /></div>
                    ) : models.length === 0 ? (
                        <div className="text-center text-slate-500 py-8">No AI models available. Create one first!</div>
                    ) : (
                        models.map(model => {
                            const isAssigned = assignments.includes(model.id);
                            const isBusy = processing === model.id;
                            return (
                                <div key={model.id}
                                    onClick={() => !isBusy && toggleAssignment(model.id)}
                                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${isAssigned
                                        ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900'
                                        : 'bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-750'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded ${isAssigned ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            <Brain size={18} />
                                        </div>
                                        <div>
                                            <h4 className={`font-medium ${isAssigned ? 'text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {model.name}
                                            </h4>
                                            <div className="flex flex-col gap-1.5 mt-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs text-slate-500 capitalize">{model.model_type.replace('_', ' ')}</p>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-bold ${model.server_id ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                                                        {model.server_id ? 'Deployed' : 'No Server'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <button
                                                        onClick={(e) => toggleModelStatus(e, model)}
                                                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${model.is_active
                                                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                            }`}
                                                        disabled={togglingStatus === model.id}
                                                    >
                                                        {togglingStatus === model.id ? (
                                                            <Loader2 size={10} className="animate-spin" />
                                                        ) : (
                                                            <Power size={10} />
                                                        )}
                                                        {model.is_active ? 'Active' : 'Enable'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        {isBusy ? <Loader2 size={18} className="animate-spin text-slate-400" /> : (
                                            isAssigned && <Check size={18} className="text-red-600" />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-xl">
                    <button onClick={onClose} className="w-full py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 transition-colors">
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
