import { useEffect, useState } from 'react';
import { Save, RefreshCw, Mail, MessageSquare, Shield, Lock, Bell, User, Send, ScanLine, Trash2, Plus, Database, Download, CheckCircle2, AlertCircle, Server, Play, Square, Activity, Cpu, Radio } from 'lucide-react';
import { useServerLauncher, formatUptime } from '../hooks/useServerLauncher';
import { supabase, type SystemSettings } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ZoneSettings from './ZoneSettings';

export default function Settings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'email' | 'sms' | 'security' | 'zones' | 'backup' | 'system'>('general');

    // Server launcher
    const launcher = useServerLauncher(5000);

    // Backup state
    const [backupProgress, setBackupProgress] = useState<string[]>([]);
    const [backupRunning, setBackupRunning]   = useState(false);
    const [backupDone, setBackupDone]         = useState(false);
    const [backupError, setBackupError]       = useState('');

    // Password Change State
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const [formData, setFormData] = useState<Partial<SystemSettings>>({
        company_name: '',
        admin_email: '',
        retention_days: 30,
        boundary_alerts_only: false,
        alert_email_enabled: false,
        smtp_host: '',
        smtp_port: 587,
        smtp_user: '',
        smtp_pass: '',
        smtp_from: '',
        alert_sms_enabled: false,
        sms_provider: 'twilio',
        sms_account_sid: '',
        sms_auth_token: '',
        sms_from: '',
    });

    const [notificationEmails, setNotificationEmails] = useState<{ id: string, email: string }[]>([]);
    const [newEmail, setNewEmail] = useState('');

    useEffect(() => {
        loadSettings();
        loadNotificationEmails();
    }, []);

    const loadNotificationEmails = async () => {
        const { data } = await supabase.from('notification_emails').select('*').order('created_at');
        if (data) setNotificationEmails(data);
    };

    const addNotificationEmail = async () => {
        if (!newEmail || !newEmail.includes('@')) return;

        try {
            const { error } = await supabase.from('notification_emails').insert({ email: newEmail });
            if (error) throw error;
            setNewEmail('');
            loadNotificationEmails();
        } catch (error: any) {
            alert('Failed to add email: ' + error.message);
        }
    };

    const removeNotificationEmail = async (id: string) => {
        try {
            await supabase.from('notification_emails').delete().eq('id', id);
            loadNotificationEmails();
        } catch (error) {
            console.error(error);
        }
    };

    const loadSettings = async () => {
        setLoading(true);
        const { data } = await supabase.from('system_settings').select('*').limit(1).maybeSingle();

        if (data) {
            setSettings(data);
            setFormData(data);
        } else {
            // Init if empty
            const { data: newData } = await supabase.from('system_settings').insert([
                { company_name: 'Real Star Security' }
            ]).select().maybeSingle();
            if (newData) {
                setSettings(newData);
                setFormData(newData);
            }
        }
        setLoading(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let value: string | number | boolean = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        // Ensure numbers are stored as numbers
        if (e.target.name === 'smtp_port' || e.target.name === 'retention_days') {
            value = parseInt(value as string) || 0;
        }

        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;

        setSaving(true);
        try {
            const { error } = await supabase.from('system_settings').update({
                ...formData,
                updated_at: new Date().toISOString()
            }).eq('id', settings.id);

            if (error) throw error;

            alert('Settings saved successfully!');
        } catch (err: any) {
            console.error(err);
            alert(`Failed to save settings: ${err.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');

        if (password.length < 6) {
            setPasswordError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;

            setPassword('');
            setConfirmPassword('');
            alert('Password updated successfully!');
        } catch (err: any) {
            console.error(err);
            setPasswordError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Database Backup ────────────────────────────────────────────────────────
    const ALL_TABLES = [
        'cameras', 'events', 'ai_models', 'ai_servers', 'camera_models',
        'camera_zones', 'alert_rules', 'system_settings', 'notification_emails',
        'known_faces', 'known_face_photos', 'known_color_profiles',
        'datasets', 'training_jobs', 'system_commands', 'user_profiles',
        'app_notifications',
    ];

    const log = (msg: string) => setBackupProgress(prev => [...prev, msg]);

    const escSql = (v: any): string => {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'boolean')  return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number')   return String(v);
        if (typeof v === 'object')   return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''")}'`;
    };

    const downloadBackup = async () => {
        setBackupRunning(true);
        setBackupDone(false);
        setBackupError('');
        setBackupProgress([]);

        const lines: string[] = [
            '-- ============================================================',
            `-- Real Star Security Systems — Database Backup`,
            `-- Generated: ${new Date().toISOString()}`,
            '-- ============================================================',
            '',
            'SET client_encoding = \'UTF8\';',
            '',
        ];

        // 1. Dump each table's data
        for (const table of ALL_TABLES) {
            log(`Fetching ${table}...`);
            const { data, error } = await supabase.from(table).select('*').order('created_at' as any, { ascending: true });
            if (error) {
                log(`  ⚠ Skipped ${table}: ${error.message}`);
                continue;
            }
            const rows = data as Record<string, any>[] | null;
            lines.push(`-- ── Table: ${table} (${rows?.length ?? 0} rows) ──`);
            if (!rows || rows.length === 0) {
                lines.push(`-- (empty)`, '');
                continue;
            }
            const cols = Object.keys(rows[0]);
            lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES`);
            const valueLines = rows.map((row, i) => {
                const vals = cols.map(c => escSql(row[c])).join(', ');
                return `  (${vals})${i < rows.length - 1 ? ',' : ';'}`;
            });
            lines.push(...valueLines, '');
            log(`  ✓ ${table}: ${rows.length} rows`);
        }

        // 2. Dump RLS policies via pg_policies view
        log('Fetching RLS policies...');
        const { data: policies, error: polErr } = await (supabase as any)
            .from('pg_policies')
            .select('schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check')
            .eq('schemaname', 'public');

        if (!polErr && policies && policies.length > 0) {
            lines.push('-- ============================================================');
            lines.push('-- Row Level Security Policies');
            lines.push('-- ============================================================');
            for (const p of policies as any[]) {
                lines.push(`-- Policy: ${p.policyname} ON ${p.tablename}`);
                lines.push(`--   Command : ${p.cmd}`);
                lines.push(`--   Roles   : ${(p.roles || []).join(', ') || '(all)'}`);
                lines.push(`--   USING   : ${p.qual || '(none)'}`);
                if (p.with_check) lines.push(`--   WITH CHECK: ${p.with_check}`);
                lines.push(
                    `CREATE POLICY ${JSON.stringify(p.policyname)} ON public.${p.tablename}`,
                    `  AS ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`,
                    `  FOR ${p.cmd}`,
                    `  TO ${(p.roles || []).join(', ') || 'PUBLIC'}`,
                    p.qual ? `  USING (${p.qual})` : '',
                    p.with_check ? `  WITH CHECK (${p.with_check})` : '',
                    ';',
                    ''
                );
            }
            log(`  ✓ ${policies.length} RLS policies`);
        } else {
            log('  ℹ RLS policies require service-role access — skipped for anon key');
            lines.push(
                '-- ============================================================',
                '-- RLS Policies: run pg_dump with service-role key for full policy export',
                '-- ============================================================',
                ''
            );
        }

        // 3. Trigger download
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href     = url;
        a.download = `rss-backup-${ts}.sql`;
        a.click();
        URL.revokeObjectURL(url);

        log('✅ Backup downloaded!');
        setBackupDone(true);
        setBackupRunning(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">Loading settings...</p>
                </div>
            </div>
        );
    }

    const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all duration-200 ${activeTab === id
                ? 'bg-red-600 text-white shadow-md shadow-red-200 dark:shadow-none'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
        >
            <Icon size={15} className={activeTab === id ? 'text-white' : 'text-slate-500 dark:text-slate-400'} />
            <span className="font-medium">{label}</span>
        </button>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings & Preference</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage system configurations, integrations and account security</p>
                </div>
                <button
                    onClick={loadSettings}
                    className="p-2 bg-white dark:bg-slate-800 text-slate-500 hover:text-red-600 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-colors"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-5">
                {/* Sidebar Navigation */}
                <div className="w-full md:w-52 flex-shrink-0">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 space-y-1 sticky top-24">
                                <TabButton id="general"  label="General & Profile"    icon={User} />
                        <TabButton id="email"    label="Email Integration"   icon={Mail} />
                        <TabButton id="sms"      label="SMS Integration"     icon={MessageSquare} />
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                        <TabButton id="security" label="Security"            icon={Lock} />
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                        <TabButton id="zones"    label="Zones & Boundaries"  icon={ScanLine} />
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                        <TabButton id="backup"   label="Database Backup"     icon={Database} />
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                        <TabButton id="system"   label="System Control"      icon={Server} />
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 md:p-6 min-h-[500px]">

                        {activeTab === 'general' && (
                            <form onSubmit={handleSave} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">General Settings</h2>
                                    <p className="text-xs text-slate-500">Configure basic system and profile information</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-500 dark:text-slate-400">
                                                {user?.email?.[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">System Admin</h3>
                                                <p className="text-xs text-slate-500">{user?.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Company Name</label>
                                        <input
                                            type="text"
                                            name="company_name"
                                            value={formData.company_name}
                                            onChange={handleChange}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="Enter company name"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Admin Contact Email</label>
                                        <input
                                            type="email"
                                            name="admin_email"
                                            value={formData.admin_email}
                                            onChange={handleChange}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="admin@example.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Data Retention (Days)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                name="retention_days"
                                                value={formData.retention_days}
                                                onChange={handleChange}
                                                className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                            <span className="absolute right-4 top-2.5 text-slate-400 text-sm">Days</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">Automatically delete old event data after this period.</p>
                                    </div>

                                    <div className="md:col-span-1 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl">
                                        <div className="flex items-start gap-3">
                                            <div className="flex items-center h-6">
                                                <input
                                                    id="boundary_alerts_only"
                                                    name="boundary_alerts_only"
                                                    type="checkbox"
                                                    checked={formData.boundary_alerts_only || false}
                                                    onChange={handleChange}
                                                    className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label htmlFor="boundary_alerts_only" className="font-semibold text-slate-900 dark:text-white block cursor-pointer select-none">
                                                    Strict Zone Mode
                                                </label>
                                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                                    Disable ALL general detection alerts. Only trigger alerts when a boundary is explicitly crossed.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-sm rounded-lg font-medium shadow shadow-red-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:shadow-none"
                                    >
                                        <Save size={15} />
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === 'email' && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <form onSubmit={handleSave} className="space-y-5">
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">Email Integration</h2>
                                        <p className="text-xs text-slate-500">Configure SMTP settings for system alerts</p>
                                    </div>
                                    {/* ... existing form content ... */}
                                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 p-4 rounded-xl flex items-start gap-3">
                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-red-600">
                                            <Bell size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <label htmlFor="alert_email_enabled" className="font-semibold text-slate-900 dark:text-white cursor-pointer select-none">Enable Email Alerts</label>
                                                <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        id="alert_email_enabled"
                                                        name="alert_email_enabled"
                                                        checked={formData.alert_email_enabled}
                                                        onChange={handleChange}
                                                        className="absolute w-6 h-6 opacity-0 z-10 cursor-pointer"
                                                    />
                                                    <div className={`block w-12 h-7 rounded-full transition-colors ${formData.alert_email_enabled ? 'bg-red-600' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                                    <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform transform ${formData.alert_email_enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">Receive instant email notifications for critical security events.</p>
                                        </div>
                                    </div>

                                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity duration-300 ${!formData.alert_email_enabled ? 'opacity-50 pointer-events-none blur-sm select-none' : ''}`}>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">SMTP Host</label>
                                            <input
                                                type="text"
                                                name="smtp_host"
                                                placeholder="smtp.gmail.com"
                                                value={formData.smtp_host || ''}
                                                onChange={handleChange}
                                                className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Port</label>
                                            <input
                                                type="number"
                                                name="smtp_port"
                                                placeholder="587"
                                                value={formData.smtp_port || 587}
                                                onChange={handleChange}
                                                className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Sender Email</label>
                                            <input
                                                type="email"
                                                name="smtp_from"
                                                placeholder="alerts@myapp.com"
                                                value={formData.smtp_from || ''}
                                                onChange={handleChange}
                                                className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Username</label>
                                            <input
                                                type="text"
                                                name="smtp_user"
                                                value={formData.smtp_user || ''}
                                                onChange={handleChange}
                                                className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
                                            <input
                                                type="password"
                                                name="smtp_pass"
                                                value={formData.smtp_pass || ''}
                                                onChange={handleChange}
                                                className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-sm rounded-lg font-medium shadow shadow-red-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:shadow-none"
                                        >
                                            <Save size={15} />
                                            {saving ? 'Saving...' : 'Save Configuration'}
                                        </button>
                                    </div>
                                </form>

                                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Notification Recipients</h3>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <input
                                                type="email"
                                                placeholder="Enter recipient email address"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                className="flex-1 px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                            <button
                                                type="button"
                                                onClick={addNotificationEmail}
                                                disabled={!newEmail}
                                                className="bg-slate-900 dark:bg-slate-700 text-white px-3 py-1.5 text-sm rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                <Plus size={15} /> Add
                                            </button>
                                        </div>

                                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                                            {notificationEmails.length === 0 ? (
                                                <div className="p-4 text-center text-slate-500 text-sm">No additional notification emails added.</div>
                                            ) : (
                                                notificationEmails.map(recip => (
                                                    <div key={recip.id} className="p-3 flex justify-between items-center group">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-slate-400">
                                                                <Mail size={16} />
                                                            </div>
                                                            <span className="text-slate-700 dark:text-slate-300 font-medium">{recip.email}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => removeNotificationEmail(recip.id)}
                                                            className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                            title="Remove email"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Test Configuration</h3>
                                    {/* Test UI Here... */}
                                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-100 dark:border-slate-700/50">
                                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                                            <div className="flex-1 w-full">
                                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Send Test Email To</label>
                                                <input
                                                    type="email"
                                                    placeholder="admin@example.com"
                                                    defaultValue={formData.admin_email}
                                                    id="test_email_target"
                                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                disabled={testing}
                                                onClick={async () => {
                                                    const targetEmail = (document.getElementById('test_email_target') as HTMLInputElement).value;
                                                    if (!targetEmail) {
                                                        alert('Please enter a target email address.');
                                                        return;
                                                    }

                                                    setTesting(true);
                                                    try {
                                                        const payload = { ...formData, admin_email: targetEmail };
                                                        const { data: cmd, error } = await supabase.from('system_commands').insert({
                                                            command_type: 'test_email',
                                                            payload: payload,
                                                            status: 'pending'
                                                        }).select().maybeSingle();

                                                        if (error) throw error;

                                                        let attempts = 0;
                                                        const maxAttempts = 10;
                                                        const pollInterval = setInterval(async () => {
                                                            attempts++;
                                                            const { data: updatedCmd } = await supabase.from('system_commands').select('*').eq('id', cmd.id).maybeSingle();
                                                            if (updatedCmd && updatedCmd.status !== 'pending' && updatedCmd.status !== 'processing') {
                                                                clearInterval(pollInterval);
                                                                setTesting(false);
                                                                if (updatedCmd.status === 'completed') {
                                                                    alert(`Success: ${updatedCmd.result}`);
                                                                } else {
                                                                    alert(`Failed: ${updatedCmd.result}`);
                                                                }
                                                            }
                                                            if (attempts >= maxAttempts) {
                                                                clearInterval(pollInterval);
                                                                setTesting(false);
                                                                alert('Timeout: No response from backend server.');
                                                            }
                                                        }, 2000);
                                                    } catch (e: any) {
                                                        setTesting(false);
                                                        alert('Failed to trigger test: ' + e.message);
                                                    }
                                                }}
                                                className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-4 py-1.5 text-sm rounded-lg font-medium shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
                                            >
                                                <Send size={15} />
                                                {testing ? 'Sending...' : 'Send Test Email'}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-3">This will attempt to send a test email using the configuration above.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'sms' && (
                            <form onSubmit={handleSave} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">SMS Integration</h2>
                                    <p className="text-xs text-slate-500">Configure SMS provider settings</p>
                                </div>

                                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 p-4 rounded-xl flex items-start gap-3">
                                    <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-red-600">
                                        <MessageSquare size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <label htmlFor="alert_sms_enabled" className="font-semibold text-slate-900 dark:text-white cursor-pointer select-none">Enable SMS Alerts</label>
                                            <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    id="alert_sms_enabled"
                                                    name="alert_sms_enabled"
                                                    checked={formData.alert_sms_enabled}
                                                    onChange={handleChange}
                                                    className="absolute w-6 h-6 opacity-0 z-10 cursor-pointer"
                                                />
                                                <div className={`block w-12 h-7 rounded-full transition-colors ${formData.alert_sms_enabled ? 'bg-red-600' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                                <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform transform ${formData.alert_sms_enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">Receive instant text messages for critical alerts.</p>
                                    </div>
                                </div>

                                <div className={`space-y-6 transition-opacity duration-300 ${!formData.alert_sms_enabled ? 'opacity-50 pointer-events-none blur-sm select-none' : ''}`}>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Provider</label>
                                        <select
                                            name="sms_provider"
                                            value={formData.sms_provider || 'twilio'}
                                            onChange={handleChange}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        >
                                            <option value="twilio">Twilio</option>
                                            <option value="nexmo">Nexmo/Vonage</option>
                                            <option value="aws_sns">AWS SNS</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Account SID / API Key</label>
                                        <input
                                            type="text"
                                            name="sms_account_sid"
                                            value={formData.sms_account_sid || ''}
                                            onChange={handleChange}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Auth Token / Secret</label>
                                        <input
                                            type="password"
                                            name="sms_auth_token"
                                            value={formData.sms_auth_token || ''}
                                            onChange={handleChange}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Sender Number / ID</label>
                                        <input
                                            type="text"
                                            name="sms_from"
                                            placeholder="+15005550006"
                                            value={formData.sms_from || ''}
                                            onChange={handleChange}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-sm rounded-lg font-medium shadow shadow-red-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:shadow-none"
                                    >
                                        <Save size={15} />
                                        {saving ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === 'security' && (
                            <form onSubmit={handlePasswordChange} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">Security Settings</h2>
                                    <p className="text-xs text-slate-500">Update your password and secure your account</p>
                                </div>

                                <div className="max-w-md space-y-6">
                                    <div className="p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl">
                                        <div className="flex gap-3">
                                            <Lock className="text-orange-600 flex-shrink-0" size={20} />
                                            <div>
                                                <h4 className="font-semibold text-orange-900 dark:text-orange-100 text-sm">Password Requirements</h4>
                                                <ul className="list-disc list-inside text-xs text-orange-800 dark:text-orange-200 mt-1 space-y-1">
                                                    <li>At least 6 characters long</li>
                                                    <li>Include numbers and symbols for better security</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="Enter new password"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="Confirm new password"
                                        />
                                    </div>

                                    {passwordError && (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                                            {passwordError}
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <button
                                            type="submit"
                                            disabled={saving || !password || !confirmPassword}
                                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-sm rounded-lg font-medium shadow shadow-red-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:shadow-none"
                                        >
                                            <Shield size={18} />
                                            {saving ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {activeTab === 'backup' && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">Database Backup</h2>
                                    <p className="text-xs text-slate-500">Download a full SQL dump of all application data and RLS policies</p>
                                </div>

                                {/* Info card */}
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl text-sm space-y-2">
                                    <p className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                                        <Database size={15} /> What's included in the backup
                                    </p>
                                    <ul className="list-disc list-inside text-blue-800 dark:text-blue-200 space-y-1 text-xs">
                                        <li>All application tables: cameras, events, AI models, servers, zones, alert rules…</li>
                                        <li>Settings, notification emails, known faces, datasets, training jobs</li>
                                        <li>RLS (Row Level Security) policy definitions</li>
                                        <li>Downloaded as a <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.sql</code> file — importable via psql or Supabase SQL editor</li>
                                    </ul>
                                </div>

                                {/* Download button */}
                                <button
                                    onClick={downloadBackup}
                                    disabled={backupRunning}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60
                                               text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow
                                               shadow-red-600/20 active:scale-95 transition-all"
                                >
                                    {backupRunning
                                        ? <><RefreshCw size={15} className="animate-spin" /> Generating backup…</>
                                        : <><Download size={15} /> Download SQL Backup</>}
                                </button>

                                {/* Progress log */}
                                {backupProgress.length > 0 && (
                                    <div className="bg-slate-900 dark:bg-black rounded-xl p-4 font-mono text-xs space-y-0.5 max-h-64 overflow-y-auto">
                                        {backupProgress.map((line, i) => (
                                            <div key={i} className="text-green-400">{line}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Success / Error banner */}
                                {backupDone && !backupRunning && (
                                    <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20
                                                    border border-emerald-200 dark:border-emerald-800 rounded-xl
                                                    text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                                        <CheckCircle2 size={16} /> Backup downloaded successfully!
                                    </div>
                                )}
                                {backupError && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20
                                                    border border-red-200 dark:border-red-800 rounded-xl
                                                    text-red-700 dark:text-red-400 text-sm font-semibold">
                                        <AlertCircle size={16} /> {backupError}
                                    </div>
                                )}

                                {/* Warning note */}
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                                    <strong>Note:</strong> The anon API key can only read tables your RLS policies allow.
                                    For a complete dump including all policies, run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">pg_dump</code> from
                                    the Supabase Dashboard → SQL Editor using the service-role key.
                                </div>
                            </div>
                        )}

                        {activeTab === 'zones' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ZoneSettings />
                            </div>
                        )}

                        {activeTab === 'system' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">System Control</h2>
                                    <p className="text-xs text-slate-500">Start and stop local servers without opening a terminal.</p>
                                </div>

                                {launcher.available === false && (
                                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
                                        <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-amber-800 dark:text-amber-300">
                                            <strong>Launcher not available.</strong> Server control only works when running <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">npm run dev</code>.
                                        </div>
                                    </div>
                                )}

                                {/* AI Server Card */}
                                <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                                <Cpu size={18} className="text-violet-600 dark:text-violet-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">AI Server</h3>
                                                <p className="text-xs text-slate-500">Python surveillance engine</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                                                launcher.status.aiServer.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                launcher.status.aiServer.status === 'stopped' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' :
                                                launcher.status.aiServer.status === 'unavailable' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    launcher.status.aiServer.status === 'running' ? 'bg-green-500 animate-pulse' :
                                                    launcher.status.aiServer.status === 'stopped' ? 'bg-slate-400' :
                                                    'bg-blue-500 animate-ping'
                                                }`} />
                                                {launcher.status.aiServer.status.charAt(0).toUpperCase() + launcher.status.aiServer.status.slice(1)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <p className="text-slate-400 mb-0.5">PID</p>
                                            <p className="font-mono font-semibold text-slate-800 dark:text-white">{launcher.status.aiServer.pid ?? '—'}</p>
                                        </div>
                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <p className="text-slate-400 mb-0.5">Uptime</p>
                                            <p className="font-mono font-semibold text-slate-800 dark:text-white">{formatUptime(launcher.status.aiServer.uptime)}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            id="btn-start-ai-server"
                                            onClick={launcher.startAI}
                                            disabled={launcher.aiLoading || launcher.status.aiServer.status === 'running' || launcher.available === false}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-all"
                                        >
                                            <Play size={14} />
                                            {launcher.status.aiServer.status === 'starting' ? 'Starting...' : 'Start'}
                                        </button>
                                        <button
                                            id="btn-stop-ai-server"
                                            onClick={launcher.stopAI}
                                            disabled={launcher.aiLoading || launcher.status.aiServer.status === 'stopped' || launcher.available === false}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-all"
                                        >
                                            <Square size={14} />
                                            {launcher.status.aiServer.status === 'stopping' ? 'Stopping...' : 'Stop'}
                                        </button>
                                    </div>
                                </div>

                                {/* Streaming Server Card */}
                                <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                                <Radio size={18} className="text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Streaming Server</h3>
                                                <p className="text-xs text-slate-500">MediaMTX — RTSP / HLS / WebRTC</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                                                launcher.status.streaming.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                launcher.status.streaming.status === 'stopped' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' :
                                                launcher.status.streaming.status === 'unavailable' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    launcher.status.streaming.status === 'running' ? 'bg-green-500 animate-pulse' :
                                                    launcher.status.streaming.status === 'stopped' ? 'bg-slate-400' :
                                                    'bg-blue-500 animate-ping'
                                                }`} />
                                                {launcher.status.streaming.status.charAt(0).toUpperCase() + launcher.status.streaming.status.slice(1)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <p className="text-slate-400 mb-0.5">PID</p>
                                            <p className="font-mono font-semibold text-slate-800 dark:text-white">{launcher.status.streaming.pid ?? '—'}</p>
                                        </div>
                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <p className="text-slate-400 mb-0.5">Uptime</p>
                                            <p className="font-mono font-semibold text-slate-800 dark:text-white">{formatUptime(launcher.status.streaming.uptime)}</p>
                                        </div>
                                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <p className="text-slate-400 mb-0.5">HLS Port</p>
                                            <p className="font-mono font-semibold text-slate-800 dark:text-white">:8888</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            id="btn-start-streaming-server"
                                            onClick={launcher.startStream}
                                            disabled={launcher.streamLoading || launcher.status.streaming.status === 'running' || launcher.available === false}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-all"
                                        >
                                            <Play size={14} />
                                            {launcher.status.streaming.status === 'starting' ? 'Starting...' : 'Start'}
                                        </button>
                                        <button
                                            id="btn-stop-streaming-server"
                                            onClick={launcher.stopStream}
                                            disabled={launcher.streamLoading || launcher.status.streaming.status === 'stopped' || launcher.available === false}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-all"
                                        >
                                            <Square size={14} />
                                            {launcher.status.streaming.status === 'stopping' ? 'Stopping...' : 'Stop'}
                                        </button>
                                    </div>
                                </div>

                                {/* Last action message */}
                                {launcher.lastMessage && (
                                    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl text-xs text-blue-800 dark:text-blue-300">
                                        <Activity size={14} className="mt-0.5 flex-shrink-0" />
                                        {launcher.lastMessage}
                                    </div>
                                )}

                                <p className="text-xs text-slate-400 text-center">
                                    Polls every 5 s · Status refreshes automatically
                                </p>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
