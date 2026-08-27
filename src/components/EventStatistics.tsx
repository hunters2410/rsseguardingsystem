import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, Loader2, CalendarClock, ChevronLeft, ChevronRight, Search } from 'lucide-react';

type Stats = {
    type: string;
    daily: number; /** Last 24 hours */
    weekly: number; /** Last 7 days */
    monthly: number; /** Last 30 days */
};

export default function EventStatistics() {
    const [stats, setStats] = useState<Stats[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchStats();
        // Refresh every minute
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchStats = async () => {
        try {
            if (stats.length === 0) setLoading(true);

            const now = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);

            const { data, error } = await supabase
                .from('events')
                .select('event_type, created_at')
                .gte('created_at', thirtyDaysAgo.toISOString())
                .limit(5000);

            if (error) throw error;

            if (!data) {
                setStats([]);
                return;
            }

            const oneDayAgo = new Date();
            oneDayAgo.setDate(now.getDate() - 1);

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 7);

            const typeMap = new Map<string, Stats>();

            data.forEach(event => {
                const eventDate = new Date(event.created_at);
                const rawType = event.event_type || 'Unknown';
                const type = rawType.replace(/\s*\((?:MOVING|PARKED|ARRIVING)\)/gi, '').trim();

                if (!typeMap.has(type)) {
                    typeMap.set(type, { type, daily: 0, weekly: 0, monthly: 0 });
                }

                const stat = typeMap.get(type)!;

                stat.monthly++;

                if (eventDate >= sevenDaysAgo) {
                    stat.weekly++;
                }

                if (eventDate >= oneDayAgo) {
                    stat.daily++;
                }
            });

            // Sort by monthly count descending
            const sortedStats = Array.from(typeMap.values()).sort((a, b) => b.monthly - a.monthly);
            setStats(sortedStats);
        } catch (err) {
            console.error('Error fetching event stats:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filter & Paginate
    const filteredStats = useMemo(() => {
        if (!searchQuery.trim()) return stats;
        const q = searchQuery.toLowerCase();
        return stats.filter(s => s.type.toLowerCase().includes(q));
    }, [stats, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredStats.length / pageSize));
    const paginatedStats = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredStats.slice(start, start + pageSize);
    }, [filteredStats, currentPage, pageSize]);

    // Reset to page 1 if current page is out of bounds
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    if (loading && stats.length === 0) {
        return (
            <div className="flex items-center justify-center p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 animate-pulse">
                <Loader2 className="animate-spin text-slate-400 mr-2" />
                <span className="text-slate-500 text-sm">Loading statistics...</span>
            </div>
        );
    }

    if (stats.length === 0) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
            {/* Header & Controls */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                    <BarChart3 className="text-red-600 dark:text-red-400" size={18} />
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Detection Statistics</h3>
                    <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium px-2 py-0.5 rounded-full">
                        {filteredStats.length} types
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Search inside stats */}
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input
                            type="text"
                            placeholder="Filter item..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="pl-7 pr-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500 w-36 sm:w-44"
                        />
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        <CalendarClock size={13} className="text-slate-400" />
                        <span>Last 30 Days</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="py-2.5 px-4 font-semibold text-slate-600 dark:text-slate-400">Detected Item</th>
                            <th className="py-2.5 px-4 font-semibold text-slate-600 dark:text-slate-400 text-center w-28 bg-slate-100/50 dark:bg-slate-800/50">Daily (24h)</th>
                            <th className="py-2.5 px-4 font-semibold text-slate-600 dark:text-slate-400 text-center w-28">Weekly (7d)</th>
                            <th className="py-2.5 px-4 font-semibold text-slate-600 dark:text-slate-400 text-center w-28">Monthly (30d)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {paginatedStats.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-6 text-center text-slate-400 italic">
                                    No detection items found matching "{searchQuery}"
                                </td>
                            </tr>
                        ) : (
                            paginatedStats.map((stat) => (
                                <tr key={stat.type} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="py-2.5 px-4 font-medium capitalize text-slate-800 dark:text-slate-200">
                                        {stat.type.replace(/_/g, ' ')}
                                    </td>
                                    <td className="py-2.5 px-4 text-center bg-slate-50/50 dark:bg-slate-800/30">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${stat.daily > 0
                                                ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 border border-red-200 dark:border-red-800'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                            {stat.daily}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${stat.weekly > 0
                                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 border border-orange-200 dark:border-orange-800'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                            {stat.weekly}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${stat.monthly > 0
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                            {stat.monthly}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {filteredStats.length > 0 && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <span>
                            Showing <strong className="text-slate-700 dark:text-slate-200">{((currentPage - 1) * pageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(currentPage * pageSize, filteredStats.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredStats.length}</strong>
                        </span>

                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="ml-2 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 focus:outline-none"
                        >
                            <option value={5}>5 per page</option>
                            <option value={10}>10 per page</option>
                            <option value={20}>20 per page</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
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
                                                className={`w-6 h-6 rounded text-xs font-medium transition ${
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
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                        >
                            <span>Next</span>
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
