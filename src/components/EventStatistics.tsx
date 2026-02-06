import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, Loader2, CalendarClock } from 'lucide-react';

type Stats = {
    type: string;
    daily: number; /** Last 24 hours */
    weekly: number; /** Last 7 days */
    monthly: number; /** Last 30 days */
};

export default function EventStatistics() {
    const [stats, setStats] = useState<Stats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        // Refresh every minute
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchStats = async () => {
        try {
            // Don't set loading on subsequent refreshes to avoid flickering
            if (stats.length === 0) setLoading(true);

            const now = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);

            // We only need event_type and created_at for aggregation
            // Limit to 5000 to prevent performance issues, though ideally we'd use a server-side count
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
                const type = event.event_type;

                if (!typeMap.has(type)) {
                    typeMap.set(type, { type, daily: 0, weekly: 0, monthly: 0 });
                }

                const stat = typeMap.get(type)!;

                stat.monthly++; // Already filtered to 30 days by query

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
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                    <BarChart3 className="text-red-600" size={20} />
                    <h3 className="font-semibold text-slate-900 dark:text-white">Detection Statistics</h3>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                    <CalendarClock size={14} />
                    <span>Last 30 Days</span>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="p-4 font-medium text-slate-600 dark:text-slate-400">Detected Item</th>
                            <th className="p-4 font-medium text-slate-600 dark:text-slate-400 text-center w-32 bg-slate-100/50 dark:bg-slate-800/50">Daily (24h)</th>
                            <th className="p-4 font-medium text-slate-600 dark:text-slate-400 text-center w-32">Weekly (7d)</th>
                            <th className="p-4 font-medium text-slate-600 dark:text-slate-400 text-center w-32">Monthly (30d)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {stats.map((stat) => (
                            <tr key={stat.type} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="p-4 font-medium capitalize text-slate-800 dark:text-slate-200">
                                    {stat.type.replace(/_/g, ' ')}
                                </td>
                                <td className="p-4 text-center bg-slate-50/50 dark:bg-slate-800/30">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stat.daily > 0
                                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                        {stat.daily}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stat.weekly > 0
                                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                        {stat.weekly}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stat.monthly > 0
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                        {stat.monthly}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
