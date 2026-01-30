
import { Download, Terminal, Play, CheckCircle2, AlertTriangle, Book, Plus, Server, Camera } from 'lucide-react';

export default function Manual() {
    const steps = [
        {
            title: 'Prerequisites',
            icon: Download,
            description: 'Ensure you have the following software installed on your machine.',
            items: [
                { label: 'Node.js (v18+)', link: 'https://nodejs.org/' },
                { label: 'Python (3.9+)', link: 'https://www.python.org/' },
                { label: 'Git', link: 'https://git-scm.com/' }
            ]
        },
        {
            title: '1. Clone & Install',
            icon: Terminal,
            description: 'Get the source code and install the necessary libraries.',
            code: [
                'git clone <repository_url>',
                'cd realstarsecurityeguarding',
                'npm install',
                'pip install -r ai-server/requirements.txt'
            ]
        },
        {
            title: '2. Configuration',
            icon: CheckCircle2,
            description: 'Connect the application to your Supabase instance.',
            items: [
                { label: 'Create a .env file in the root directory' },
                { label: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY' },
                { label: 'Add SUPABASE_SERVICE_ROLE_KEY for the AI Server' }
            ]
        },
        {
            title: '3. Media Server Setup',
            icon: Server,
            description: 'Launch the streaming engine to bridge RTSP to Web.',
            items: [
                { label: 'Navigate to streaming-server/ directory' },
                { label: 'Modify mediamtx.yml with your camera RTSP links' },
                { label: 'Run mediamtx.exe (Windows) or binary for your OS' }
            ],
            code: ['npm run stream']
        },
        {
            title: '4. Start the Application',
            icon: Play,
            description: 'Run all sub-systems simultaneously.',
            code: [
                '# In Terminal 1 (Frontend)',
                'npm run dev',
                '',
                '# In Terminal 2 (AI Engine)',
                'npm run ai-server'
            ]
        }
    ];

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-br from-red-600 to-red-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <Book size={32} />
                        <h1 className="text-4xl font-black tracking-tight">System Setup Guide</h1>
                    </div>
                    <p className="text-red-100 max-w-2xl text-lg leading-relaxed">
                        Follow these steps to deploy the E-Guarding surveillance ecosystem on any Windows, Linux, or macOS workstation.
                    </p>
                </div>
                <Plus className="absolute -right-8 -bottom-8 text-white/10 w-64 h-64" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {steps.map((step, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-2xl group-hover:scale-110 transition-transform">
                                <step.icon className="text-red-600" size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">{step.title}</h3>
                                <p className="text-sm text-slate-500 mt-1">{step.description}</p>
                            </div>
                        </div>

                        {step.items && (
                            <ul className="space-y-2 mb-4">
                                {step.items.map((item, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <CheckCircle2 size={14} className="text-green-500" />
                                        {item.link ? (
                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline font-medium">
                                                {item.label}
                                            </a>
                                        ) : (
                                            item.label
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {step.code && (
                            <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 border border-slate-800 relative group/code">
                                {step.code.map((line, i) => (
                                    <div key={i} className={line === '' ? 'h-2' : ''}>{line}</div>
                                ))}
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(step.code?.join('\n') || '');
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded opacity-0 group-hover/code:opacity-100 transition-opacity"
                                >
                                    <Download size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <div className="bg-amber-50 dark:bg-amber-900/10 border-2 border-dashed border-amber-200 dark:border-amber-900/50 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
                    <AlertTriangle className="text-amber-600 mb-4" size={48} />
                    <h3 className="text-xl font-bold text-amber-900 dark:text-amber-400 mb-2">Important Security Note</h3>
                    <p className="text-sm text-amber-800 dark:text-amber-500/80 max-w-xs">
                        Never share your <code>.env</code> file or RTSP passwords. Ensure your MediaMTX port (8554) is secured by a firewall if exposed to the internet.
                    </p>
                </div>
            </div>

            <div className="bg-slate-900 dark:bg-black rounded-3xl p-8 text-center border border-slate-800 shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-4">Ready to automate?</h2>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                    We have included a setup script that installs all dependencies and configures the environment for you.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <div className="flex bg-slate-950 p-4 rounded-xl border border-slate-800 items-center gap-3">
                        <Terminal className="text-red-500" size={20} />
                        <code className="text-white font-bold">python setup.py</code>
                    </div>
                    <button className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-red-900/20">
                        Download Offline Manual
                    </button>
                </div>
            </div>
        </div>
    );
}
