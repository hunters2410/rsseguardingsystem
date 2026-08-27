import { useEffect, useState, useRef, useMemo } from 'react';
import { Brain, Plus, Edit, Trash2, X, Power, Activity, Upload, FileCode, Search, ChevronDown, Check, RefreshCw, Play, LayoutList, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase, type AIModel, type AIServer, type Dataset } from '../lib/supabase';

const MODEL_TYPES = [
  // Person & Behaviour
  { value: 'person_detection',         label: 'Person Detection',          category: 'Person & Behaviour' },
  { value: 'loitering_detection',      label: 'Loitering Detection',       category: 'Person & Behaviour' },
  { value: 'crowd_detection',          label: 'Crowd Detection',           category: 'Person & Behaviour' },
  { value: 'fight_detection',          label: 'Fight / Aggression',        category: 'Person & Behaviour' },
  { value: 'fall_detection',           label: 'Fall Detection',            category: 'Person & Behaviour' },
  { value: 'running_detection',        label: 'Running Detection',         category: 'Person & Behaviour' },
  { value: 'tailgating_detection',     label: 'Tailgating Detection',      category: 'Person & Behaviour' },
  { value: 'intrusion_detection',      label: 'Intrusion / Zone Breach',   category: 'Person & Behaviour' },
  // Threat
  { value: 'weapon_detection',         label: 'Weapon Detection',          category: 'Threat' },
  { value: 'fire_detection',           label: 'Fire & Smoke Detection',    category: 'Threat' },
  { value: 'smoke_detection',          label: 'Smoke Detection',           category: 'Threat' },
  { value: 'vandalism_detection',      label: 'Vandalism Detection',       category: 'Threat' },
  // Vehicle
  { value: 'vehicle_detection',        label: 'Vehicle Detection',         category: 'Vehicle' },
  { value: 'license_plate_detection',  label: 'License Plate Recognition', category: 'Vehicle' },
  { value: 'wrong_way_detection',      label: 'Wrong-Way Detection',       category: 'Vehicle' },
  { value: 'illegal_parking_detection',label: 'Illegal Parking',           category: 'Vehicle' },
  { value: 'vehicle_speed_detection',  label: 'Vehicle Speed Detection',   category: 'Vehicle' },
  // Object
  { value: 'abandoned_object_detection',label: 'Abandoned Object',         category: 'Object Intelligence' },
  { value: 'missing_object_detection', label: 'Missing Object',            category: 'Object Intelligence' },
  { value: 'ppe_detection',            label: 'PPE Compliance (Hard Hat)', category: 'Object Intelligence' },
  // Face
  { value: 'face_detection',           label: 'Face Detection',            category: 'Face Intelligence' },
  { value: 'unknown_face_detection',   label: 'Unknown Face Alert',        category: 'Face Intelligence' },
  { value: 'mask_detection',           label: 'Mask Detection',            category: 'Face Intelligence' },
  { value: 'face_recognition',         label: 'Face Recognition',          category: 'Face Intelligence' },
  // Environmental
  { value: 'camera_tamper_detection',  label: 'Camera Tamper Detection',   category: 'Environmental' },
  { value: 'flood_detection',          label: 'Flood Detection',           category: 'Environmental' },
  { value: 'motion_detection',         label: 'Motion Detection',          category: 'Environmental' },
  // General
  { value: 'dress_code_detection',     label: 'Dress Code / Appearance',   category: 'General' },
  { value: 'object_tracking',          label: 'Object Tracking',           category: 'General' },
  { value: 'animal_detection',         label: 'Animal Intrusion',          category: 'General' },
  { value: 'other',                    label: 'Other / Custom',            category: 'General' },
];

// Hardware badge colours
const HW_BADGE: Record<string, string> = {
  cpu:              'bg-emerald-100 text-emerald-700',
  gpu_recommended:  'bg-amber-100  text-amber-700',
  gpu_required:     'bg-red-100    text-red-700',
};

