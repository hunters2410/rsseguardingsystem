import { useEffect, useState } from 'react';
import { Camera, Plus, Edit, Trash2, Video, VideoOff, X, Brain, Search, LayoutList, LayoutGrid } from 'lucide-react';
import CameraModelAssignment from './CameraModelAssignment';
import { supabase, type Camera as CameraType } from '../lib/supabase';

export default function CameraManagement() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showModal, setShowModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null);
  const [activeConfigCamera, setActiveConfigCamera] = useState<CameraType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    brand: '',
    connection_type: 'rtsp',
    stream_url: '',
    username: '',
    password: '',
    resolution: '1920x1080',
    fps: 25,
    status: 'online',
  });

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    const { data } = await supabase.from('cameras').select('*').order('created_at', { ascending: false });
    if (data) setCameras(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingCamera) {
      await supabase
        .from('cameras')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', editingCamera.id);
    } else {
      await supabase.from('cameras').insert([formData]);
    }

    resetForm();
    loadCameras();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      await supabase.from('cameras').delete().eq('id', id);
      loadCameras();
    }
  };

  const handleEdit = (camera: CameraType) => {
    setEditingCamera(camera);
    setFormData({
      name: camera.name,
      location: camera.location,
      brand: camera.brand,
      connection_type: camera.connection_type,
      stream_url: camera.stream_url,
      username: camera.username || '',
      password: camera.password || '',
      resolution: camera.resolution || '1920x1080',
      fps: camera.fps || 25,
      status: camera.status || 'online',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingCamera(null);
    setFormData({
      name: '',
      location: '',
      brand: '',
      connection_type: 'rtsp',
      stream_url: '',
      username: '',
      password: '',
      resolution: '1920x1080',
      fps: 25,
      status: 'online',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'offline':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Camera Management</h1>
          <p className="text-slate-600 mt-1">Manage all CCTV camera channels</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search cameras..."
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
            Add Camera
          </button>
        </div>
      </div>

      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6" : "space-y-4"}>
        {viewMode === 'list' ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Name</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Location</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Brand</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Status</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Recording</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {cameras.filter(c =>
                  c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  c.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  c.brand.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((camera) => (
                  <tr key={camera.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Camera className="text-blue-600" size={18} />
                      </div>
                      {camera.name}
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">{camera.location}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">{camera.brand}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(camera.status)}`}>
                        {camera.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1">
                        {camera.is_recording ? (
                          <Video className="text-red-600" size={16} />
                        ) : (
                          <VideoOff className="text-slate-400" size={16} />
                        )}
                        <span className={`text-sm ${camera.is_recording ? 'text-red-600' : 'text-slate-400'}`}>
                          {camera.is_recording ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button onClick={() => setActiveConfigCamera(camera)} className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100" title="AI Configuration">
                          <Brain size={16} />
                        </button>
                        <button onClick={() => handleEdit(camera)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(camera.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
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
          cameras.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.brand.toLowerCase().includes(searchQuery.toLowerCase())
          ).map((camera) => (
            <div key={camera.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Camera className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{camera.name}</h3>
                    <p className="text-sm text-slate-500">{camera.location}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(camera.status)}`}>
                  {camera.status}
                </span>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Brand:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{camera.brand}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Type:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{camera.connection_type.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Resolution:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{camera.resolution}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Recording:</span>
                  <span className="flex items-center gap-1">
                    {camera.is_recording ? (
                      <Video className="text-red-600" size={16} />
                    ) : (
                      <VideoOff className="text-slate-400" size={16} />
                    )}
                    <span className={camera.is_recording ? 'text-red-600' : 'text-slate-400'}>
                      {camera.is_recording ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveConfigCamera(camera)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                  title="AI Configuration"
                >
                  <Brain size={16} />
                </button>
                <button
                  onClick={() => handleEdit(camera)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <Edit size={16} />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(camera.id)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )))}
      </div>

      {cameras.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Camera className="mx-auto text-slate-400 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Cameras Yet</h3>
          <p className="text-slate-600 mb-4">Get started by adding your first CCTV camera</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add First Camera
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {editingCamera ? 'Edit Camera' : 'Add New Camera'}
              </h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Camera Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="Front Gate Camera"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="Building A - Entrance"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    required
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="Hikvision, Dahua, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Connection Type</label>
                  <select
                    value={formData.connection_type}
                    onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="rtsp">RTSP</option>
                    <option value="http">HTTP</option>
                    <option value="4g">4G Camera</option>
                    <option value="onvif">ONVIF</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stream URL</label>
                <input
                  type="text"
                  required
                  value={formData.stream_url}
                  onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="rtsp://192.168.1.100:554/stream1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  * For browser streaming, use an HLS or HTTP-FLV URL (e.g., http://localhost:8888/cam1).
                  Raw RTSP links will not play directly in browsers.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="admin"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Resolution</label>
                  <select
                    value={formData.resolution}
                    onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="1920x1080">1920x1080 (Full HD)</option>
                    <option value="1280x720">1280x720 (HD)</option>
                    <option value="2560x1440">2560x1440 (2K)</option>
                    <option value="3840x2160">3840x2160 (4K)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">FPS</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={formData.fps}
                    onChange={(e) => setFormData({ ...formData, fps: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 dark:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  {editingCamera ? 'Update Camera' : 'Add Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeConfigCamera && (
        <CameraModelAssignment
          camera={activeConfigCamera}
          onClose={() => setActiveConfigCamera(null)}
        />
      )}
    </div>
  );
}
