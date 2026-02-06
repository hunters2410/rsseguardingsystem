import { Download, Terminal, Play, CheckCircle2, AlertTriangle, Book, Plus, Server, Camera, Copy, ExternalLink, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function Manual() {
    const steps = [
        {
            title: 'Prerequisites',
            icon: Download,
            description: 'Ensure the following software is installed before proceeding.',
            items: [
                { label: 'Node.js (v18+) - JavaScript Runtime', link: 'https://nodejs.org/' },
                { label: 'Python (3.9+) - AI Inference Engine', link: 'https://www.python.org/' },
                { label: 'Git - Version Control', link: 'https://git-scm.com/' }
            ]
        },
        {
            title: 'Installation',
            icon: Terminal,
            description: 'Clone the repository and install all dependencies for both frontend and backend.',
            code: [
                '# Clone Repository',
                'git clone <repo_url> .',
                '',
                '# Install Frontend Deps',
                'npm install',
                '',
                '# Install AI Deps',
                'pip install -r ai-server/requirements.txt'
            ]
        },
        {
            title: 'Environment Config',
            icon: CheckCircle2,
            description: 'Set up your environment variables for Supabase connection.',
            items: [
                { label: 'Create a .env file in the root directory' },
                { label: 'Add VITE_SUPABASE_URL (Project URL)' },
                { label: 'Add VITE_SUPABASE_ANON_KEY (Public Key)' },
                { label: 'Add SUPABASE_SERVICE_ROLE_KEY (Secret Key for AI)' }
            ]
        },
        {
            title: 'Media Engine',
            icon: Server,
            description: 'Start the MediaMTX server to bridge RTSP streams to WebRTC/HLS.',
            code: ['npm run stream']
        },
        {
            title: 'Launch System',
            icon: Play,
            description: 'Start the application services in separate terminals.',
            code: [
                '# Terminal 1: Frontend Interface',
                'npm run dev',
                '',
                '# Terminal 2: AI Surveillance Engine',
                'npm run ai-server'
            ]
        }
    ];

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    return (
        <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center p-3 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-2xl mb-2">
                    <Book size={32} />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">System Setup Guide</h1>
                <p className="text-slate-600 dark:text-slate-400 max-w-lg mx-auto text-lg">
                    A comprehensive guide to deploying the E-Guarding ecosystem on your local machine.
                </p>
            </div>

            {/* Timeline Steps */}
            <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-8 md:left-1/2 top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-800 -translate-x-1/2 hidden md:block" />
                <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-800 md:hidden" />

                <div className="space-y-12">
                    {steps.map((step, idx) => (
                        <div key={idx} className={`relative flex flex-col md:flex-row gap-8 ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''
                            }`}>
                            {/* Marker */}
                            <div className="absolute left-8 md:left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white dark:bg-slate-900 border-4 border-red-100 dark:border-red-900/30 flex items-center justify-center z-10 shadow-sm">
                                <div className="w-3 h-3 bg-red-600 rounded-full" />
                            </div>

                            {/* Content Card */}
                            <div className={`flex-1 pl-20 md:pl-0 ${idx % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                                <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all hover:border-red-200 dark:hover:border-red-900/50 group">
                                    <div className={`flex items-center gap-3 mb-3 ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300">
                                            <step.icon size={18} />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                                            {idx + 1}. {step.title}
                                        </h3>
                                    </div>

                                    <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 leading-relaxed">
                                        {step.description}
                                    </p>

                                    {step.items && (
                                        <ul className={`space-y-2 ${idx % 2 === 0 ? 'md:items-end flex flex-col' : ''}`}>
                                            {step.items.map((item, i) => (
                                                <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                    {idx % 2 !== 0 && <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />}
                                                    {item.link ? (
                                                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                                            {item.label} <ExternalLink size={10} />
                                                        </a>
                                                    ) : (
                                                        <span>{item.label}</span>
                                                    )}
                                                    {idx % 2 === 0 && <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {step.code && (
                                        <div className={`relative mt-4 text-left group/code max-w-full overflow-hidden rounded-xl bg-slate-950 border border-slate-800`}>
                                            <div className="absolute top-0 left-0 w-full h-8 bg-slate-900/50 flex items-center px-3 border-b border-slate-800">
                                                <div className="flex gap-1.5">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
                                                </div>
                                            </div>
                                            <div className="p-4 pt-10 font-mono text-xs text-slate-300 overflow-x-auto">
                                                {step.code.map((line, i) => (
                                                    <div key={i} className={`whitespace-pre ${line.startsWith('#') ? 'text-slate-500 italic' : ''}`}>
                                                        {line || ' '}
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(step.code?.join('\n') || '')}
                                                className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 rounded transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Empty side for layout balance */}
                            <div className="flex-1 hidden md:block" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer Alert */}
            <div className="mt-12 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600 dark:text-amber-500 shrink-0">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <h4 className="font-bold text-amber-900 dark:text-amber-400 text-sm uppercase">Security Notice</h4>
                    <p className="text-sm text-amber-800/80 dark:text-amber-500/70 mt-1">
                        Ensure your RTSP streams are protected. Do not expose the MediaMTX management port (9997) or the AI server APIs to the public internet without a reverse proxy.
                    </p>
                </div>
            </div>
        </div>
    );
}
