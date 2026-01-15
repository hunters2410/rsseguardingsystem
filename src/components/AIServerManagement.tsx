import { useEffect, useState } from 'react';
import { Server, Plus, Edit, Trash2, X, Cpu, HardDrive, Search, LayoutList, LayoutGrid } from 'lucide-react';
import { supabase, type AIServer } from '../lib/supabase';

export default function AIServerManagement() {
  const [servers, setServers] = useState<AIServer[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<AIServer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: 8080,
    gpu_model: '',
    cpu_cores: 4,
    memory_gb: 16,
  });

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    const { data } = await supabase.from('ai_servers').select('*').order('created_at', { ascending: false });
    if (data) setServers(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingServer) {
      await supabase
        .from('ai_servers')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', editingServer.id);
    } else {
      await supabase.from('ai_servers').insert([formData]);
    }

    resetForm();
    loadServers();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this AI server?')) {
      await supabase.from('ai_servers').delete().eq('id', id);
      loadServers();
    }
  };

  const handleEdit = (server: AIServer) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      ip_address: server.ip_address,
      port: server.port,
      gpu_model: server.gpu_model || '',
      cpu_cores: server.cpu_cores || 4,
      memory_gb: server.memory_gb || 16,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingServer(null);
    setFormData({
      name: '',
      ip_address: '',
      port: 8080,
      gpu_model: '',
      cpu_cores: 4,
      memory_gb: 16,
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
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">AI Server Management</h1>
          <p className="text-slate-600 mt-1">Manage AI processing servers</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search servers..."
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
            Add Server
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
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">IP Address</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Status</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Specs</th>
                  <th className="p-4 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {servers.filter(s =>
                  s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  s.ip_address.includes(searchQuery)
                ).map((server) => (
                  <tr key={server.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                      <div className="bg-green-100 p-2 rounded-lg">
                        <Server className="text-green-600" size={18} />
                      </div>
                      {server.name}
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">{server.ip_address}:{server.port}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(server.status)}`}>
                        {server.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {server.gpu_model ? `${server.gpu_model}, ` : ''}{server.cpu_cores} cores, {server.memory_gb}GB RAM
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(server)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(server.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
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
          servers.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.ip_address.includes(searchQuery)
          ).map((server) => (
            <div key={server.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <Server className="text-green-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{server.name}</h3>
                    <p className="text-sm text-slate-500">
                      {server.ip_address}:{server.port}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(server.status)}`}>
                  {server.status}
                </span>
              </div>

              <div className="space-y-3 mb-4">
                {server.gpu_model && (
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="text-slate-400" size={16} />
                    <span className="text-slate-600 dark:text-slate-400">GPU:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{server.gpu_model}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="text-slate-400" size={16} />
                  <span className="text-slate-600 dark:text-slate-400">CPU:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{server.cpu_cores} cores</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="text-slate-400" size={16} />
                  <span className="text-slate-600 dark:text-slate-400">RAM:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{server.memory_gb} GB</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(server)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <Edit size={16} />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(server.id)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )))}
      </div>

      {
        servers.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Server className="mx-auto text-slate-400 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No AI Servers Yet</h3>
            <p className="text-slate-600 mb-4">Add your first AI processing server to start analyzing video streams</p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus size={20} />
              Add First Server
            </button>
          </div>
        )
      }

      {
        showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {editingServer ? 'Edit AI Server' : 'Add New AI Server'}
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Server Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="AI Server 01"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">IP Address</label>
                    <input
                      type="text"
                      required
                      value={formData.ip_address}
                      onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                      placeholder="192.168.1.100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="65535"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">GPU Model</label>
                  <input
                    type="text"
                    value={formData.gpu_model}
                    onChange={(e) => setFormData({ ...formData, gpu_model: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="NVIDIA RTX 4090"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">CPU Cores</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.cpu_cores}
                      onChange={(e) => setFormData({ ...formData, cpu_cores: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Memory (GB)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.memory_gb}
                      onChange={(e) => setFormData({ ...formData, memory_gb: parseInt(e.target.value) })}
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
                    {editingServer ? 'Update Server' : 'Add Server'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </div >
  );
}
