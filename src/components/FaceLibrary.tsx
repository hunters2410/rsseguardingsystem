import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Users, Upload, Trash2, Plus, RefreshCw, Eye, EyeOff, Save, X, Palette, Check, Camera, AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { supabase, type KnownFace, type KnownFacePhoto, type KnownColorProfile } from '../lib/supabase';
import { toast } from 'sonner';

const ANGLES: { value: KnownFacePhoto['angle']; label: string; tip: string }[] = [
  { value: 'front',         label: 'Front',          tip: 'Looking straight at camera' },
  { value: 'left_45',       label: 'Left 45°',       tip: 'Slight turn to the left' },
  { value: 'right_45',      label: 'Right 45°',      tip: 'Slight turn to the right' },
  { value: 'left_profile',  label: 'Left Profile',   tip: 'Full side view left' },
  { value: 'right_profile', label: 'Right Profile',  tip: 'Full side view right' },
  { value: 'angled_down',   label: 'Camera Angle',   tip: 'Looking up (simulates overhead camera)' },
  { value: 'other',         label: 'Other',          tip: 'Different lighting or expression' },
];

const ROLES = [
  { value: 'employee',    label: 'Employee',    color: 'bg-blue-100 text-blue-700'    },
  { value: 'vip',         label: 'VIP',         color: 'bg-purple-100 text-purple-700' },
  { value: 'contractor',  label: 'Contractor',  color: 'bg-amber-100 text-amber-700'  },
  { value: 'blacklist',   label: 'Blacklist',   color: 'bg-red-100 text-red-700'      },
];

const COLORS_DEF = [
  { name: 'red',    hex: '#ef4444' }, { name: 'orange', hex: '#f97316' },
  { name: 'yellow', hex: '#eab308' }, { name: 'green',  hex: '#22c55e' },
  { name: 'blue',   hex: '#3b82f6' }, { name: 'navy',   hex: '#1e3a8a' },
  { name: 'purple', hex: '#a855f7' }, { name: 'white',  hex: '#f8fafc' },
  { name: 'gray',   hex: '#6b7280' }, { name: 'black',  hex: '#1f2937' },
  { name: 'brown',  hex: '#92400e' }, { name: 'khaki',  hex: '#ca8a04' },
  { name: 'pink',   hex: '#ec4899' },
];

function ColorDots({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {colors.map(c => {
        const def = COLORS_DEF.find(x => x.name === c);
        return (
          <span key={c} title={c}
            className="w-4 h-4 rounded-full border border-white/50 shadow-sm inline-block"
            style={{ background: def?.hex || '#ccc' }} />
        );
      })}
    </div>
  );
}

