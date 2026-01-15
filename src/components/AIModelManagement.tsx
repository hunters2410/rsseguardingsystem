import { useEffect, useState, useRef } from 'react';
import { Brain, Plus, Edit, Trash2, X, Power, Activity, Upload, FileCode, Search, ChevronDown, Check } from 'lucide-react';
import { supabase, type AIModel, type AIServer } from '../lib/supabase';

const MODEL_TYPES = [
  { value: 'person_detection', label: 'Person Detection' },
  { value: 'vehicle_detection', label: 'Vehicle Detection' },
  { value: 'face_recognition', label: 'Face Recognition' },
  { value: 'motion_detection', label: 'Motion Detection' },
  { value: 'intrusion_detection', label: 'Intrusion Detection' },
  { value: 'crowd_detection', label: 'Crowd Detection' },
  { value: 'object_tracking', label: 'Object Tracking' },
  { value: 'weapon_detection', label: 'Weapon Detection' },
  { value: 'fire_detection', label: 'Fire/Smoke Detection' },
  { value: 'other', label: 'Other' }
];

export default function AIModelManagement() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [servers, setServers] = useState<AIServer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Searchable Select State
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model_type: 'person_detection',
    version: '1.0',
    accuracy: 95.0,
    server_id: '',
    model_path: '',
  });

  useEffect(() => {
    loadModels();
    loadServers();

    // Click outside to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadModels = async () => {
    const { data } = await supabase.from('ai_models').select('*').order('created_at', { ascending: false });
    if (data) setModels(data);
  };

  const loadServers = async () => {
    const { data } = await supabase.from('ai_servers').select('*').order('name');
    if (data) setServers(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let uploadedPath = formData.model_path;

    if (selectedFile) {
      setUploading(true);
      try {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${selectedFile.name}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('ai-models')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;
        uploadedPath = filePath;
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload model file. Please ensure the "ai-models" bucket exists and is public/writable.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const modelData = {
      name: formData.name,
      description: formData.description,
      model_type: formData.model_type,
      version: formData.version,
      accuracy: formData.accuracy,
      server_id: formData.server_id || null, // Convert empty string to null for UUID field
      model_path: uploadedPath,
    };

    if (editingModel) {
      await supabase.from('ai_models').update(modelData).eq('id', editingModel.id);
    } else {
      await supabase.from('ai_models').insert([modelData]);
    }

    resetForm();
    loadModels();
  };

  const handleDelete = async (id: string, modelPath?: string) => {
    if (confirm('Are you sure you want to delete this AI model?')) {
      if (modelPath) {
        // Try to delete the file from storage too
        await supabase.storage.from('ai-models').remove([modelPath]);
      }
      await supabase.from('ai_models').delete().eq('id', id);
      loadModels();
    }
  };

  const toggleModelStatus = async (model: AIModel) => {
    await supabase
      .from('ai_models')
      .update({ is_active: !model.is_active })
      .eq('id', model.id);
    loadModels();
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    setFormData({
      name: model.name,
      description: model.description || '',
      model_type: model.model_type,
      version: model.version,
      accuracy: model.accuracy || 95.0,
      server_id: model.server_id || '',
      model_path: model.model_path || '',
    });
    setSelectedFile(null);
    setShowModal(true);
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingModel(null);
    setSelectedFile(null);
    setUploading(false);
    setIsTypeOpen(false);
    setFormData({
      name: '',
      description: '',
      model_type: 'person_detection',
      version: '1.0',
      accuracy: 95.0,
      server_id: '',
      model_path: '',
    });
  };

  const getModelTypeColor = (type: string) => {
    switch (type) {
      case 'person_detection': return 'bg-blue-100 text-blue-700';
      case 'vehicle_detection': return 'bg-green-100 text-green-700';
      case 'face_recognition': return 'bg-purple-100 text-purple-700';
      case 'motion_detection': return 'bg-orange-100 text-orange-700';
      case 'weapon_detection': return 'bg-red-100 text-red-700';
      case 'fire_detection': return 'bg-red-100 text-red-700';
      case 'other': return 'bg-gray-100 text-gray-700';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700';
    }
  };

  const getServerName = (serverId?: string) => {
    if (!serverId) return 'Not deployed';
    const server = servers.find((s) => s.id === serverId);
    return server ? server.name : 'Unknown';
  };

  // Filtered model types
  const filteredModelTypes = MODEL_TYPES.filter(t =>
    t.label.toLowerCase().includes(typeSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">AI Model Management</h1>
          <p className="text-slate-600 mt-1">Deploy and manage AI detection models</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus size={20} />
          Add Model
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {models.map((model) => (
          <div key={model.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Brain className="text-purple-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{model.name}</h3>
                  <p className="text-sm text-slate-500">v{model.version}</p>
                </div>
              </div>
              <button
                onClick={() => toggleModelStatus(model)}
                className={`p-2 rounded-lg transition-colors ${model.is_active
                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
              >
                <Power size={18} />
              </button>
            </div>

            {model.description && (
              <p className="text-sm text-slate-600 mb-4 line-clamp-2">{model.description}</p>
            )}

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Type:</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getModelTypeColor(model.model_type)}`}>
                  {MODEL_TYPES.find(t => t.value === model.model_type)?.label || model.model_type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Accuracy:</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{model.accuracy}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Server:</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{getServerName(model.server_id)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity size={14} className={model.is_active ? 'text-green-500' : 'text-slate-400'} />
                <span className={`text-sm font-medium ${model.is_active ? 'text-green-600' : 'text-slate-500'}`}>
                  {model.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {model.model_path && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded truncate">
                  <FileCode size={14} />
                  <span className="truncate">{model.model_path}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(model)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                disabled={uploading}
              >
                <Edit size={16} />
                Edit
              </button>
              <button
                onClick={() => handleDelete(model.id, model.model_path)}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                disabled={uploading}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {models.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Brain className="mx-auto text-slate-400 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No AI Models Yet</h3>
          <p className="text-slate-600 mb-4">Deploy your first AI model to start detecting objects and events</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add First Model
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {editingModel ? 'Edit AI Model' : 'Add New AI Model'}
              </h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Model Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="YOLOv8 Person Detector"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  rows={3}
                  placeholder="Model description and use case"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={typeDropdownRef} className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Model Type</label>
                  <button
                    type="button"
                    onClick={() => setIsTypeOpen(!isTypeOpen)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-700 text-left flex justify-between items-center focus:ring-2 focus:ring-red-500 dark:text-white"
                  >
                    <span>
                      {MODEL_TYPES.find(t => t.value === formData.model_type)?.label || 'Select Type'}
                    </span>
                    <ChevronDown size={16} />
                  </button>

                  {isTypeOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <div className="sticky top-0 p-2 bg-white dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                        <div className="flex items-center px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                          <Search size={14} className="text-slate-400 mr-2" />
                          <input
                            type="text"
                            value={typeSearch}
                            onChange={(e) => setTypeSearch(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm w-full dark:text-white"
                            placeholder="Search types..."
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="p-1">
                        {filteredModelTypes.map(type => (
                          <div
                            key={type.value}
                            onClick={() => {
                              setFormData({ ...formData, model_type: type.value });
                              setIsTypeOpen(false);
                            }}
                            className="px-3 py-2 text-sm rounded cursor-pointer hover:bg-red-50 dark:hover:bg-slate-600 flex justify-between items-center text-slate-700 dark:text-slate-200"
                          >
                            {type.label}
                            {formData.model_type === type.value && <Check size={14} className="text-red-500" />}
                          </div>
                        ))}
                        {filteredModelTypes.length === 0 && (
                          <div className="px-3 py-2 text-sm text-slate-500 text-center">No matches found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Version</label>
                  <input
                    type="text"
                    required
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="1.0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Accuracy (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.accuracy}
                    onChange={(e) => setFormData({ ...formData, accuracy: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deploy to Server</label>
                  <select
                    value={formData.server_id}
                    onChange={(e) => setFormData({ ...formData, server_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Not deployed</option>
                    {servers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* File Upload Section */}
              <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex flex-col items-center justify-center text-center">
                  <Upload className="text-slate-400 mb-2" size={32} />
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Model File (.pt, .onnx)
                  </label>
                  <p className="text-xs text-slate-500 mb-4">
                    Upload your trained YOLO or ONNX model file here.
                  </p>

                  <input
                    type="file"
                    accept=".pt,.onnx,.tflite"
                    onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                    className="block w-full text-sm text-slate-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-red-50 file:text-red-700
                      hover:file:bg-red-100"
                  />

                  {selectedFile && (
                    <div className="mt-2 text-sm text-green-600 font-medium">
                      Selected: {selectedFile.name}
                    </div>
                  )}

                  {formData.model_path && !selectedFile && (
                    <div className="mt-2 text-sm text-slate-500">
                      Current file: {formData.model_path}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 dark:bg-slate-700/50 transition-colors"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>{editingModel ? 'Update Model' : 'Add Model'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
