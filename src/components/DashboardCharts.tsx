import React from 'react';

type BarChartProps = {
    data: { label: string; value: number }[];
    color?: string;
    title: string;
};

export function SimpleBarChart({ data, color = '#3b82f6', title }: BarChartProps) {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const chartHeight = 200;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">{title}</h3>
            <div className="flex items-end justify-between h-[200px] gap-2">
                {data.map((item, index) => {
                    const height = (item.value / maxValue) * chartHeight;
                    return (
                        <div key={index} className="flex flex-col items-center flex-1 group relative">
                            <div
                                className="w-full max-w-[40px] rounded-t-lg transition-all duration-500 ease-out hover:opacity-80"
                                style={{ height: `${Math.max(height, 4)}px`, backgroundColor: color }}
                            >
                                {/* Tooltip */}
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {item.value} events
                                </div>
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 truncate w-full text-center">
                                {item.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

type PieChartProps = {
    data: { label: string; value: number; color: string }[];
    title: string;
};

export function SimplePieChart({ data, title }: PieChartProps) {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);
    let accumulatedDeg = 0;

    // If no data, show empty circle
    if (total === 0) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center h-[350px]">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
                <div className="w-48 h-48 rounded-full border-4 border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-400">
                    No Data
                </div>
            </div>
        )
    }

    const getCoordinatesForPercent = (percent: number) => {
        const x = Math.cos(2 * Math.PI * percent);
        const y = Math.sin(2 * Math.PI * percent);
        return [x, y];
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">{title}</h3>
            <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative w-48 h-48 shrink-0">
                    <svg viewBox="-1 -1 2 2" className="transform -rotate-90 w-full h-full">
                        {data.map((slice, index) => {
                            const startPercent = accumulatedDeg / total;
                            const slicePercent = slice.value / total;
                            const endPercent = startPercent + slicePercent;
                            accumulatedDeg += slice.value;

                            // If single slice is 100%
                            if (slicePercent === 1) {
                                return <circle key={index} cx="0" cy="0" r="1" fill={slice.color} />;
                            }

                            const [startX, startY] = getCoordinatesForPercent(startPercent);
                            const [endX, endY] = getCoordinatesForPercent(endPercent);
                            const largeArcFlag = slicePercent > 0.5 ? 1 : 0;

                            const pathData = [
                                `M 0 0`,
                                `L ${startX} ${startY}`,
                                `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                                `Z`
                            ].join(' ');

                            return (
                                <path
                                    key={index}
                                    d={pathData}
                                    fill={slice.color}
                                    className="hover:opacity-90 transition-opacity cursor-pointer"
                                >
                                    <title>{slice.label}: {slice.value} ({Math.round(slicePercent * 100)}%)</title>
                                </path>
                            );
                        })}
                    </svg>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-1 gap-2 w-full">
                    {data.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                                <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                            </div>
                            <span className="font-medium text-slate-900 dark:text-white">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
