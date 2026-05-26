import { useEffect, useState } from 'react';
import { Bell, Save, Camera as CameraIcon, Globe, Shield, AlertTriangle, CheckCircle2, RefreshCw, Plus, X, Zap, Settings, Users, Shirt, Sliders, Timer, Car, Package, Eye, Flame, ShieldAlert, BookOpen, ExternalLink } from 'lucide-react';
import { supabase, type AlertRule, type Camera, type AIModel, type KnownColorProfile } from '../lib/supabase';
import { toast } from 'sonner';

const OBJECT_GROUPS = [
  {
    label: 'People & Behaviour', color: 'red',
    objects: [
      { value: 'person',            label: 'Person',              icon: '👤' },
      { value: 'loitering_detected',label: 'Loitering',           icon: '⏳' },
      { value: 'crowd_alert',       label: 'Crowd',               icon: '👥' },
      { value: 'fight_detected',    label: 'Fight / Aggression',  icon: '🥊' },
      { value: 'fall_detected',     label: 'Person Fall',         icon: '🚨' },
    ],
  },
  {
    label: 'Threats', color: 'rose',
    objects: [
      { value: 'weapon',            label: 'Weapon',              icon: '🔫' },
      { value: 'gun',               label: 'Gun',                 icon: '🔫' },
      { value: 'knife',             label: 'Knife',               icon: '🔪' },
      { value: 'fire',              label: 'Fire',                icon: '🔥' },
      { value: 'smoke',             label: 'Smoke',               icon: '💨' },
    ],
  },
  {
    label: 'Vehicles', color: 'blue',
    objects: [
      { value: 'car',               label: 'Car',                 icon: '🚗' },
      { value: 'truck',             label: 'Truck',               icon: '🚚' },
      { value: 'motorcycle',        label: 'Motorcycle',          icon: '🏍️' },
      { value: 'bicycle',           label: 'Bicycle',             icon: '🚲' },
      { value: 'bus',               label: 'Bus',                 icon: '🚌' },
      { value: 'illegal_parking',   label: 'Illegal Parking',     icon: '🅿️' },
    ],
  },
  {
    label: 'Objects & PPE', color: 'amber',
    objects: [
      { value: 'abandoned_object',  label: 'Abandoned Object',    icon: '🎒' },
      { value: 'backpack',          label: 'Backpack',            icon: '🎒' },
      { value: 'suitcase',          label: 'Suitcase',            icon: '🧳' },
      { value: 'NO-Hardhat',        label: 'No Hard Hat',         icon: '⛑️' },
      { value: 'NO-Safety Vest',    label: 'No Safety Vest',      icon: '🦺' },
      { value: 'Hardhat',           label: 'Hard Hat (OK)',        icon: '✅' },
    ],
  },
  {
    label: 'Animals', color: 'amber',
    objects: [
      { value: 'dog',               label: 'Dog',                 icon: '🐕' },
      { value: 'cat',               label: 'Cat',                 icon: '🐈' },
      { value: 'bird',              label: 'Bird',                icon: '🐦' },
      { value: 'horse',             label: 'Horse',               icon: '🐎' },
    ],
  },
  {
    label: 'Environmental', color: 'slate',
    objects: [
      { value: 'camera_tamper',     label: 'Camera Tamper',       icon: '📵' },
      { value: 'license_plate',     label: 'License Plate',       icon: '🔢' },
    ],
  },
];

const ALL_OBJECTS = OBJECT_GROUPS.flatMap(g => g.objects);

const PRESETS: Record<string, { name: string; icon: string; mode: 'whitelist' | 'blacklist'; enabled_objects: string[]; disabled_objects: string[]; confidence_threshold: number; desc: string }> = {
  high_security: { name: 'High Security', icon: '🔴', mode: 'whitelist', enabled_objects: ['person', 'weapon', 'gun', 'knife', 'car', 'truck', 'motorcycle'], disabled_objects: [], confidence_threshold: 0.35, desc: 'All threats + vehicles' },
  after_hours:   { name: 'After Hours',   icon: '🌙', mode: 'whitelist', enabled_objects: ['person', 'car', 'truck'], disabled_objects: [], confidence_threshold: 0.40, desc: 'People & vehicles only' },
  perimeter:     { name: 'Perimeter',     icon: '🛡️', mode: 'whitelist', enabled_objects: ['person', 'car', 'truck', 'motorcycle'], disabled_objects: [], confidence_threshold: 0.30, desc: 'Boundary monitoring' },
  all_objects:   { name: 'All Objects',   icon: '🌐', mode: 'blacklist', enabled_objects: [], disabled_objects: [], confidence_threshold: 0.25, desc: 'Trigger on everything' },
};