function ColorPicker({ selected, onChange, label }: { selected: string[]; onChange: (v: string[]) => void; label: string }) {
  const toggle = (n: string) =>
    onChange(selected.includes(n) ? selected.filter(c => c !== n) : [...selected, n]);
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {COLORS_DEF.map(c => {
          const sel = selected.includes(c.name);
          return (
            <button key={c.name} onClick={() => toggle(c.name)} title={c.name}
              className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center ${sel ? 'scale-125 shadow-md' : 'opacity-60 hover:opacity-100'}`}
              style={{ background: c.hex, borderColor: sel ? '#fff' : '#e2e8f0' }}>
              {sel && <Check size={10} className="text-white drop-shadow" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Webcam Capture Modal ──────────────────────────────────────────────────────
function WebcamCapture({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream,   setStream]   = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [camError, setCamError] = useState('');

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
      .then(s => {
        setStream(s);
        if (videoRef.current) { videoRef.current.srcObject = s; }
      })
      .catch(e => setCamError(`Camera unavailable: ${e.message}`));
    return () => { /* cleanup via close() */ };
  }, []);

  const close = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop());
    onClose();
  }, [stream, onClose]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width  = v.videoWidth  || 640;
    c.height = v.videoHeight || 480;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setCaptured(c.toDataURL('image/jpeg', 0.92));
  };

  const usePhoto = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stream?.getTracks().forEach(t => t.stop());
      onCapture(file);
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-4 w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Camera size={15} className="text-blue-600 dark:text-blue-400" /> Take Photo
          </p>
          <button onClick={close} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={16} className="text-slate-400 dark:text-slate-500" />
          </button>
        </div>

        {/* Camera error */}
        {camError && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl p-3 mb-3">
            <p className="text-xs text-red-700 dark:text-red-300 font-semibold">{camError}</p>
            <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">Check that no other app is using the camera, or use Gallery instead.</p>
          </div>
        )}

        {/* Viewfinder */}
        <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3] mb-3 border-2 border-slate-200 dark:border-slate-700">
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className={`w-full h-full object-cover ${captured ? 'hidden' : ''}`}
          />
          {captured && <img src={captured} className="w-full h-full object-cover" alt="captured preview" />}
          <canvas ref={canvasRef} className="hidden" />
          {/* Guide overlay */}
          {!captured && !camError && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-36 h-44 border-2 border-white/60 rounded-full opacity-50" />
            </div>
          )}
        </div>

        {/* Tip */}
        {!captured && (
          <p className="text-[10px] text-slate-400 text-center mb-3">Centre the face in the oval guide, then capture.</p>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!captured ? (
            <button
              onClick={capture}
              disabled={!!camError}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              <Camera size={14} /> Capture
            </button>
          ) : (
            <>
              <button
                onClick={() => setCaptured(null)}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-bold transition-all"
              >
                <RefreshCw size={13} /> Retake
              </button>
              <button
                onClick={usePhoto}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-bold transition-all"
              >
                <Check size={13} /> Use Photo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Known Faces Tab ───────────────────────────────────────────────────────────
// Per-person photo gallery manager
function PhotoGallery({ faceId, faceName: _faceName }: { faceId: string; faceName: string }) {
  const [photos, setPhotos] = useState<KnownFacePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [angle, setAngle] = useState<KnownFacePhoto['angle']>('front');
  const [uploading, setUploading] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('known_face_photos').select('*').eq('known_face_id', faceId).order('created_at')
      .then(({ data }) => { if (data) setPhotos(data as KnownFacePhoto[]); setLoading(false); });
  }, [faceId]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await uploadFiles(files);
    e.target.value = '';
  };

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    let added = 0;
    for (const f of files) {
      try {
        const path = `faces/${faceId}/${crypto.randomUUID()}.${f.name.split('.').pop() || 'jpg'}`;
        const { error: upErr } = await supabase.storage.from('known-faces').upload(path, f);
        if (upErr) throw upErr;
        const { data: u } = supabase.storage.from('known-faces').getPublicUrl(path);
        const { data: row, error } = await supabase.from('known_face_photos')
          .insert([{ known_face_id: faceId, photo_url: u.publicUrl, angle }]).select().single();
        if (error) throw error;
        setPhotos(p => [...p, row as KnownFacePhoto]);
        added++;
      } catch (err: any) { toast.error(`${f.name}: ${err.message}`); }
    }
    if (added > 0) toast.success(`${added} photo${added > 1 ? 's' : ''} added as "${ANGLES.find(a => a.value === angle)?.label}"`);
    setUploading(false);
  };

  const del = async (id: string) => {
    await supabase.from('known_face_photos').delete().eq('id', id);
    setPhotos(p => p.filter(x => x.id !== id));
  };

  const covered = new Set(photos.map(p => p.angle));
  const missing = ANGLES.slice(0, 5).filter(a => !covered.has(a.value));

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Photo Angles ({photos.length}/7)</p>
        {photos.length < 5 && (
          <span className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
            <AlertCircle size={9} /> Need {5 - photos.length} more
          </span>
        )}
        {photos.length >= 5 && <span className="text-[9px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 font-bold px-2 py-0.5 rounded-full">✓ Accurate</span>}
      </div>

      {missing.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-2">
          <p className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold">Missing angles: {missing.map(a => a.label).join(', ')}</p>
          <p className="text-[9px] text-amber-500 dark:text-amber-400 mt-0.5">Add these for 90%+ recognition accuracy</p>
        </div>
      )}

      {loading ? <p className="text-[10px] text-slate-400 dark:text-slate-500">Loading...</p> : (
        <div className="flex flex-wrap gap-2">
          {photos.map(p => (
            <div key={p.id} className="relative group">
              <img src={p.photo_url} className="w-14 h-14 rounded-xl object-cover border-2 border-slate-200 dark:border-slate-700" />
              <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white rounded-b-xl py-0.5">
                {ANGLES.find(a => a.value === p.angle)?.label || p.angle}
              </span>
              <button onClick={() => del(p.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center">
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Angle selector + upload buttons */}
      <div className="space-y-2">
        <select value={angle} onChange={e => setAngle(e.target.value as KnownFacePhoto['angle'])}
          className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/20">
          {ANGLES.map(a => <option key={a.value} value={a.value} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">{a.label} — {a.tip}</option>)}
        </select>
        <div className="flex gap-2">
          <button
            onClick={() => setShowWebcam(true)}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Camera size={12} /> Take Photo
          </button>
          <button
            onClick={() => ref.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            {uploading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
            {uploading ? 'Uploading...' : 'Gallery'}
          </button>
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={upload} />
        </div>
      </div>

      {/* Webcam modal */}
      {showWebcam && (
        <WebcamCapture
          onClose={() => setShowWebcam(false)}
          onCapture={async file => {
            setShowWebcam(false);
            await uploadFiles([file]);
          }}
        />
      )}
    </div>
  );
}

function FacesTab() {
  const [faces, setFaces] = useState<KnownFace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', role: 'employee', department: '', notes: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('known_faces').select('*').order('name');
    if (data) setFaces(data as KnownFace[]);
    setLoading(false);
  };

  const filteredFaces = useMemo(() => {
    return faces.filter(f => {
      const matchSearch = f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.department || '').toLowerCase().includes(search.toLowerCase()) ||
        (f.notes || '').toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'all' || f.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [faces, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredFaces.length / pageSize));
  const paginatedFaces = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFaces.slice(start, start + pageSize);
  }, [filteredFaces, page, pageSize]);

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.warning('Name is required'); return; }
    if (!photoFile) { toast.warning('Upload at least one photo (front face)'); return; }
    setSaving(true);
    try {
      const ext = photoFile.name.split('.').pop();
      const path = `faces/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('known-faces').upload(path, photoFile);
      if (upErr) throw upErr;
      const { data: u } = supabase.storage.from('known-faces').getPublicUrl(path);
      const { data: row, error } = await supabase.from('known_faces').insert([{
        ...form, photo_url: u.publicUrl, is_active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }]).select().single();
      if (error) throw error;
      // Also insert as the first known_face_photo (front angle)
      await supabase.from('known_face_photos').insert([{
        known_face_id: (row as KnownFace).id, photo_url: u.publicUrl, angle: 'front'
      }]);
      toast.success(`✅ ${form.name} added — now add more angle photos for best accuracy`);
      setShowAdd(false);
      setForm({ name: '', role: 'employee', department: '', notes: '' });
      setPhotoFile(null); setPhotoPreview('');
      setExpanded((row as KnownFace).id); // auto-open photo gallery
      load();
    } catch (e: any) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  const toggleActive = async (face: KnownFace) => {
    await supabase.from('known_faces').update({ is_active: !face.is_active, updated_at: new Date().toISOString() }).eq('id', face.id);
    setFaces(prev => prev.map(f => f.id === face.id ? { ...f, is_active: !f.is_active } : f));
    toast.success(face.is_active ? `${face.name} deactivated` : `${face.name} reactivated`);
  };

  const remove = async (face: KnownFace) => {
    if (!confirm(`Remove ${face.name} from face library?`)) return;
    await supabase.from('known_faces').delete().eq('id', face.id);
    setFaces(prev => prev.filter(f => f.id !== face.id));
    toast.success('Removed');
  };

  if (loading) return <div className="py-12 text-center text-slate-400"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl p-3 flex gap-3">
        <span className="text-2xl">🔍</span>
        <div>
          <p className="text-xs font-bold text-blue-800 dark:text-blue-200">Multi-Angle Face Library — Accuracy Guide</p>
          <p className="text-[11px] text-blue-600 dark:text-blue-300 mt-0.5">
            Add <strong>5+ photos per person</strong> from different angles for 90%+ recognition accuracy.
            1 photo ≈ 50% | 3 photos ≈ 75% | 5+ photos ≈ 90%+.
            After adding a person, expand their card to upload angle photos (left, right, overhead, different lighting).
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {ROLES.map(r => {
          const count = faces.filter(f => f.role === r.value && f.is_active).length;
          return (
            <div key={r.value} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center">
              <p className="text-xl font-black text-slate-800 dark:text-white">{count}</p>
              <p className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.color} mt-1`}>{r.label}</p>
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-blue-300 dark:border-blue-600 shadow-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Add Authorized Person</p>
            <button onClick={() => { setShowAdd(false); setPhotoPreview(''); setPhotoFile(null); }}><X size={16} className="text-slate-400 dark:text-slate-500" /></button>
          </div>

          {/* Photo picker — webcam or gallery */}
          <div className="flex items-start gap-4">
            {/* Preview thumbnail */}
            <div
              className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900 shrink-0 relative"
            >
              {photoPreview
                ? <img src={photoPreview} className="w-full h-full object-cover" alt="preview" />
                : <div className="text-center"><Camera size={18} className="text-slate-300 dark:text-slate-600 mx-auto" /><p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">Preview</p></div>
              }
            </div>
            {/* Capture buttons */}
            <div className="flex-1 space-y-2">
              <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={pickPhoto} />
              <button
                type="button"
                onClick={() => setShowWebcam(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                <Camera size={13} /> Take Photo (Webcam)
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors"
              >
                <Upload size={13} /> Choose from Gallery
              </button>
              {photoPreview && (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold text-center">Photo selected — ready to save</p>
              )}
            </div>
          </div>

          {/* Name & Department */}
          <div className="space-y-2">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Full name *" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
            <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="Department (optional)" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
          </div>

          {/* Webcam modal */}
          {showWebcam && (
            <WebcamCapture
              onClose={() => setShowWebcam(false)}
              onCapture={file => {
                setPhotoFile(file);
                setPhotoPreview(URL.createObjectURL(file));
                setShowWebcam(false);
              }}
            />
          )}

          {/* Role */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Role</p>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => setForm({ ...form, role: r.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${form.role === r.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            {form.role === 'blacklist' && (
              <p className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg p-2 mt-2 border border-red-200 dark:border-red-800/60">
                ⚠️ <strong>Blacklist</strong>: An alert will fire EVERY TIME this person's face is detected, even though they are in the library.
              </p>
            )}
          </div>

          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional)" rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500" />

          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Uploading & Saving...' : 'Add to Face Library'}
          </button>
        </div>
      )}

      {/* Search and Role Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, department, or notes..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              roleFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            All Roles ({faces.length})
          </button>
          {ROLES.map(r => {
            const count = faces.filter(f => f.role === r.value).length;
            return (
              <button
                key={r.value}
                onClick={() => setRoleFilter(r.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  roleFilter === r.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {r.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Add button */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all bg-white/50 dark:bg-slate-800/50">
          <Plus size={15} /> Add Person to Face Library
        </button>
      )}

      {/* Face cards grid */}
      {filteredFaces.length === 0 && !showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">👤</div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {search ? 'No matching people found' : 'No authorized faces yet'}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            {search ? 'Try adjusting your search or role filters.' : 'Add employee and VIP photos so the AI can identify authorized people.'}
          </p>
        </div>
      )}
      <div className="space-y-2.5">
        {paginatedFaces.map(face => {
          const roleDef = ROLES.find(r => r.value === face.role);
          const isExpanded = expanded === face.id;
          return (
            <div key={face.id}
              className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-all ${face.is_active ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800 opacity-60'}`}>
              <div className="flex items-center gap-3 p-3">
                <img src={face.photo_url} alt={face.name}
                  className="w-12 h-12 rounded-xl object-cover object-top shrink-0 border border-slate-200 dark:border-slate-700" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{face.name}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleDef?.color}`}>{roleDef?.label}</span>
                    {!face.is_active && <span className="text-[9px] text-slate-400 font-bold">INACTIVE</span>}
                  </div>
                  {face.department && <p className="text-[10px] text-slate-400 dark:text-slate-500">{face.department}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setExpanded(isExpanded ? null : face.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-300 text-[10px] font-bold transition-colors">
                    <Camera size={11} /> Photos
                  </button>
                  <button onClick={() => toggleActive(face)}
                    className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                    {face.is_active ? <Eye size={13} className="text-emerald-600 dark:text-emerald-400" /> : <EyeOff size={13} className="text-slate-400" />}
                  </button>
                  <button onClick={() => remove(face)}
                    className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors">
                    <Trash2 size={13} className="text-red-500" />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <PhotoGallery faceId={face.id} faceName={face.name} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Faces Pagination Footer */}
      {filteredFaces.length > 0 && (
        <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>
              Showing <strong className="text-slate-700 dark:text-slate-200">{((page - 1) * pageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(page * pageSize, filteredFaces.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{filteredFaces.length}</strong> people
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="ml-2 px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <ChevronLeft size={13} />
              <span>Prev</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prevP = arr[idx - 1];
                  const hasGap = prevP && p - prevP > 1;
                  return (
                    <div key={p} className="flex items-center">
                      {hasGap && <span className="px-1 text-slate-400">...</span>}
                      <button
                        onClick={() => setPage(p)}
                        className={`w-6 h-6 rounded-md text-xs font-medium transition ${
                          page === p
                            ? 'bg-blue-600 text-white shadow-sm'
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
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
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

// ── Color Profiles Tab ────────────────────────────────────────────────────────
function ColorProfilesTab() {
  const [profiles, setProfiles] = useState<KnownColorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<KnownColorProfile, 'id' | 'created_at'>>({
    name: '', required_colors: [], prohibited_colors: [], region: 'top', coverage: 0.15, cooldown: 90,
  });

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('known_color_profiles').select('*').order('name');
    if (data) setProfiles(data as KnownColorProfile[]);
    setLoading(false);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.warning('Profile name required'); return; }
    if (!form.required_colors.length && !form.prohibited_colors.length) {
      toast.warning('Select at least one required or prohibited color'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('known_color_profiles').insert([{ ...form, created_at: new Date().toISOString() }]);
    if (error) { toast.error(error.message); } else {
      toast.success(`✅ "${form.name}" profile saved`);
      setShowAdd(false);
      setForm({ name: '', required_colors: [], prohibited_colors: [], region: 'top', coverage: 0.15, cooldown: 90 });
      load();
    }
    setSaving(false);
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" profile?`)) return;
    await supabase.from('known_color_profiles').delete().eq('id', id);
    setProfiles(prev => prev.filter(p => p.id !== id));
    toast.success('Profile deleted');
  };

  if (loading) return <div className="py-12 text-center text-slate-400"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl p-3 flex gap-3">
        <span className="text-2xl">👕</span>
        <div>
          <p className="text-xs font-bold text-purple-800 dark:text-purple-200">How Color Profiles work</p>
          <p className="text-[11px] text-purple-600 dark:text-purple-300 mt-0.5">
            Create saved color rule sets here. Then in <strong>Alert Configuration → Advanced → Dress Code model</strong>,
            your saved profiles can be applied instantly. The AI server scans person crops for the colors defined in these profiles.
          </p>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-purple-300 dark:border-purple-600 shadow-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800 dark:text-white">New Color Profile</p>
            <button onClick={() => setShowAdd(false)}><X size={16} className="text-slate-400 dark:text-slate-500" /></button>
          </div>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Profile name (e.g. Security Guard Uniform)"
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder:text-slate-400 dark:placeholder:text-slate-500" />

          <ColorPicker label="✅ Required Colors (must be wearing)"
            selected={form.required_colors}
            onChange={v => setForm({ ...form, required_colors: v })} />
          <ColorPicker label="🚫 Prohibited Colors (must NOT be wearing)"
            selected={form.prohibited_colors}
            onChange={v => setForm({ ...form, prohibited_colors: v })} />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Body Region</p>
              {(['top', 'bottom', 'full'] as const).map(r => (
                <label key={r} className="flex items-center gap-2 mb-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input type="radio" checked={form.region === r} onChange={() => setForm({ ...form, region: r })} className="accent-purple-600" />
                  <span className="text-xs capitalize">{r === 'top' ? '👕 Upper' : r === 'bottom' ? '👖 Lower' : '🧍 Full'}</span>
                </label>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Coverage</p>
              <span className="text-sm font-black text-purple-700 dark:text-purple-400">{Math.round(form.coverage * 100)}%</span>
              <input type="range" min={0.05} max={0.50} step={0.05} value={form.coverage}
                onChange={e => setForm({ ...form, coverage: parseFloat(e.target.value) })}
                className="w-full accent-purple-600 mt-1" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Cooldown</p>
              <span className="text-sm font-black text-slate-700 dark:text-slate-200">{form.cooldown}s</span>
              <input type="range" min={30} max={600} step={30} value={form.cooldown}
                onChange={e => setForm({ ...form, cooldown: parseInt(e.target.value) })}
                className="w-full accent-slate-500 mt-1" />
            </div>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Color Profile'}
          </button>
        </div>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all bg-white/50 dark:bg-slate-800/50">
          <Plus size={16} /> New Color Profile
        </button>
      )}

      {profiles.length === 0 && !showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="text-5xl mb-3">🎨</div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No color profiles yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Create reusable color rule sets for uniform enforcement, safety compliance, and access control.</p>
        </div>
      )}

      <div className="space-y-3">
        {profiles.map(profile => (
          <div key={profile.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800 dark:text-white">{profile.name}</p>
              <button onClick={() => remove(profile.id, profile.name)}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-red-400 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {profile.required_colors.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1.5">✅ Required</p>
                  <ColorDots colors={profile.required_colors} />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{profile.required_colors.join(', ')}</p>
                </div>
              )}
              {profile.prohibited_colors.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1.5">🚫 Prohibited</p>
                  <ColorDots colors={profile.prohibited_colors} />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{profile.prohibited_colors.join(', ')}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 text-[10px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700">
              <span>Region: <strong className="text-slate-600 dark:text-slate-300 capitalize">{profile.region}</strong></span>
              <span>Coverage: <strong className="text-slate-600 dark:text-slate-300">{Math.round(profile.coverage * 100)}%</strong></span>
              <span>Cooldown: <strong className="text-slate-600 dark:text-slate-300">{profile.cooldown}s</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Unknown Faces Tab ─────────────────────────────────────────────────────────
function UnknownFacesTab() {
  const [unknowns, setUnknowns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [labelModal, setLabelModal] = useState<any | null>(null);
  const [addToModal, setAddToModal] = useState<any | null>(null);
  const [knownFaces, setKnownFaces] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', role: 'employee', department: '' });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchUnknowns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('unknown_faces')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      setUnknowns(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const totalPages = Math.max(1, Math.ceil(unknowns.length / pageSize));
  const paginatedUnknowns = useMemo(() => {
    const start = (page - 1) * pageSize;
    return unknowns.slice(start, start + pageSize);
  }, [unknowns, page, pageSize]);

  const fetchKnownFaces = useCallback(async () => {
    const { data } = await supabase
      .from('known_faces')
      .select('id, name, role, photo_url')
      .eq('is_active', true)
      .order('name');
    setKnownFaces(data || []);
  }, []);

  useEffect(() => { fetchUnknowns(); fetchKnownFaces(); }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(fetchUnknowns, 30000);
    return () => clearInterval(iv);
  }, []);

  const dismiss = async (id: string) => {
    await supabase.from('unknown_faces').update({ status: 'dismissed' }).eq('id', id);
    setUnknowns(prev => prev.filter(u => u.id !== id));
    toast.success('Face dismissed');
  };

  const labelAsNew = async () => {
    if (!labelModal || !form.name.trim()) return;
    setSaving(true);
    try {
      // 1. Create known_faces entry
      const { data: newFace, error: faceErr } = await supabase
        .from('known_faces')
        .insert({
          name: form.name.trim(),
          role: form.role,
          department: form.department.trim() || null,
          photo_url: labelModal.crop_url,
          is_active: true,
        })
        .select()
        .single();
      if (faceErr) throw faceErr;

      // 2. Add crop as known_face_photo
      await supabase.from('known_face_photos').insert({
        known_face_id: newFace.id,
        photo_url: labelModal.crop_url,
        angle: 'other',
      });

      // 3. Mark unknown as labeled
      await supabase.from('unknown_faces').update({
        status: 'labeled',
        labeled_as: newFace.id,
      }).eq('id', labelModal.id);

      setUnknowns(prev => prev.filter(u => u.id !== labelModal.id));
      setLabelModal(null);
      setForm({ name: '', role: 'employee', department: '' });
      toast.success(`Labeled as "${newFace.name}" — AI will now recognize this person`);
      fetchKnownFaces();
    } catch (err: any) {
      toast.error('Label failed: ' + (err.message || err));
    }
    setSaving(false);
  };

  const addToExisting = async (knownFaceId: string) => {
    if (!addToModal) return;
    setSaving(true);
    try {
      // Add as additional photo
      await supabase.from('known_face_photos').insert({
        known_face_id: knownFaceId,
        photo_url: addToModal.crop_url,
        angle: 'other',
      });

      // Mark unknown as labeled
      await supabase.from('unknown_faces').update({
        status: 'labeled',
        labeled_as: knownFaceId,
      }).eq('id', addToModal.id);

      const person = knownFaces.find(f => f.id === knownFaceId);
      setUnknowns(prev => prev.filter(u => u.id !== addToModal.id));
      setAddToModal(null);
      toast.success(`Added as photo for "${person?.name || 'person'}" — improving recognition accuracy`);
    } catch (err: any) {
      toast.error('Add failed: ' + (err.message || err));
    }
    setSaving(false);
  };

  const ROLES = [
    { value: 'employee',   label: 'Employee',   color: 'bg-blue-100 text-blue-700' },
    { value: 'vip',        label: 'VIP',         color: 'bg-purple-100 text-purple-700' },
    { value: 'contractor', label: 'Contractor',  color: 'bg-amber-100 text-amber-700' },
    { value: 'blacklist',  label: 'Blacklist',   color: 'bg-red-100 text-red-700' },
  ];

  const timeAgo = (ts: string) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Unknown Faces Queue</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            These faces were detected but couldn't be matched to anyone in your library.
            Label them to teach the AI for future recognition, or dismiss false positives.
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-800 dark:text-white">{unknowns.length}</span> pending faces
        </p>
        <button onClick={fetchUnknowns}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-10 text-sm text-slate-400 dark:text-slate-500">Loading unknown faces...</div>
      )}

      {/* Empty state */}
      {!loading && unknowns.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No unknown faces pending</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            When the AI detects an unrecognized face, it will appear here for you to label.
          </p>
        </div>
      )}

      {/* Grid of unknown face cards */}
      {!loading && unknowns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {paginatedUnknowns.map(face => (
            <div key={face.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
              {/* Face crop image */}
              <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
                <img src={face.crop_url} alt="Unknown face"
                  className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                  {face.confidence}%
                </div>
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                  📷 {face.camera_name || 'Unknown Camera'}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{timeAgo(face.created_at)}</p>

                {/* Action buttons */}
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => { setLabelModal(face); setForm({ name: '', role: 'employee', department: '' }); }}
                    className="flex-1 py-1.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                    Label
                  </button>
                  <button onClick={() => { setAddToModal(face); fetchKnownFaces(); }}
                    className="flex-1 py-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors">
                    Match
                  </button>
                  <button onClick={() => dismiss(face.id)}
                    className="py-1.5 px-2 text-[10px] font-bold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unknown Faces Pagination Footer */}
      {!loading && unknowns.length > 0 && (
        <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>
              Showing <strong className="text-slate-700 dark:text-slate-200">{((page - 1) * pageSize) + 1}</strong> to <strong className="text-slate-700 dark:text-slate-200">{Math.min(page * pageSize, unknowns.length)}</strong> of <strong className="text-slate-700 dark:text-slate-200">{unknowns.length}</strong> faces
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="ml-2 px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <ChevronLeft size={13} />
              <span>Prev</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prevP = arr[idx - 1];
                  const hasGap = prevP && p - prevP > 1;
                  return (
                    <div key={p} className="flex items-center">
                      {hasGap && <span className="px-1 text-slate-400">...</span>}
                      <button
                        onClick={() => setPage(p)}
                        className={`w-6 h-6 rounded-md text-xs font-medium transition ${
                          page === p
                            ? 'bg-indigo-600 text-white shadow-sm'
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
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Label as New Person Modal ── */}
      {labelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLabelModal(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Label Unknown Face</h3>
              <button onClick={() => setLabelModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Preview */}
            <div className="flex justify-center">
              <img src={labelModal.crop_url} alt="Face"
                className="w-32 h-32 rounded-2xl object-cover border-2 border-slate-200 dark:border-slate-700" />
            </div>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              Camera: {labelModal.camera_name} · Confidence: {labelModal.confidence}%
            </p>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Full Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. John Smith"
                  className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Role</label>
                <div className="flex gap-2 mt-1">
                  {ROLES.map(r => (
                    <button key={r.value} onClick={() => setForm({ ...form, role: r.value })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${
                        form.role === r.value
                          ? `${r.color} border-current`
                          : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Department</label>
                <input type="text" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Security, Management"
                  className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
            </div>

            <button onClick={labelAsNew} disabled={saving || !form.name.trim()}
              className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Save size={15} /> {saving ? 'Saving...' : 'Save to Face Library'}
            </button>
          </div>
        </div>
      )}

      {/* ── Add to Existing Person Modal ── */}
      {addToModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAddToModal(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Match to Existing Person</h3>
              <button onClick={() => setAddToModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Preview */}
            <div className="flex justify-center">
              <img src={addToModal.crop_url} alt="Face"
                className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-200 dark:border-slate-700" />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Select a person to add this face as an additional photo angle.
            </p>

            {/* Known faces list */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {knownFaces.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No known faces in library yet.</p>
              )}
              {knownFaces.map(person => (
                <button key={person.id} onClick={() => addToExisting(person.id)} disabled={saving}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all text-left disabled:opacity-50">
                  <img src={person.photo_url} alt={person.name}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{person.name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{person.role}</p>
                  </div>
                  <Plus size={16} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function FaceLibrary() {
  const [tab, setTab] = useState<'faces' | 'unknown' | 'colors'>('faces');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    supabase.from('unknown_faces').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count || 0));
  }, [tab]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex items-center gap-3">
        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
          <Users className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">Detection Library</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Known Faces & Color Profiles</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-xl p-1 border border-slate-200/50 dark:border-slate-700">
        <button onClick={() => setTab('faces')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'faces' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <Users size={15} /> Known Faces
        </button>
        <button onClick={() => setTab('unknown')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all relative ${tab === 'unknown' ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <AlertCircle size={15} /> Unknown
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
        <button onClick={() => setTab('colors')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'colors' ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <Palette size={15} /> Color Profiles
        </button>
      </div>

      {tab === 'faces'   && <FacesTab />}
      {tab === 'unknown' && <UnknownFacesTab />}
      {tab === 'colors'  && <ColorProfilesTab />}
    </div>
  );
}
