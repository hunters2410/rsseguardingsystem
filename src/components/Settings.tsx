import { useEffect, useState } from 'react';
import { Save, RefreshCw, Mail, MessageSquare, Shield, Lock, Bell, User, Send } from 'lucide-react';
import { supabase, type SystemSettings } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'email' | 'sms' | 'security'>('general');

    // Password Change State
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const [formData, setFormData] = useState<Partial<SystemSettings>>({
        company_name: '',
        admin_email: '',
        retention_days: 30,
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

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        const { data } = await supabase.from('system_settings').select('*').limit(1).single();

        if (data) {
            setSettings(data);
            setFormData(data);
        } else {
            // Init if empty
            const { data: newData } = await supabase.from('system_settings').insert([
                { company_name: 'Real Star Security' }
            ]).select().single();
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
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${activeTab === id
                ? 'bg-red-600 text-white shadow-md shadow-red-200 dark:shadow-none'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
        >
            <Icon size={18} className={activeTab === id ? 'text-white' : 'text-slate-500 dark:text-slate-400'} />
            <span className="font-medium">{label}</span>
        </button>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Settings & Preference</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage system configurations, integrations and account security</p>
                </div>
                <button
                    onClick={loadSettings}
                    className="p-2.5 bg-white dark:bg-slate-800 text-slate-500 hover:text-red-600 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-colors"
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Navigation */}
                <div className="w-full md:w-64 flex-shrink-0">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 space-y-2 sticky top-24">
                        <TabButton id="general" label="General & Profile" icon={User} />
                        <TabButton id="email" label="Email Integration" icon={Mail} />
                        <TabButton id="sms" label="SMS Integration" icon={MessageSquare} />
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                        <TabButton id="security" label="Security" icon={Lock} />
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 md:p-8 min-h-[500px]">

                        {activeTab === 'general' && (
                            <form onSubmit={handleSave} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">General Settings</h2>
                                    <p className="text-sm text-slate-500">Configure basic system and profile information</p>
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-3xl font-bold text-slate-500 dark:text-slate-400">
                                                {user?.email?.[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-slate-900 dark:text-white">System Admin</h3>
                                                <p className="text-sm text-slate-500">{user?.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Company Name</label>
                                        <input
                                            type="text"
                                            name="company_name"
                                            value={formData.company_name}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="Enter company name"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Admin Contact Email</label>
                                        <input
                                            type="email"
                                            name="admin_email"
                                            value={formData.admin_email}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="admin@example.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Data Retention (Days)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                name="retention_days"
                                                value={formData.retention_days}
                                                onChange={handleChange}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                            <span className="absolute right-4 top-2.5 text-slate-400 text-sm">Days</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">Automatically delete old event data after this period.</p>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-red-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
                                    >
                                        <Save size={18} />
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === 'email' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <form onSubmit={handleSave} className="space-y-8">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Email Integration</h2>
                                        <p className="text-sm text-slate-500">Configure SMTP settings for system alerts</p>
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
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">SMTP Host</label>
                                            <input
                                                type="text"
                                                name="smtp_host"
                                                placeholder="smtp.gmail.com"
                                                value={formData.smtp_host || ''}
                                                onChange={handleChange}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Port</label>
                                            <input
                                                type="number"
                                                name="smtp_port"
                                                placeholder="587"
                                                value={formData.smtp_port || 587}
                                                onChange={handleChange}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sender Email</label>
                                            <input
                                                type="email"
                                                name="smtp_from"
                                                placeholder="alerts@myapp.com"
                                                value={formData.smtp_from || ''}
                                                onChange={handleChange}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Username</label>
                                            <input
                                                type="text"
                                                name="smtp_user"
                                                value={formData.smtp_user || ''}
                                                onChange={handleChange}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Password</label>
                                            <input
                                                type="password"
                                                name="smtp_pass"
                                                value={formData.smtp_pass || ''}
                                                onChange={handleChange}
                                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-red-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
                                        >
                                            <Save size={18} />
                                            {saving ? 'Saving...' : 'Save Configuration'}
                                        </button>
                                    </div>
                                </form>

                                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Test Configuration</h3>
                                    {/* Test UI Here... */}
                                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-100 dark:border-slate-700/50">
                                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                                            <div className="flex-1 w-full">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Send Test Email To</label>
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
                                                        }).select().single();

                                                        if (error) throw error;

                                                        let attempts = 0;
                                                        const maxAttempts = 10;
                                                        const pollInterval = setInterval(async () => {
                                                            attempts++;
                                                            const { data: updatedCmd } = await supabase.from('system_commands').select('*').eq('id', cmd.id).single();
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
                                                className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-6 py-2.5 rounded-xl font-medium shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-all h-[46px] disabled:opacity-50"
                                            >
                                                <Send size={18} />
                                                {testing ? 'Sending...' : 'Send Test Email'}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-3">This will attempt to send a test email using the configuration above.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'sms' && (
                            <form onSubmit={handleSave} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">SMS Integration</h2>
                                    <p className="text-sm text-slate-500">Configure SMS provider settings</p>
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
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Provider</label>
                                        <select
                                            name="sms_provider"
                                            value={formData.sms_provider || 'twilio'}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        >
                                            <option value="twilio">Twilio</option>
                                            <option value="nexmo">Nexmo/Vonage</option>
                                            <option value="aws_sns">AWS SNS</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Account SID / API Key</label>
                                        <input
                                            type="text"
                                            name="sms_account_sid"
                                            value={formData.sms_account_sid || ''}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Auth Token / Secret</label>
                                        <input
                                            type="password"
                                            name="sms_auth_token"
                                            value={formData.sms_auth_token || ''}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sender Number / ID</label>
                                        <input
                                            type="text"
                                            name="sms_from"
                                            placeholder="+15005550006"
                                            value={formData.sms_from || ''}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-red-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
                                    >
                                        <Save size={18} />
                                        {saving ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === 'security' && (
                            <form onSubmit={handlePasswordChange} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Security Settings</h2>
                                    <p className="text-sm text-slate-500">Update your password and secure your account</p>
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
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">New Password</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
                                            placeholder="Enter new password"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Confirm Password</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all dark:text-white"
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
                                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-red-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
                                        >
                                            <Shield size={18} />
                                            {saving ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