const DEFAULT_RULE = {
  camera_id: null,
  enabled_objects: ['person', 'weapon', 'gun', 'knife', 'car', 'truck'],
  disabled_objects: [],
  mode: 'whitelist' as const,
  apply_to_zones_only: false,
  confidence_threshold: 0.28,
  schedule_enabled: false,
  schedule_start: '00:00',
  schedule_end: '23:59',
  schedule_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const COLORS_PALETTE = [
  { name: 'red',    label: 'Red',    hex: '#ef4444', border: '#b91c1c' },
  { name: 'orange', label: 'Orange', hex: '#f97316', border: '#c2410c' },
  { name: 'yellow', label: 'Yellow', hex: '#eab308', border: '#a16207' },
  { name: 'green',  label: 'Green',  hex: '#22c55e', border: '#15803d' },
  { name: 'blue',   label: 'Blue',   hex: '#3b82f6', border: '#1d4ed8' },
  { name: 'navy',   label: 'Navy',   hex: '#1e3a8a', border: '#1e3a8a' },
  { name: 'purple', label: 'Purple', hex: '#a855f7', border: '#7e22ce' },
  { name: 'white',  label: 'White',  hex: '#f8fafc', border: '#cbd5e1' },
  { name: 'gray',   label: 'Gray',   hex: '#6b7280', border: '#374151' },
  { name: 'black',  label: 'Black',  hex: '#1f2937', border: '#111827' },
  { name: 'brown',  label: 'Brown',  hex: '#92400e', border: '#78350f' },
  { name: 'khaki',  label: 'Khaki',  hex: '#ca8a04', border: '#a16207' },
  { name: 'pink',   label: 'Pink',   hex: '#ec4899', border: '#be185d' },
];

function ColorPicker({ selected, onChange, label }: { selected: string[]; onChange: (v: string[]) => void; label: string }) {
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter(c => c !== name) : [...selected, name]);
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {COLORS_PALETTE.map(c => {
          const sel = selected.includes(c.name);
          return (
            <button key={c.name} onClick={() => toggle(c.name)} title={c.label}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                sel ? 'scale-125 shadow-md' : 'opacity-60 hover:opacity-100'
              }`}
              style={{ background: c.hex, borderColor: sel ? c.border : '#e2e8f0' }}>
              {sel && <span className="flex items-center justify-center w-full h-full text-[9px] text-white font-black">✓</span>}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map(n => {
            const c = COLORS_PALETTE.find(x => x.name === n);
            return <span key={n} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: c?.hex + '22', borderColor: c?.hex, color: c?.border }}>{c?.label || n}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function CrowdConfig({ model, onSave }: { model: AIModel; onSave: (m: AIModel, d: string) => void }) {
  const parse = (desc: string) => {
    const tm = desc.match(/threshold\s*:\s*(\d+)/i);
    const cm = desc.match(/cooldown\s*:\s*(\d+)/i);
    return { threshold: tm ? parseInt(tm[1]) : 5, cooldown: cm ? parseInt(cm[1]) : 120 };
  };
  const [cfg, setCfg] = useState(() => parse(model.description || ''));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const desc = `Crowd detection model. threshold:${cfg.threshold} cooldown:${cfg.cooldown}`;
    await onSave(model, desc);
    setSaving(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-amber-500 rounded-xl"><Users size={16} className="text-white" /></div>
        <div>
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">Crowd Detection Model</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">People Threshold</p>
          <span className="text-sm font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">{cfg.threshold} people</span>
        </div>
        <input type="range" min={2} max={50} value={cfg.threshold}
          onChange={e => setCfg({ ...cfg, threshold: parseInt(e.target.value) })}
          className="w-full accent-amber-500" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>2 (small group)</span><span>50 (large crowd)</span></div>
        <p className="text-[10px] text-slate-500 bg-slate-50 rounded p-1.5 mt-1.5">
          Alert fires when <strong>{cfg.threshold}+ people</strong> appear in the same frame simultaneously.
        </p>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Alert Cooldown</p>
          <span className="text-sm font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">{cfg.cooldown}s</span>
        </div>
        <input type="range" min={30} max={600} step={30} value={cfg.cooldown}
          onChange={e => setCfg({ ...cfg, cooldown: parseInt(e.target.value) })}
          className="w-full accent-slate-500" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>30s</span><span>10 min</span></div>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : 'Save Crowd Settings'}
      </button>
    </div>
  );
}

function DressCodeConfig({ model, onSave }: { model: AIModel; onSave: (m: AIModel, d: string) => void }) {
  const parse = (desc: string) => {
    const m = desc.match(/dress_code\s*:(\{.*?\})/is);
    if (m) { try { return JSON.parse(m[1]); } catch {} }
    return { required: [], prohibited: [], check: 'top', alert_on: 'violation', coverage: 0.15, cooldown: 90 };
  };
  const [cfg, setCfg] = useState<any>(() => parse(model.description || ''));
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<KnownColorProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profilesLoaded, setProfilesLoaded] = useState(false);

  // Lazy-load profiles on first expansion
  const loadProfiles = async () => {
    if (profilesLoaded) return;
    setLoadingProfiles(true);
    const { data } = await supabase.from('known_color_profiles').select('*').order('name');
    if (data) setProfiles(data as KnownColorProfile[]);
    setLoadingProfiles(false);
    setProfilesLoaded(true);
  };

  const applyProfile = (p: KnownColorProfile) => {
    setCfg({
      ...cfg,
      required: p.required_colors,
      prohibited: p.prohibited_colors,
      check: p.region,
      coverage: p.coverage,
      cooldown: p.cooldown,
    });
    toast.success(`Applied "${p.name}" profile`);
  };

  const save = async () => {
    setSaving(true);
    const jsonPart = JSON.stringify({ required: cfg.required, prohibited: cfg.prohibited, check: cfg.check, alert_on: cfg.alert_on, coverage: cfg.coverage, cooldown: cfg.cooldown });
    const desc = `Dress code detection model. dress_code:${jsonPart}`;
    await onSave(model, desc);
    setSaving(false);
  };

  const COLORS_PALETTE_LOCAL = [
    { name: 'red',    label: 'Red',    hex: '#ef4444', border: '#b91c1c' },
    { name: 'orange', label: 'Orange', hex: '#f97316', border: '#c2410c' },
    { name: 'yellow', label: 'Yellow', hex: '#eab308', border: '#a16207' },
    { name: 'green',  label: 'Green',  hex: '#22c55e', border: '#15803d' },
    { name: 'blue',   label: 'Blue',   hex: '#3b82f6', border: '#1d4ed8' },
    { name: 'navy',   label: 'Navy',   hex: '#1e3a8a', border: '#1e3a8a' },
    { name: 'purple', label: 'Purple', hex: '#a855f7', border: '#7e22ce' },
    { name: 'white',  label: 'White',  hex: '#f8fafc', border: '#cbd5e1' },
    { name: 'gray',   label: 'Gray',   hex: '#6b7280', border: '#374151' },
    { name: 'black',  label: 'Black',  hex: '#1f2937', border: '#111827' },
    { name: 'brown',  label: 'Brown',  hex: '#92400e', border: '#78350f' },
    { name: 'khaki',  label: 'Khaki',  hex: '#ca8a04', border: '#a16207' },
    { name: 'pink',   label: 'Pink',   hex: '#ec4899', border: '#be185d' },
  ];

  const toggleColor = (field: 'required' | 'prohibited', name: string) => {
    const cur: string[] = cfg[field] || [];
    setCfg({ ...cfg, [field]: cur.includes(name) ? cur.filter(c => c !== name) : [...cur, name] });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-purple-600 rounded-xl"><Shirt size={16} className="text-white" /></div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">Dress Code Detection Model</p>
        </div>
        <a href="/face-library" target="_blank"
          className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 font-semibold border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-50 transition-colors">
          <BookOpen size={11} /> Manage Profiles <ExternalLink size={9} />
        </a>
      </div>

      {/* ── Saved profiles quick-apply ─────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Load from Saved Profile</p>
          <button onClick={loadProfiles} className="text-[10px] text-purple-600 hover:underline font-semibold">
            {loadingProfiles ? 'Loading...' : profilesLoaded ? `${profiles.length} profiles` : 'Load profiles'}
          </button>
        </div>
        {profilesLoaded && profiles.length === 0 && (
          <p className="text-[10px] text-slate-400 italic">No profiles saved yet. Go to <strong>Face & Color Library</strong> to create reusable profiles.</p>
        )}
        {profilesLoaded && profiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profiles.map(p => (
              <button key={p.id} onClick={() => applyProfile(p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition-all">
                <Shirt size={11} />
                {p.name}
                <span className="text-[9px] text-purple-400 capitalize">{p.region}</span>
              </button>
            ))}
          </div>
        )}
        {!profilesLoaded && (
          <button onClick={loadProfiles}
            className="w-full py-2 border border-dashed border-purple-300 rounded-xl text-[11px] text-purple-500 hover:bg-purple-50 transition-colors font-semibold">
            Click to load saved color profiles
          </button>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Manual Color Selection</p>
        {/* Required */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">✅ Required Colors</p>
          <div className="flex flex-wrap gap-2">
            {COLORS_PALETTE_LOCAL.map(c => {
              const sel = (cfg.required || []).includes(c.name);
              return (
                <button key={c.name} onClick={() => toggleColor('required', c.name)} title={c.label}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${sel ? 'scale-125 shadow-md' : 'opacity-60 hover:opacity-100'}`}
                  style={{ background: c.hex, borderColor: sel ? c.border : '#e2e8f0' }}>
                  {sel && <span className="flex items-center justify-center w-full h-full text-[9px] text-white font-black">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        {/* Prohibited */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">🚫 Prohibited Colors</p>
          <div className="flex flex-wrap gap-2">
            {COLORS_PALETTE_LOCAL.map(c => {
              const sel = (cfg.prohibited || []).includes(c.name);
              return (
                <button key={c.name} onClick={() => toggleColor('prohibited', c.name)} title={c.label}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${sel ? 'scale-125 shadow-md ring-2 ring-red-400' : 'opacity-60 hover:opacity-100'}`}
                  style={{ background: c.hex, borderColor: sel ? '#ef4444' : '#e2e8f0' }}>
                  {sel && <span className="flex items-center justify-center w-full h-full text-[9px] text-white font-black">✕</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Body Region</p>
          {(['top','bottom','full'] as const).map(r => (
            <label key={r} className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input type="radio" name={`region-${model.id}`} value={r} checked={cfg.check === r} onChange={() => setCfg({ ...cfg, check: r })} className="accent-purple-600" />
              <span className="text-xs text-slate-700 capitalize">{r === 'top' ? '👕 Upper body' : r === 'bottom' ? '👖 Lower body' : '🧍 Full body'}</span>
            </label>
          ))}
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Alert On</p>
          {([['violation','⚠️ Violation (missing required)'],['match','🎯 Match (wearing required)']] as const).map(([v,l]) => (
            <label key={v} className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input type="radio" name={`alerton-${model.id}`} value={v} checked={cfg.alert_on === v} onChange={() => setCfg({ ...cfg, alert_on: v })} className="accent-purple-600" />
              <span className="text-xs text-slate-700">{l}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Min Color Coverage</p>
          <span className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">{Math.round((cfg.coverage || 0.15) * 100)}%</span>
        </div>
        <input type="range" min={0.05} max={0.50} step={0.05} value={cfg.coverage || 0.15}
          onChange={e => setCfg({ ...cfg, coverage: parseFloat(e.target.value) })}
          className="w-full accent-purple-600" />
        <p className="text-[10px] text-slate-400 mt-0.5">Color must cover at least this % of the body region to count.</p>
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cooldown Between Alerts</p>
          <span className="text-xs font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">{cfg.cooldown || 90}s</span>
        </div>
        <input type="range" min={30} max={300} step={15} value={cfg.cooldown || 90}
          onChange={e => setCfg({ ...cfg, cooldown: parseInt(e.target.value) })}
          className="w-full accent-slate-500" />
      </div>

      {/* Summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Active Configuration</p>
        <p className="text-[11px] text-slate-600">
          Scanning <strong>{cfg.check}</strong> of body at <strong>{Math.round((cfg.coverage||0.15)*100)}%</strong> coverage.
          {(cfg.required||[]).length > 0 && <> Alert if <strong className="text-purple-700">{(cfg.required||[]).join(', ')}</strong> missing.</>}
          {(cfg.prohibited||[]).length > 0 && <> Alert if <strong className="text-red-600">{(cfg.prohibited||[]).join(', ')}</strong> detected.</>}
          {!(cfg.required||[]).length && !(cfg.prohibited||[]).length && <span className="text-amber-600"> ⚠️ No colors set — no dress code alerts will fire.</span>}
        </p>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : 'Save Dress Code Settings'}
      </button>
    </div>
  );
}

function scheduleStatus(rule: AlertRule): { active: boolean; label: string } {
  if (!rule.schedule_enabled) return { active: true, label: 'Always active' };
  const now = new Date();
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  if (!rule.schedule_days?.includes(dayName)) return { active: false, label: `Inactive today (${dayName})` };
  const [sh, sm] = (rule.schedule_start || '00:00').split(':').map(Number);
  const [eh, em] = (rule.schedule_end || '23:59').split(':').map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const inRange = start <= end ? cur >= start && cur <= end : cur >= start || cur <= end;
  return inRange
    ? { active: true, label: `Active now (${rule.schedule_start}–${rule.schedule_end})` }
    : { active: false, label: `Outside window (${rule.schedule_start}–${rule.schedule_end})` };
}

function RuleEditor({ rule, onChange, extraGroups = [] }: { rule: AlertRule; onChange: (r: AlertRule) => void; extraGroups?: { label: string; color: string; objects: { value: string; label: string; icon: string }[] }[] }) {
  const isWhitelist = rule.mode === 'whitelist';
  const activeList = isWhitelist ? rule.enabled_objects : rule.disabled_objects;
  const allGroups = extraGroups.length > 0 ? [...OBJECT_GROUPS, ...extraGroups] : OBJECT_GROUPS;

  const toggle = (val: string) => {
    const key = isWhitelist ? 'enabled_objects' : 'disabled_objects';
    const cur = rule[key] || [];
    onChange({ ...rule, [key]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] });
  };

  return (
    <div className="space-y-5">
      {/* Mode */}
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Alert Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {[{ m: 'whitelist', label: 'Whitelist', desc: 'Only alert for selected objects', icon: <CheckCircle2 size={15}/>, color: 'emerald' },
            { m: 'blacklist', label: 'Blacklist', desc: 'Alert for all except selected', icon: <AlertTriangle size={15}/>, color: 'orange' }
          ].map(({ m, label, desc, icon, color }) => (
            <button key={m} onClick={() => onChange({ ...rule, mode: m as any })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${rule.mode === m ? (color === 'emerald' ? 'border-emerald-500 bg-emerald-50' : 'border-orange-500 bg-orange-50') : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
              <div className={`flex items-center gap-2 font-bold text-sm mb-0.5 ${rule.mode === m ? (color === 'emerald' ? 'text-emerald-700' : 'text-orange-700') : 'text-slate-700'}`}>
                {icon} {label}
              </div>
              <p className="text-[10px] text-slate-500">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Objects */}
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
          {isWhitelist ? '✅ Trigger alerts for these objects' : '🚫 Exclude these objects (alert for everything else)'}
        </p>
        <div className="space-y-3">
          {allGroups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.objects.map(obj => {
                  const sel = activeList?.includes(obj.value);
                  return (
                    <button key={obj.value} onClick={() => toggle(obj.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${sel
                        ? (isWhitelist ? 'bg-red-600 border-red-600 text-white shadow-sm shadow-red-200' : 'bg-orange-500 border-orange-500 text-white')
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                      <span>{obj.icon}</span> {obj.label}
                      {sel && <X size={10} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Confidence Threshold</p>
          <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${rule.confidence_threshold < 0.3 ? 'bg-green-100 text-green-700' : rule.confidence_threshold < 0.5 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
            {(rule.confidence_threshold * 100).toFixed(0)}%
          </span>
        </div>
        <input type="range" min="0.10" max="0.90" step="0.05"
          value={rule.confidence_threshold}
          onChange={e => onChange({ ...rule, confidence_threshold: parseFloat(e.target.value) })}
          className="w-full accent-red-600" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>🟢 More alerts (10%)</span>
          <span>🔴 Fewer alerts (90%)</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 bg-slate-50 rounded p-1.5">
          AI detections below <strong>{(rule.confidence_threshold * 100).toFixed(0)}%</strong> confidence will be ignored. Lower = more sensitive, higher = fewer false alarms.
        </p>
      </div>

      {/* Summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Active Configuration Summary</p>
        <div className="flex flex-wrap gap-1">
          {isWhitelist
            ? (rule.enabled_objects?.length ? rule.enabled_objects.map(o => {
                const obj = ALL_OBJECTS.find(x => x.value === o);
                return <span key={o} className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">{obj?.icon} {obj?.label || o}</span>;
              }) : <span className="text-[10px] text-slate-400 italic">⚠️ No objects selected — no alerts will trigger</span>)
            : <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">All objects except: {rule.disabled_objects?.join(', ') || 'none'}</span>
          }
        </div>
        <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-200 pt-2">
          📍 If zones/boundaries are configured in Zone Settings, alerts only fire when objects enter those zones.
        </p>
      </div>

      {/* Schedule */}
      {(() => {
        const status = scheduleStatus(rule);
        return (
          <div className={`rounded-xl border-2 p-4 transition-all ${rule.schedule_enabled ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🕐</span>
                <div>
                  <p className="text-xs font-bold text-slate-800">Detection Schedule</p>
                  <p className="text-[10px] text-slate-500">Restrict AI to specific hours &amp; days</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {rule.schedule_enabled && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {status.active ? '● Active Now' : '● Inactive Now'}
                  </span>
                )}
                <button
                  onClick={() => onChange({ ...rule, schedule_enabled: !rule.schedule_enabled })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.schedule_enabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${rule.schedule_enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {rule.schedule_enabled && (
              <div className="space-y-3">
                {/* Time range */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Active Hours</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 mb-1 block">From</label>
                      <input
                        type="time"
                        value={rule.schedule_start || '00:00'}
                        onChange={e => onChange({ ...rule, schedule_start: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-mono"
                      />
                    </div>
                    <div className="text-slate-400 text-sm font-bold mt-4">→</div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 mb-1 block">To</label>
                      <input
                        type="time"
                        value={rule.schedule_end || '23:59'}
                        onChange={e => onChange({ ...rule, schedule_end: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-mono"
                      />
                    </div>
                  </div>
                  {(rule.schedule_start || '00:00') > (rule.schedule_end || '23:59') && (
                    <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-1.5 mt-1.5">
                      🌙 Overnight schedule detected — active from {rule.schedule_start} to {rule.schedule_end} next day
                    </p>
                  )}
                </div>

                {/* Days */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Active Days</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map(day => {
                      const active = rule.schedule_days?.includes(day);
                      return (
                        <button key={day}
                          onClick={() => {
                            const cur = rule.schedule_days || [...DAYS];
                            onChange({ ...rule, schedule_days: active ? cur.filter(d => d !== day) : [...cur, day] });
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => onChange({ ...rule, schedule_days: [...DAYS] })} className="text-[10px] text-blue-600 hover:underline">All days</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={() => onChange({ ...rule, schedule_days: ['Mon','Tue','Wed','Thu','Fri'] })} className="text-[10px] text-blue-600 hover:underline">Weekdays</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={() => onChange({ ...rule, schedule_days: ['Sat','Sun'] })} className="text-[10px] text-blue-600 hover:underline">Weekends</button>
                  </div>
                </div>

                {/* Status bar */}
                <div className={`rounded-lg p-2 text-[10px] font-semibold flex items-center gap-1.5 ${status.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                  <span>{status.active ? '✅' : '⏸️'}</span>
                  <span>{status.label}</span>
                  <span className="text-slate-400 ml-auto">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            )}

            {!rule.schedule_enabled && (
              <p className="text-[10px] text-slate-400">AI runs 24/7. Enable scheduling to restrict detection to specific hours and days.</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function LoiteringConfig({ model, onSave }: { model: AIModel; onSave: (m: AIModel, d: string) => void }) {
  const parse = (desc: string) => {
    const dm = desc.match(/dwell\s*:\s*(\d+)/i);
    const cm = desc.match(/cooldown\s*:\s*(\d+)/i);
    return { dwell: dm ? parseInt(dm[1]) : 30, cooldown: cm ? parseInt(cm[1]) : 120 };
  };
  const [cfg, setCfg] = useState(() => parse(model.description || ''));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await onSave(model, `Loitering detection model. dwell:${cfg.dwell} cooldown:${cfg.cooldown}`);
    setSaving(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-orange-500 rounded-xl"><Timer size={16} className="text-white" /></div>
        <div>
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">Loitering Detection Model</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Dwell Time Before Alert</p>
          <span className="text-sm font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg">{cfg.dwell}s</span>
        </div>
        <input type="range" min={5} max={300} step={5} value={cfg.dwell}
          onChange={e => setCfg({ ...cfg, dwell: parseInt(e.target.value) })}
          className="w-full accent-orange-500" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>5s</span><span>5 min</span></div>
        <p className="text-[10px] text-slate-500 bg-slate-50 rounded p-1.5 mt-1.5">
          Alert fires when a person remains stationary for <strong>{cfg.dwell} seconds</strong> in the same spot.
        </p>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Alert Cooldown</p>
          <span className="text-sm font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">{cfg.cooldown}s</span>
        </div>
        <input type="range" min={30} max={600} step={30} value={cfg.cooldown}
          onChange={e => setCfg({ ...cfg, cooldown: parseInt(e.target.value) })}
          className="w-full accent-slate-500" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>30s</span><span>10 min</span></div>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : 'Save Loitering Settings'}
      </button>
    </div>
  );
}

function AbandonedObjectConfig({ model, onSave }: { model: AIModel; onSave: (m: AIModel, d: string) => void }) {
  const parse = (desc: string) => {
    const tm = desc.match(/timer\s*:\s*(\d+)/i);
    return { timer: tm ? parseInt(tm[1]) : 2 };
  };
  const [cfg, setCfg] = useState(() => parse(model.description || ''));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await onSave(model, `Abandoned object detection model. timer:${cfg.timer}`);
    setSaving(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-amber-600 rounded-xl"><Package size={16} className="text-white" /></div>
        <div>
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">Abandoned Object Detection Model</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Time Before Alert</p>
          <span className="text-sm font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">{cfg.timer} min</span>
        </div>
        <input type="range" min={1} max={30} value={cfg.timer}
          onChange={e => setCfg({ timer: parseInt(e.target.value) })}
          className="w-full accent-amber-600" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>1 min</span><span>30 min</span></div>
        <p className="text-[10px] text-slate-500 bg-slate-50 rounded p-1.5 mt-1.5">
          Alert fires when a bag/suitcase remains stationary for <strong>{cfg.timer} minutes</strong> with no person nearby. Detects: backpack, handbag, suitcase, umbrella.
        </p>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : 'Save Abandoned Object Settings'}
      </button>
    </div>
  );
}

function IllegalParkingConfig({ model, onSave }: { model: AIModel; onSave: (m: AIModel, d: string) => void }) {
  const parse = (desc: string) => {
    const mm = desc.match(/minutes\s*:\s*(\d+)/i);
    return { minutes: mm ? parseInt(mm[1]) : 5 };
  };
  const [cfg, setCfg] = useState(() => parse(model.description || ''));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await onSave(model, `Illegal parking detection model. minutes:${cfg.minutes}`);
    setSaving(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-blue-600 rounded-xl"><Car size={16} className="text-white" /></div>
        <div>
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">Illegal Parking Detection Model</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Parking Time Limit</p>
          <span className="text-sm font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{cfg.minutes} min</span>
        </div>
        <input type="range" min={1} max={60} value={cfg.minutes}
          onChange={e => setCfg({ minutes: parseInt(e.target.value) })}
          className="w-full accent-blue-600" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>1 min</span><span>60 min</span></div>
        <p className="text-[10px] text-slate-500 bg-slate-50 rounded p-1.5 mt-1.5">
          Alert fires when a vehicle stays stationary for <strong>{cfg.minutes} minutes</strong> in a no-parking zone.
        </p>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : 'Save Parking Settings'}
      </button>
    </div>
  );
}

function PPEConfig({ model, onSave }: { model: AIModel; onSave: (m: AIModel, d: string) => void }) {
  const PPE_ITEMS = [
    { value: 'NO-Hardhat',       label: 'Hard Hat',    icon: '⛑️' },
    { value: 'NO-Safety Vest',   label: 'Safety Vest', icon: '🦺' },
    { value: 'NO-Mask',          label: 'Mask',         icon: '😷' },
    { value: 'NO-Gloves',        label: 'Gloves',       icon: '🧤' },
  ];
  const parse = (desc: string) => {
    const rm = desc.match(/required\s*:\s*([^\n]+)/i);
    return { required: rm ? rm[1].split(',').map(s => s.trim()) : ['NO-Hardhat', 'NO-Safety Vest'] };
  };
  const [cfg, setCfg] = useState(() => parse(model.description || ''));
  const [saving, setSaving] = useState(false);
  const toggle = (v: string) => setCfg(c => ({ required: c.required.includes(v) ? c.required.filter(x => x !== v) : [...c.required, v] }));
  const save = async () => {
    setSaving(true);
    await onSave(model, `PPE compliance model. required:${cfg.required.join(',')}`);
    setSaving(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-emerald-600 rounded-xl"><ShieldAlert size={16} className="text-white" /></div>
        <div>
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">PPE Compliance Model — alert when items are MISSING</p>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Required PPE Items</p>
        <div className="flex flex-wrap gap-2">
          {PPE_ITEMS.map(item => {
            const sel = cfg.required.includes(item.value);
            return (
              <button key={item.value} onClick={() => toggle(item.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${sel ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'}`}>
                <span>{item.icon}</span> {item.label}
                {sel && <span className="text-[10px] bg-white/20 px-1 rounded">Required</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 bg-slate-50 rounded p-1.5 mt-2">
          Alert fires when a person is detected <strong>without</strong> the selected items. Detected by PPE-trained model.
        </p>
      </div>
      <button onClick={save} disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : 'Save PPE Settings'}
      </button>
    </div>
  );
}

function BehaviourInfoCard({ model }: { model: AIModel }) {
  const INFO: Record<string, { icon: string; color: string; what: string; fires: string }> = {
    fight_detection:         { icon: '🥊', color: 'bg-red-500',    what: 'Fight / Aggression',  fires: 'When 2+ persons overlap significantly (IoU > 25%) — indicating a physical altercation.' },
    fall_detection:          { icon: '🚨', color: 'bg-rose-500',   what: 'Fall Detection',       fires: 'When a person\'s bounding box becomes wider than tall — indicating they have fallen.' },
    camera_tamper_detection: { icon: '📵', color: 'bg-slate-600',  what: 'Camera Tamper',        fires: 'When the camera image is very blurry, very dark (covered), or whited-out (spray painted).' },
  };
  const info = INFO[model.model_type] || { icon: '🤖', color: 'bg-slate-500', what: model.model_type, fires: 'Automatic detection — no user threshold required.' };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 ${info.color} rounded-xl`}><Eye size={16} className="text-white" /></div>
        <div>
          <p className="text-sm font-bold text-slate-800">{model.name}</p>
          <p className="text-[10px] text-slate-400">{info.what}</p>
        </div>
        <span className="ml-auto text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Auto-Detect</span>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">When alert fires</p>
        <p className="text-xs text-slate-600">{info.fires}</p>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">This model type fires automatically — no threshold configuration is needed. To adjust sensitivity, change the global confidence threshold.</p>
    </div>
  );
}

export default function AlertConfiguration() {

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [globalRule, setGlobalRule] = useState<AlertRule | null>(null);
  const [cameraRules, setCameraRules] = useState<Record<string, AlertRule>>({});
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [camSaving, setCamSaving] = useState(false);
  const [customObj, setCustomObj] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [activeTab, setActiveTab] = useState<'global' | 'camera' | 'advanced'>('global');
  const [customObjects, setCustomObjects] = useState<{ value: string; label: string; icon: string }[]>([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [camRes, ruleRes, modelRes] = await Promise.all([
      supabase.from('cameras').select('*').order('name'),
      supabase.from('alert_rules').select('*'),
      supabase.from('ai_models').select('*').eq('is_active', true),
    ]);
    if (camRes.data) setCameras(camRes.data);
    if (modelRes.data) setAiModels(modelRes.data);
    if (ruleRes.data) {
      const global = ruleRes.data.find(r => r.camera_id === null);
      if (global) {
        setGlobalRule(global);
      } else {
        const { data: created } = await supabase.from('alert_rules')
          .insert([{ ...DEFAULT_RULE, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
          .select().single();
        if (created) { setGlobalRule(created); toast.info('Created default global rule'); }
      }
      const map: Record<string, AlertRule> = {};
      ruleRes.data.filter(r => r.camera_id).forEach(r => { map[r.camera_id] = r; });
      setCameraRules(map);
    }
    setLoading(false);
  };

  const applyPreset = (key: string) => {
    if (!globalRule) return;
    const p = PRESETS[key];
    setGlobalRule({ ...globalRule, mode: p.mode, enabled_objects: p.enabled_objects, disabled_objects: p.disabled_objects, confidence_threshold: p.confidence_threshold });
    toast.info(`Applied "${p.name}" preset`);
  };

  const saveGlobal = async () => {
    if (!globalRule) return;
    setSaving(true);
    const { error } = await supabase.from('alert_rules').upsert({ ...globalRule, camera_id: null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (!error) {
      // Trigger immediate AI server config reload (skips the 5s wait)
      await supabase.from('system_commands').insert({
        command_type: 'force_refresh',
        status: 'pending',
        payload: { source: 'alert_rules_global' }
      });
    }
    setSaving(false);
    error ? toast.error('Save failed: ' + error.message) : toast.success('✅ Global rules saved! AI server updated instantly.');
  };

  const saveCamera = async () => {
    if (!selectedCameraId) { toast.warning('Select a camera first'); return; }
    const existing = cameraRules[selectedCameraId];
    const rule = existing || { id: crypto.randomUUID(), camera_id: selectedCameraId, ...DEFAULT_RULE, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setCamSaving(true);
    const { error } = await supabase.from('alert_rules').upsert({ ...rule, camera_id: selectedCameraId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    setCamSaving(false);
    if (error) { toast.error('Save failed: ' + error.message); return; }
    // Trigger immediate AI server config reload
    await supabase.from('system_commands').insert({
      command_type: 'force_refresh',
      status: 'pending',
      payload: { source: 'alert_rules_camera', camera_id: selectedCameraId }
    });
    await loadAll();
    toast.success('✅ Camera rules saved! AI server updated instantly.');
  };

  const resetCamera = async () => {
    if (!selectedCameraId) return;
    const { error } = await supabase.from('alert_rules').delete().eq('camera_id', selectedCameraId);
    if (error) { toast.error('Reset failed'); return; }
    const newMap = { ...cameraRules };
    delete newMap[selectedCameraId];
    setCameraRules(newMap);
    toast.success('Camera reset to global rules');
  };

  const saveModelConfig = async (model: AIModel, newDescription: string) => {
    const { error } = await supabase.from('ai_models')
      .update({ description: newDescription, updated_at: new Date().toISOString() })
      .eq('id', model.id);
    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      setAiModels(prev => prev.map(m => m.id === model.id ? { ...m, description: newDescription } : m));
      toast.success(`✅ ${model.name} settings saved! AI server picks up changes within 10s.`);
    }
  };

  const addCustomObject = () => {
    if (!customObj.trim()) return;
    const val = customObj.toLowerCase().replace(/\s+/g, '_');
    setCustomObjects(prev => [...prev, { value: val, label: customObj, icon: '🎯' }]);
    setCustomObj(''); setShowCustom(false);
    toast.success('Custom object added — select it above and save to persist');
  };

  const selectedCam = cameras.find(c => c.id === selectedCameraId);
  const camRule = selectedCameraId ? cameraRules[selectedCameraId] : null;
  const hasOverride = !!camRule;
  const activeCamRule: AlertRule | null = camRule || globalRule;

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <RefreshCw size={22} className="animate-spin mr-3" /> Loading alert configuration...
    </div>
  );

  const allObjectGroups = customObjects.length > 0
    ? [...OBJECT_GROUPS, { label: 'Custom', color: 'slate', objects: customObjects }]
    : OBJECT_GROUPS;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600 rounded-xl shadow-lg shadow-red-600/20">
            <Bell className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Alert Configuration</h1>
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold">AI Detection Rules Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Rules Active
          </div>
          <button onClick={loadAll} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            <RefreshCw size={14} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button onClick={() => setActiveTab('global')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'global' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Globe size={15} /> Global Rules
        </button>
        <button onClick={() => setActiveTab('camera')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'camera' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <CameraIcon size={15} /> Per-Camera
          {Object.keys(cameraRules).length > 0 && (
            <span className="bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{Object.keys(cameraRules).length}</span>
          )}
        </button>
        <button onClick={() => setActiveTab('advanced')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'advanced' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Sliders size={15} /> Advanced
          {aiModels.length > 0 && (
            <span className="bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{aiModels.length}</span>
          )}
        </button>
      </div>

      {/* Global Tab */}
      {activeTab === 'global' && globalRule && (
        <div className="space-y-4">
          {/* Presets */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={15} className="text-amber-500" />
              <h2 className="text-sm font-bold text-slate-800">Quick Presets</h2>
              <span className="text-[10px] text-slate-400 ml-1">Click to apply instantly</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className="p-3 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-xl text-left transition-all group">
                  <div className="text-xl mb-1">{p.icon}</div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-red-700">{p.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                  <div className="text-[9px] text-slate-400 mt-1 font-mono">{(p.confidence_threshold * 100).toFixed(0)}% confidence</div>
                </button>
              ))}
            </div>
          </div>

          {/* Rule Editor */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe size={15} className="text-red-600" />
                <h2 className="text-sm font-bold text-slate-800">Global Detection Rules</h2>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-lg font-semibold">Applies to all cameras</span>
            </div>
            <RuleEditor rule={globalRule} onChange={setGlobalRule} extraGroups={customObjects.length > 0 ? [{ label: 'Custom', color: 'slate', objects: customObjects }] : []} />

            {/* Custom object */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              {showCustom ? (
                <div className="flex gap-2">
                  <input autoFocus value={customObj} onChange={e => setCustomObj(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomObject()}
                    placeholder="Object name (e.g. helmet)" className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500" />
                  <button onClick={addCustomObject} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700">Add</button>
                  <button onClick={() => setShowCustom(false)} className="px-2 py-1.5 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => setShowCustom(true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors">
                  <Plus size={12} /> Add custom object type
                </button>
              )}
            </div>

            <button onClick={saveGlobal} disabled={saving}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20">
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving...' : 'Save Global Rules'}
            </button>
          </div>
        </div>
      )}

      {/* Camera Tab */}
      {activeTab === 'camera' && (
        <div className="space-y-4">
          {/* Camera selector */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <CameraIcon size={15} className="text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800">Select Camera</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {cameras.map(cam => {
                const hasRule = !!cameraRules[cam.id];
                const isSelected = selectedCameraId === cam.id;
                return (
                  <button key={cam.id} onClick={() => setSelectedCameraId(cam.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate">{cam.name}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${hasRule ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {hasRule ? 'CUSTOM' : 'GLOBAL'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">{cam.location}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedCam && activeCamRule && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Settings size={15} className="text-blue-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">{selectedCam.name}</h2>
                    <p className="text-[10px] text-slate-400">{hasOverride ? 'Using custom rules' : 'Inheriting global rules — changes will create a camera override'}</p>
                  </div>
                </div>
                {hasOverride && (
                  <button onClick={resetCamera} className="text-[10px] text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors font-semibold">
                    Reset to Global
                  </button>
                )}
              </div>

              {!hasOverride && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2">
                  <Shield size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">Showing global rules as starting point. Modify and save to create a camera-specific override.</p>
                </div>
              )}

              <RuleEditor
                rule={camRule || { ...globalRule!, camera_id: selectedCameraId }}
                onChange={r => setCameraRules({ ...cameraRules, [selectedCameraId]: r })}
                extraGroups={customObjects.length > 0 ? [{ label: 'Custom', color: 'slate', objects: customObjects }] : []}
              />

              <button onClick={saveCamera} disabled={camSaving}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20">
                {camSaving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                {camSaving ? 'Saving...' : `Save Rules for ${selectedCam.name}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Advanced Tab — per-model behaviour settings */}
      {activeTab === 'advanced' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sliders size={15} className="text-purple-600" />
              <h2 className="text-sm font-bold text-slate-800">Advanced Model Configuration</h2>
            </div>
            <p className="text-[11px] text-slate-400">Fine-tune thresholds for each behaviour model. Saved settings are picked up by the AI server within 10 seconds.</p>
          </div>

          {aiModels.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm font-bold text-slate-700 mb-1">No Advanced Models Deployed</p>
              <p className="text-xs text-slate-400">Add crowd, loitering, abandoned object, PPE or other behaviour models in AI Model Management — they appear here for configuration.</p>
            </div>
          )}

          {aiModels.filter(m => m.model_type === 'crowd_detection').map(m => (
            <CrowdConfig key={m.id} model={m} onSave={saveModelConfig} />
          ))}
          {aiModels.filter(m => m.model_type === 'loitering_detection').map(m => (
            <LoiteringConfig key={m.id} model={m} onSave={saveModelConfig} />
          ))}
          {aiModels.filter(m => m.model_type === 'abandoned_object_detection').map(m => (
            <AbandonedObjectConfig key={m.id} model={m} onSave={saveModelConfig} />
          ))}
          {aiModels.filter(m => m.model_type === 'illegal_parking_detection').map(m => (
            <IllegalParkingConfig key={m.id} model={m} onSave={saveModelConfig} />
          ))}
          {aiModels.filter(m => m.model_type === 'ppe_detection').map(m => (
            <PPEConfig key={m.id} model={m} onSave={saveModelConfig} />
          ))}
          {aiModels.filter(m => ['fight_detection', 'fall_detection', 'camera_tamper_detection'].includes(m.model_type)).map(m => (
            <BehaviourInfoCard key={m.id} model={m} />
          ))}
          {aiModels.filter(m => m.model_type === 'dress_code_detection').map(m => (
            <DressCodeConfig key={m.id} model={m} onSave={saveModelConfig} />
          ))}
          {aiModels.filter(m => ![
            'crowd_detection', 'dress_code_detection', 'loitering_detection',
            'fall_detection', 'fight_detection', 'abandoned_object_detection',
            'illegal_parking_detection', 'ppe_detection', 'camera_tamper_detection',
          ].includes(m.model_type)).map(m => (
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-slate-500 rounded-xl"><Settings size={16} className="text-white" /></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{m.name}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{m.model_type.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Auto-Detect</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Model Active</p>
                <p className="text-xs text-slate-600">
                  This model runs automatically on assigned cameras. No additional threshold configuration is required.
                  {m.description && <span className="block mt-1 text-slate-400 italic">{m.description}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