const PRETRAINED_MODELS = [
  // ── Person & Behaviour ───────────────────────────────────────────────────────
  { id: 'yolo_n',       name: 'YOLOv8 Nano — Person (Fast)',       type: 'person_detection',          description: 'Real-time on CPU. Best for edge devices.',                   accuracy: 80,  version: '8.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  { id: 'yolo_s',       name: 'YOLOv8 Small — Person (Balanced)',  type: 'person_detection',          description: 'Good balance of speed and accuracy.',                        accuracy: 88,  version: '8.0', path: 'yolov8s.pt',                   hw: 'cpu',             size: '22 MB' },
  { id: 'yolo_m',       name: 'YOLOv8 Medium — Person (Accurate)', type: 'person_detection',          description: 'High accuracy for critical surveillance.',                    accuracy: 94,  version: '8.0', path: 'yolov8m.pt',                   hw: 'gpu_recommended', size: '52 MB' },
  { id: 'yolo_x',       name: 'YOLOv8 X-Large — Maximum Accuracy', type: 'person_detection',          description: 'Maximum accuracy. Requires dedicated GPU.',                  accuracy: 99,  version: '8.0', path: 'yolov8x.pt',                   hw: 'gpu_required',    size: '131 MB'},
  { id: 'loiter',       name: 'Loitering Detection',               type: 'loitering_detection',       description: 'Alert when person stays in zone. Set dwell:30 in description (seconds).', accuracy: 90, version: '1.0', path: 'yolov8n.pt',    hw: 'cpu',             size: '6 MB'  },
  { id: 'crowd',        name: 'Crowd Detection',                   type: 'crowd_detection',           description: 'Alert when crowd exceeds threshold. Set threshold:8 in description.',    accuracy: 90, version: '1.0', path: 'yolov8n.pt',    hw: 'cpu',             size: '6 MB'  },
  { id: 'fight',        name: 'Fight / Aggression Detection',      type: 'fight_detection',           description: 'Detects overlapping persons indicating a fight.',            accuracy: 82,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  { id: 'fall',         name: 'Fall Detection',                    type: 'fall_detection',            description: 'Detects horizontal bounding box — person has fallen.',       accuracy: 85,  version: '1.0', path: 'yolov8n-pose.pt',              hw: 'cpu',             size: '6 MB'  },
  { id: 'pose',         name: 'Human Pose Estimation',             type: 'person_detection',          description: 'Full skeletal tracking — 17 keypoints per person.',          accuracy: 92,  version: '8.0', path: 'yolov8n-pose.pt',              hw: 'cpu',             size: '6 MB'  },
  { id: 'intrusion',    name: 'Intrusion / Zone Breach',           type: 'intrusion_detection',       description: 'Alerts when any person or vehicle enters a defined zone.',   accuracy: 91,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  // ── Threat ──────────────────────────────────────────────────────────────────
  { id: 'weapon',       name: 'Weapon Detection',                  type: 'weapon_detection',          description: 'Gun, knife, bat detection. Real specialized weights.',       accuracy: 85,  version: '1.0', path: 'weapon_detection.pt',          hw: 'gpu_recommended', size: '6 MB'  },
  { id: 'fire',         name: 'Fire & Smoke Detection',            type: 'fire_detection',            description: 'Real fire/smoke trained model from HuggingFace.',           accuracy: 88,  version: '1.0', path: 'fire_detection.pt',            hw: 'cpu',             size: '6 MB'  },
  { id: 'vandal',       name: 'Vandalism Detection',               type: 'vandalism_detection',       description: 'Sudden scene change + person presence heuristic.',          accuracy: 75,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  // ── Vehicle ─────────────────────────────────────────────────────────────────
  { id: 'vehicle',      name: 'Vehicle Detection',                 type: 'vehicle_detection',         description: 'Car, truck, bus, motorcycle detection.',                    accuracy: 90,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  { id: 'lpr',          name: 'License Plate Recognition',         type: 'license_plate_detection',   description: 'Detects plates + reads text via PaddleOCR.',                accuracy: 92,  version: '1.0', path: 'license_plate_detection.pt',   hw: 'cpu',             size: '6 MB'  },
  { id: 'parking',      name: 'Illegal Parking Detection',         type: 'illegal_parking_detection', description: 'Vehicle stationary in zone. Set minutes:5 in description.', accuracy: 88,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  // ── Object Intelligence ──────────────────────────────────────────────────────
  { id: 'abandoned',    name: 'Abandoned Object Detection',        type: 'abandoned_object_detection',description: 'Object left alone. Set timer:2 (minutes) in description.',  accuracy: 83,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  { id: 'ppe',          name: 'PPE Compliance (Hard Hat / Vest)',  type: 'ppe_detection',             description: 'Detects missing safety PPE. Real trained weights.',          accuracy: 86,  version: '1.0', path: 'ppe_detection.pt',             hw: 'cpu',             size: '6 MB'  },
  // ── Face Intelligence ────────────────────────────────────────────────────────
  { id: 'face',         name: 'Face Detection',                    type: 'face_detection',            description: 'Real face bounding box detection (not person class filter).', accuracy: 88, version: '1.0', path: 'face_detection.pt',            hw: 'cpu',             size: '6 MB'  },
  { id: 'unknown_face', name: 'Unknown Face Alert',                type: 'unknown_face_detection',    description: 'Alerts on faces not in authorized library.',                accuracy: 84,  version: '1.0', path: 'face_detection.pt',            hw: 'gpu_recommended', size: '6 MB'  },
  // ── Environmental ────────────────────────────────────────────────────────────
  { id: 'tamper',       name: 'Camera Tamper Detection',           type: 'camera_tamper_detection',   description: 'Detects camera blocked, sprayed, or moved. No GPU needed.',  accuracy: 95,  version: '1.0', path: '',                             hw: 'cpu',             size: '0 MB'  },
  { id: 'animal',       name: 'Animal Intrusion Detection',        type: 'animal_detection',          description: 'Detects dogs, cats, birds, horses intruding.',              accuracy: 87,  version: '1.0', path: 'yolov8n.pt',                   hw: 'cpu',             size: '6 MB'  },
  { id: 'dresscode',    name: 'Dress Code / Appearance',           type: 'dress_code_detection',      description: 'HSV color analysis. Set required:blue,prohibited:red.',     accuracy: 78,  version: '1.0', path: 'yolov8n-seg.pt',               hw: 'cpu',             size: '6 MB'  },
];


export default function AIModelManagement() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [servers, setServers] = useState<AIServer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  // Bulk select
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Retrain State
  const [showRetrainModal, setShowRetrainModal] = useState(false);
  const [retrainModel, setRetrainModel] = useState<AIModel | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [retrainDatasetId, setRetrainDatasetId] = useState('');
  const [retrainServerId, setRetrainServerId] = useState('');
  const [retrainEpochs, setRetrainEpochs] = useState(100);

  // Advanced Retrain Options
  const [retrainMethod, setRetrainMethod] = useState<'existing' | 'upload'>('existing');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newDatasetFile, setNewDatasetFile] = useState<File | null>(null);
  const [advancedOptions, setAdvancedOptions] = useState(false);
  const [batchSize, setBatchSize] = useState(16);
  const [learningRate, setLearningRate] = useState(0.001);

  // Searchable Select State
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  // Pretrained Model Search State
  const [isPretrainedOpen, setIsPretrainedOpen] = useState(false);
  const [pretrainedSearch, setPretrainedSearch] = useState('');
  const pretrainedDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model_type: 'person_detection',
    version: '1.0',
    accuracy: 95.0,
    server_id: '',
    model_path: '',
    smart_reporting: true, // Auto-enable by default
  });

  useEffect(() => {
    loadModels();
    loadServers();
    loadDatasets();

    // Click outside to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeOpen(false);
      }
      if (pretrainedDropdownRef.current && !pretrainedDropdownRef.current.contains(event.target as Node)) {
        setIsPretrainedOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadModels = async () => {
    const { data } = await supabase.from('ai_models').select('*').order('created_at', { ascending: false });
    if (data) { setModels(data); setSelectedIds(new Set()); }
  };

  const loadServers = async () => {
    const { data } = await supabase.from('ai_servers').select('*').order('name');
    if (data) setServers(data);
  };

  const loadDatasets = async () => {
    const { data } = await supabase.from('datasets').select('*').order('name');
    if (data) setDatasets(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let uploadedPath = formData.model_path;

    if (selectedFile) {
      setUploading(true);
      try {

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
      smart_reporting: formData.smart_reporting,
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
      smart_reporting: model.smart_reporting || false,
    });
    setSelectedFile(null);
    setShowModal(true);
  };

  const openRetrainModal = (model: AIModel) => {
    setRetrainModel(model);
    setRetrainDatasetId('');
    setRetrainServerId(model.server_id || ''); // Default to current server if assigned
    setRetrainEpochs(100);
    setRetrainMethod('existing');
    setAdvancedOptions(false);
    setNewDatasetName(`${model.name} - Improvement v${(parseFloat(model.version) + 0.1).toFixed(1)}`);
    setNewDatasetFile(null);
    setBatchSize(16);
    setLearningRate(0.001);
    setShowRetrainModal(true);
  };

  const handleStartRetraining = async () => {
    if (!retrainModel || !retrainServerId) return;

    let finalDatasetId = retrainDatasetId;

    // Handle File Upload if selected
    if (retrainMethod === 'upload' && newDatasetFile) {
      setUploading(true);
      try {
        const fileName = `retrain_${Date.now()}_${newDatasetFile.name}`;
        const { error: uploadError } = await supabase.storage.from('datasets').upload(fileName, newDatasetFile);
        if (uploadError) throw uploadError;

        const { data: dsData, error: dbError } = await supabase.from('datasets').insert({
          name: newDatasetName || `${retrainModel.name} Improvement`,
          description: `Incremental training data for ${retrainModel.name}`,
          format: 'yolo_zip', // Default
          storage_path: fileName,
          image_count: 0
        }).select().single();

        if (dbError) throw dbError;
        if (dsData) finalDatasetId = dsData.id;

      } catch (error) {
        console.error("Error upload dataset:", error);
        alert("Failed to upload improvement dataset.");
        setUploading(false);
        return;
      }
      setUploading(false);
    } else {
      if (!retrainDatasetId) return; // Must satisfy check if using existing
    }


    await supabase.from('training_jobs').insert({
      dataset_id: finalDatasetId,
      server_id: retrainServerId,
      epochs: retrainEpochs,
      status: 'pending',
      // Store advanced params in metadata/config if schema allows, otherwise just logging for now or custom columns
      // For this demo, we assume standard schema but improving the "User Feel"
      configuration: {
        base_model_id: retrainModel.id,
        batch_size: batchSize,
        learning_rate: learningRate,
        strategy: 'fine_tune'
      }
    });

    alert(`Improvement Job Started for ${retrainModel.name}!\n\nUsing Dataset: ${retrainMethod === 'upload' ? 'New Upload' : 'Existing Library'}\nEpochs: ${retrainEpochs}\nLearning Rate: ${learningRate}`);
    setShowRetrainModal(false);
    setRetrainModel(null);
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
      smart_reporting: true,
    });
    setPretrainedSearch('');
  };

  // ── Bulk helpers & Pagination ───────────────────────────────────────────────
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const filteredModels = useMemo(() => {
    return models.filter(m =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.model_type.includes(searchQuery.toLowerCase())
    );
  }, [models, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / pageSize));
  const paginatedModels = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredModels.slice(start, start + pageSize);
  }, [filteredModels, currentPage, pageSize]);

  const allSelected = filteredModels.length > 0 && filteredModels.every(m => selectedIds.has(m.id));
  const toggleSelect    = (id: string) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(filteredModels.map(m => m.id)));
  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} model(s)? Their storage files will also be removed.`)) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedIds];
      // Remove storage files
      const paths = models.filter(m => ids.includes(m.id) && m.model_path).map(m => m.model_path!);
      if (paths.length) await supabase.storage.from('ai-models').remove(paths);
      // Remove camera_models assignments
      await supabase.from('camera_models').delete().in('ai_model_id', ids);
      // Delete models
      await supabase.from('ai_models').delete().in('id', ids);
      setSelectedIds(new Set());
      await loadModels();
    } catch (err: any) { alert(`Bulk delete failed: ${err.message}`); }
    finally { setBulkDeleting(false); }
  };

  const getModelTypeColor = (type: string) => {
    switch (type) {
      case 'person_detection': return 'bg-blue-100 text-blue-700';
      case 'vehicle_detection': return 'bg-green-100 text-green-700';
      case 'face_recognition': return 'bg-purple-100 text-purple-700';
      case 'motion_detection': return 'bg-orange-100 text-orange-700';
      case 'weapon_detection': return 'bg-red-100 text-red-700';
      case 'fire_detection': return 'bg-red-100 text-red-700';
      case 'animal_detection': return 'bg-amber-100 text-amber-700';
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
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search models..."
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
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Model
          </button>
        </div>
      </div>

      {/* ── Bulk Action Toolbar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-950/40
                        border border-red-200 dark:border-red-800 rounded-xl
                        animate-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            {selectedIds.size} model{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400
                       bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                       rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            Clear
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white
                       bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-all
                       shadow-sm shadow-red-600/20 active:scale-95"
          >
            {bulkDeleting
              ? <><RefreshCw size={13} className="animate-spin" /> Deleting…</>
              : <><Trash2 size={13} /> Delete {selectedIds.size}</>}
          </button>
        </div>
      )}

      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6" : "space-y-4"}>
        {viewMode === 'list' ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4 w-10 border border-slate-200 dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                      title={allSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Name</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Version</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Type</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Accuracy</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Status</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {paginatedModels.map((model) => {
                  const isSelected = selectedIds.has(model.id);
                  return (
                  <tr key={model.id} className={`transition-colors ${
                    isSelected ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}>
                    <td className="p-4 border border-slate-100 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(model.id)}
                        className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                      />
                    </td>
                    <td className="p-4 font-medium text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="bg-purple-100 p-2 rounded-lg">
                          <Brain className="text-purple-600" size={18} />
                        </div>
                        {model.name}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">v{model.version}</td>
                    <td className="p-4 border border-slate-100 dark:border-slate-700">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getModelTypeColor(model.model_type)}`}>
                        {MODEL_TYPES.find(t => t.value === model.model_type)?.label || model.model_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700">{model.accuracy}%</td>
                    <td className="p-4 border border-slate-100 dark:border-slate-700">
                      <button
                        onClick={() => toggleModelStatus(model)}
                        title={model.is_active ? 'Click to Deactivate' : 'Click to Activate'}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                          model.is_active
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        <Activity size={14} className={model.is_active ? 'text-green-500' : 'text-slate-400'} />
                        {model.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="p-4 border border-slate-100 dark:border-slate-700">
                      <div className="flex gap-2">
                        <button onClick={() => openRetrainModal(model)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="Retrain">
                          <RefreshCw size={16} />
                        </button>
                        <button onClick={() => handleEdit(model)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(model.id, model.model_path)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          paginatedModels.map((model) => (
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
                  onClick={() => openRetrainModal(model)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  title="Retrain / Improve Model"
                >
                  <RefreshCw size={16} />
                </button>
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
          ))
        )}
      </div>

      {/* ── AI Model Pagination Controls ── */}
      {filteredModels.length > 0 && (
        <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>
              Showing <strong className="text-slate-700 dark:text-slate-200">{((currentPage - 1) * pageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(currentPage * pageSize, filteredModels.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredModels.length}</strong> models
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value={6}>6 per page</option>
              <option value={9}>9 per page</option>
              <option value={18}>18 per page</option>
              <option value={36}>36 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <ChevronLeft size={13} />
              <span>Prev</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => {
                  const prevP = arr[idx - 1];
                  const hasGap = prevP && p - prevP > 1;
                  return (
                    <div key={p} className="flex items-center">
                      {hasGap && <span className="px-1 text-slate-400">...</span>}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`w-6 h-6 rounded-md text-xs font-medium transition ${
                          currentPage === p
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {p}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

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

              {!editingModel && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-4">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Start with a Pre-trained Model (Optional)
                  </label>
                  <div ref={pretrainedDropdownRef} className="relative">

                    <button
                      type="button"
                      onClick={() => setIsPretrainedOpen(!isPretrainedOpen)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-700 text-left flex justify-between items-center focus:ring-2 focus:ring-red-500 dark:text-white"
                    >
                      <span className="truncate text-slate-600 dark:text-slate-300">
                        Select a Pre-trained Model Template...
                      </span>
                      <ChevronDown size={16} />
                    </button>

                    {isPretrainedOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        <div className="sticky top-0 p-2 bg-white dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                          <div className="flex items-center px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                            <Search size={14} className="text-slate-400 mr-2" />
                            <input
                              type="text"
                              value={pretrainedSearch}
                              onChange={(e) => setPretrainedSearch(e.target.value)}
                              className="bg-transparent border-none focus:ring-0 text-sm w-full dark:text-white"
                              placeholder="Search templates..."
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="p-1">
                          {PRETRAINED_MODELS.filter(m =>
                            m.name.toLowerCase().includes(pretrainedSearch.toLowerCase()) ||
                            m.type.toLowerCase().includes(pretrainedSearch.toLowerCase()) ||
                            m.description.toLowerCase().includes(pretrainedSearch.toLowerCase())
                          ).map(model => (
                            <div
                              key={model.id}
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  name: model.name,
                                  description: model.description,
                                  model_type: model.type,
                                  version: model.version,
                                  accuracy: model.accuracy,
                                  model_path: model.path,
                                });
                                setTypeSearch('');
                                setSelectedFile(null);
                                setIsPretrainedOpen(false);
                              }}
                              className="px-3 py-2.5 text-sm rounded cursor-pointer hover:bg-red-50 dark:hover:bg-slate-600 border-b border-slate-50 dark:border-slate-700 last:border-0"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-medium text-slate-900 dark:text-white text-sm leading-tight">{model.name}</div>
                                <div className="flex gap-1 shrink-0">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${HW_BADGE[model.hw] || 'bg-slate-100 text-slate-600'}`}>
                                    {model.hw === 'cpu' ? 'CPU' : model.hw === 'gpu_recommended' ? 'GPU+' : 'GPU'}
                                  </span>
                                  {model.size !== '0 MB' && (
                                    <span className="text-[10px] font-medium text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">{model.size}</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{model.description}</div>
                              <div className="text-[10px] font-semibold text-green-600 dark:text-green-400 mt-1">{model.accuracy}% accuracy</div>
                            </div>
                          ))}
                          {PRETRAINED_MODELS.filter(m =>
                            m.name.toLowerCase().includes(pretrainedSearch.toLowerCase()) ||
                            m.type.toLowerCase().includes(pretrainedSearch.toLowerCase())
                          ).length === 0 && (
                              <div className="px-3 py-4 text-sm text-slate-500 text-center">No matching models found</div>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

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

              {/* Smart Reporting Toggle */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                    <Brain size={16} />
                    Smart Event Reporting
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Enable context-aware analysis to reduce false positives and provide detailed incident descriptions.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.smart_reporting}
                    onChange={(e) => setFormData({ ...formData, smart_reporting: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                </label>
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

      {showRetrainModal && retrainModel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="text-blue-600" /> Retrain Model
              </h2>
              <button onClick={() => setShowRetrainModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Improve <b>{retrainModel.name}</b> by training it on a new or expanded dataset.
            </p>

            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg space-y-4">
                <div className="flex gap-2 mb-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                  <button
                    onClick={() => setRetrainMethod('existing')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${retrainMethod === 'existing' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    Use Existing Dataset
                  </button>
                  <button
                    onClick={() => setRetrainMethod('upload')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${retrainMethod === 'upload' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    Upload New Data
                  </button>
                </div>

                {retrainMethod === 'existing' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Dataset</label>
                    <select
                      className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                      value={retrainDatasetId}
                      onChange={(e) => setRetrainDatasetId(e.target.value)}
                    >
                      <option value="">-- Choose Dataset --</option>
                      {datasets.map(ds => (
                        <option key={ds.id} value={ds.id}>{ds.name} ({ds.format})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dataset Name</label>
                      <input
                        type="text"
                        value={newDatasetName}
                        onChange={(e) => setNewDatasetName(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        placeholder="e.g. Construction Site Images v2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload Images (.zip)</label>
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setNewDatasetFile(e.target.files ? e.target.files[0] : null)}
                        className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-600 dark:file:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Processing Server</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  value={retrainServerId}
                  onChange={(e) => setRetrainServerId(e.target.value)}
                >
                  <option value="">-- Choose Server --</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Epochs</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  value={retrainEpochs}
                  onChange={(e) => setRetrainEpochs(parseInt(e.target.value))}
                  min="1"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setAdvancedOptions(!advancedOptions)}
                  className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-700"
                >
                  <Activity size={16} />
                  {advancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
                </button>

                {advancedOptions && (
                  <div className="mt-3 grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Batch Size</label>
                      <select
                        value={batchSize}
                        onChange={(e) => setBatchSize(parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-sm border rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                      >
                        <option value="8">8 (Low VRAM)</option>
                        <option value="16">16 (Standard)</option>
                        <option value="32">32 (High Performance)</option>
                        <option value="64">64 (Multi-GPU)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Learning Rate</label>
                      <select
                        value={learningRate}
                        onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                        className="w-full px-2 py-1 text-sm border rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                      >
                        <option value="0.01">0.01 (Fast)</option>
                        <option value="0.001">0.001 (Data-to-Model Balance)</option>
                        <option value="0.0001">0.0001 (Fine-Tuning)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowRetrainModal(false)}
                  className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartRetraining}
                  disabled={!retrainServerId || (retrainMethod === 'existing' && !retrainDatasetId) || (retrainMethod === 'upload' && !newDatasetFile) || uploading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading & Starting...
                    </>
                  ) : (
                    <><Play size={16} /> Start Improvement</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
