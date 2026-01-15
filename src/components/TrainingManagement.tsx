import { useEffect, useState } from 'react';
import { Upload, Database, Play, Activity, Trash2, Search, LayoutList, LayoutGrid } from 'lucide-react';
import { supabase, type Dataset, type TrainingJob, type AIServer } from '../lib/supabase';

export default function TrainingManagement() {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [jobs, setJobs] = useState<TrainingJob[]>([]);
    const [servers, setServers] = useState<AIServer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Upload Form Data
    const [datasetName, setDatasetName] = useState('');
    const [datasetDesc, setDatasetDesc] = useState('');
    const [datasetFormat, setDatasetFormat] = useState('yolo_zip');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // New Training Job Modal (simple version: click "Train" on a dataset)
    const [selectedDatasetForTrain, setSelectedDatasetForTrain] = useState<Dataset | null>(null);
    const [targetServerId, setTargetServerId] = useState('');
    const [epochs, setEpochs] = useState(100);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 5000); // Poll for training progress
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        const { data: dbDatasets } = await supabase.from('datasets').select('*').order('created_at', { ascending: false });
        if (dbDatasets) setDatasets(dbDatasets);

        const { data: dbJobs } = await supabase.from('training_jobs').select('*').order('created_at', { ascending: false });
        if (dbJobs) setJobs(dbJobs);

        const { data: dbServers } = await supabase.from('ai_servers').select('*').order('name');
        if (dbServers) setServers(dbServers);
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) return;

        setUploading(true);
        try {
            const fileName = `${Date.now()}_${selectedFile.name}`;
            const { error: uploadError } = await supabase.storage.from('datasets').upload(fileName, selectedFile);
            if (uploadError) throw uploadError;

            await supabase.from('datasets').insert({
                name: datasetName,
                description: datasetDesc,
                format: datasetFormat,
                storage_path: fileName,
                image_count: 0 // Placeholder, could be parsed by server later
            });

            setShowUploadModal(false);
            setDatasetName('');
            setDatasetDesc('');
            setSelectedFile(null);
            loadData();
        } catch (err) {
            console.error(err);
            alert('Upload failed!');
        } finally {
            setUploading(false);
        }
    };

    const startTraining = async () => {
        if (!selectedDatasetForTrain || !targetServerId) return;

        await supabase.from('training_jobs').insert({
            dataset_id: selectedDatasetForTrain.id,
            server_id: targetServerId,
            epochs: epochs,
            status: 'pending'
        });

        setSelectedDatasetForTrain(null);
        loadData();
    };

    const handleDeleteDataset = async (id: string, path: string) => {
        if (!confirm('Delete this dataset?')) return;
        await supabase.storage.from('datasets').remove([path]);
        await supabase.from('datasets').delete().eq('id', id);
        loadData();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'text-green-600 bg-green-100';
            case 'processing': return 'text-blue-600 bg-blue-100';
            case 'failed': return 'text-red-600 bg-red-100';
            default: return 'text-slate-600 bg-slate-100';
        }
    };

    return (
        <div className="space-y-8">

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Training Center</h1>
                <p className="text-slate-600 dark:text-slate-400">Manage datasets and train custom AI models.</p>
            </div>

            {/* Datasets Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Database size={20} /> Datasets
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search datasets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                        </div>
                        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
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
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700"
                        >
                            <Upload size={18} /> Upload Dataset
                        </button>
                    </div>
                </div>

                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
                    {viewMode === 'list' ? (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Name</th>
                                        <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Description</th>
                                        <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Format</th>
                                        <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Uploaded</th>
                                        <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {datasets.filter(ds =>
                                        ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        (ds.description || '').toLowerCase().includes(searchQuery.toLowerCase())
                                    ).map(ds => (
                                        <tr key={ds.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="p-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                                                <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                                                    <Database size={18} />
                                                </div>
                                                {ds.name}
                                            </td>
                                            <td className="p-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">{ds.description || 'No description'}</td>
                                            <td className="p-4">
                                                <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 capitalize">{ds.format.replace('_', ' ')}</span>
                                            </td>
                                            <td className="p-4 text-slate-600 dark:text-slate-400">
                                                {new Date(ds.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex gap-2">
                                                    <button onClick={() => setSelectedDatasetForTrain(ds)} className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700" title="Train Model">
                                                        <Play size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteDataset(ds.id, ds.storage_path)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        datasets.filter(ds =>
                            ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (ds.description || '').toLowerCase().includes(searchQuery.toLowerCase())
                        ).map(ds => (
                            <div key={ds.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                                        <Database size={24} />
                                    </div>
                                    <button onClick={() => handleDeleteDataset(ds.id, ds.storage_path)} className="text-slate-400 hover:text-red-500">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{ds.name}</h3>
                                <p className="text-sm text-slate-500 mb-4">{ds.description || 'No description'}</p>

                                <div className="flex gap-2 mb-4">
                                    <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 capitalize">{ds.format.replace('_', ' ')}</span>
                                    <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                                        {new Date(ds.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                <button
                                    onClick={() => setSelectedDatasetForTrain(ds)}
                                    className="w-full bg-slate-900 dark:bg-black text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-700"
                                >
                                    <Play size={16} /> Train Model
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Training Jobs Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity size={20} /> Active Training Jobs
                </h2>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Dataset</th>
                                <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Server</th>
                                <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Epochs</th>
                                <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Progress</th>
                                <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {jobs.map(job => (
                                <tr key={job.id}>
                                    <td className="p-4 font-medium text-slate-900 dark:text-white">
                                        {datasets.find(d => d.id === job.dataset_id)?.name || 'Unknown Dataset'}
                                    </td>
                                    <td className="p-4 text-slate-600 dark:text-slate-400">
                                        {servers.find(s => s.id === job.server_id)?.name || 'Unknown Server'}
                                    </td>
                                    <td className="p-4 text-slate-600 dark:text-slate-400">
                                        {job.current_epoch} / {job.epochs}
                                    </td>
                                    <td className="p-4">
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 max-w-[100px]">
                                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${(job.progress * 100).toFixed(0)}%` }}></div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getStatusColor(job.status)}`}>
                                            {job.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {jobs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">No training jobs yet. Start one above!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 dark:text-white">Upload New Dataset</h3>
                        <form onSubmit={handleUpload} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Name</label>
                                <input className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={datasetName}
                                    onChange={e => setDatasetName(e.target.value)} required placeholder="Construction Workers" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Description</label>
                                <textarea className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={datasetDesc}
                                    onChange={e => setDatasetDesc(e.target.value)} placeholder="Images of workers with helmets..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Format</label>
                                <select className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={datasetFormat} onChange={e => setDatasetFormat(e.target.value)}>
                                    <option value="yolo_zip">YOLO Format (.zip)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Dataset File (.zip)</label>
                                <input type="file" accept=".zip" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="w-full dark:text-slate-400" required />
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-2 bg-slate-100 rounded hover:bg-slate-200 text-slate-700">Cancel</button>
                                <button type="submit" disabled={uploading} className="flex-1 py-2 bg-red-600 rounded hover:bg-red-700 text-white flex justify-center">{uploading ? 'Uploading...' : 'Upload'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Train Modal */}
            {selectedDatasetForTrain && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 dark:text-white">Start Training</h3>
                        <p className="mb-4 text-slate-600 dark:text-slate-400">Dataset: <b>{selectedDatasetForTrain.name}</b></p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Select Training Server</label>
                                <select className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={targetServerId} onChange={e => setTargetServerId(e.target.value)}>
                                    <option value="">-- Choose Server --</option>
                                    {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Epochs (Training Cycles)</label>
                                <input type="number" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={epochs} onChange={e => setEpochs(Number(e.target.value))} />
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button onClick={() => setSelectedDatasetForTrain(null)} className="flex-1 py-2 bg-slate-100 rounded hover:bg-slate-200 text-slate-700">Cancel</button>
                                <button onClick={startTraining} disabled={!targetServerId} className="flex-1 py-2 bg-blue-600 rounded hover:bg-blue-700 text-white">Start Training</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
