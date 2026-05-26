import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Car, Search, RefreshCw, Calendar, Clock, MapPin, Trash2 } from 'lucide-react';

type NumberPlate = {
  id: string;
  plate_text: string;
  camera_id: string;
  confidence: number;
  snapshot_url: string;
  created_at: string;
  cameras?: { name: string };
};

export default function NumberPlatesLog() {
  const [plates, setPlates] = useState<NumberPlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const fetchPlates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('number_plates')
        .select(`
          *,
          cameras ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPlates(data || []);
    } catch (err) {
      console.error('Error fetching number plates:', err);
    } finally {
      setLoading(false);
    }
  };

  const deletePlate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this plate record?')) return;
    
    try {
      const { error } = await supabase
        .from('number_plates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setPlates(plates.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting plate:', err);
      alert('Failed to delete plate record.');
    }
  };

  useEffect(() => {
    fetchPlates();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('public:number_plates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'number_plates' },
        () => {
          fetchPlates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredPlates = plates.filter(p => 
    p.plate_text.toLowerCase().includes(search.toLowerCase()) ||
    p.cameras?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-outfit text-slate-900 dark:text-white flex items-center gap-2">
            <Car className="text-indigo-600" />
            License Plate Logs
          </h1>
          <p className="text-slate-500 dark:text-slate-400">View and track historical OCR plate extractions.</p>
        </div>
        
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search plates..."
              className="pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchPlates}
            className="p-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw size={20} className={`text-slate-600 dark:text-slate-300 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <th className="p-4 font-semibold">Plate Number</th>
                <th className="p-4 font-semibold">Time & Date</th>
                <th className="p-4 font-semibold">Location</th>
                <th className="p-4 font-semibold">Snapshot</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No license plates recorded yet.
                  </td>
                </tr>
              ) : (
                filteredPlates.map((plate) => (
                  <tr key={plate.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition">
                    <td className="p-4">
                      <div className="inline-block px-3 py-1 bg-yellow-400 text-black font-mono font-bold rounded shadow-sm border border-yellow-500 text-lg tracking-wider">
                        {plate.plate_text}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Calendar size={14} className="text-slate-400" />
                        {new Date(plate.created_at).toLocaleDateString()}
                        <span className="mx-1 text-slate-300">|</span>
                        <Clock size={14} className="text-slate-400" />
                        {new Date(plate.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <MapPin size={16} className="text-indigo-400" />
                        {plate.cameras?.name || 'Unknown Camera'}
                      </div>
                    </td>
                    <td className="p-4 pl-0 pr-4">
                      {plate.snapshot_url ? (
                        <div className="w-32 h-20 rounded shadow overflow-hidden relative group">
                          <img 
                            src={plate.snapshot_url} 
                            alt={`Plate ${plate.plate_text}`}
                            className="w-full h-full object-cover transform group-hover:scale-110 transition duration-300"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 italic">No image</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => deletePlate(plate.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete record"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
