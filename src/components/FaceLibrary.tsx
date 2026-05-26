import { useEffect, useState, useRef, useCallback } from 'react';
import { Users, Upload, Trash2, Plus, RefreshCw, Eye, EyeOff, Save, X, Palette, Check, Camera, AlertCircle } from 'lucide-react';
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
      <div className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-sm mx-4 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Camera size={15} className="text-blue-600" /> Take Photo
          </p>
          <button onClick={close} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Camera error */}
        {camError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
            <p className="text-xs text-red-700 font-semibold">{camError}</p>
            <p className="text-[10px] text-red-500 mt-1">Check that no other app is using the camera, or use Gallery instead.</p>
          </div>
        )}

        {/* Viewfinder */}
        <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3] mb-3 border-2 border-slate-200">
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
    <div className="border-t border-slate-100 pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Photo Angles ({photos.length}/7)</p>
        {photos.length < 5 && (
          <span className="flex items-center gap-1 text-[9px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <AlertCircle size={9} /> Need {5 - photos.length} more
          </span>
        )}
        {photos.length >= 5 && <span className="text-[9px] text-emerald-700 bg-emerald-50 font-bold px-2 py-0.5 rounded-full">✓ Accurate</span>}
      </div>

      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
          <p className="text-[10px] text-amber-700 font-semibold">Missing angles: {missing.map(a => a.label).join(', ')}</p>
          <p className="text-[9px] text-amber-500 mt-0.5">Add these for 90%+ recognition accuracy</p>
        </div>
      )}

      {loading ? <p className="text-[10px] text-slate-400">Loading...</p> : (
        <div className="flex flex-wrap gap-2">
          {photos.map(p => (
            <div key={p.id} className="relative group">
              <img src={p.photo_url} className="w-14 h-14 rounded-xl object-cover border-2 border-slate-200" />
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
          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20">
          {ANGLES.map(a => <option key={a.value} value={a.value}>{a.label} — {a.tip}</option>)}
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
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-xs font-bold rounded-lg transition-colors"
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('known_faces').select('*').order('name');
    if (data) setFaces(data as KnownFace[]);
    setLoading(false);
  };

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
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-3">
        <span className="text-2xl">🔍</span>
        <div>
          <p className="text-xs font-bold text-blue-800">Multi-Angle Face Library — Accuracy Guide</p>
          <p className="text-[11px] text-blue-600 mt-0.5">
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
            <div key={r.value} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-xl font-black text-slate-800">{count}</p>
              <p className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.color} mt-1`}>{r.label}</p>
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border-2 border-blue-300 shadow-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Add Authorized Person</p>
            <button onClick={() => { setShowAdd(false); setPhotoPreview(''); setPhotoFile(null); }}><X size={16} className="text-slate-400" /></button>
          </div>

          {/* Photo picker — webcam or gallery */}
          <div className="flex items-start gap-4">
            {/* Preview thumbnail */}
            <div
              className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0 relative"
            >
              {photoPreview
                ? <img src={photoPreview} className="w-full h-full object-cover" alt="preview" />
                : <div className="text-center"><Camera size={18} className="text-slate-300 mx-auto" /><p className="text-[9px] text-slate-400 mt-1">Preview</p></div>
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
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                <Upload size={13} /> Choose from Gallery
              </button>
              {photoPreview && (
                <p className="text-[9px] text-emerald-600 font-semibold text-center">Photo selected — ready to save</p>
              )}
            </div>
          </div>

          {/* Name & Department */}
          <div className="space-y-2">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Full name *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="Department (optional)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
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
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Role</p>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => setForm({ ...form, role: r.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${form.role === r.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            {form.role === 'blacklist' && (
              <p className="text-[10px] text-red-600 bg-red-50 rounded-lg p-2 mt-2 border border-red-200">
                ⚠️ <strong>Blacklist</strong>: An alert will fire EVERY TIME this person's face is detected, even though they are in the library.
              </p>
            )}
          </div>

          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional)" rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />

          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-bold transition-all">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Uploading & Saving...' : 'Add to Face Library'}
          </button>
        </div>
      )}

      {/* Add button */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl text-sm font-bold text-slate-500 hover:text-blue-600 transition-all">
          <Plus size={16} /> Add Person to Face Library
        </button>
      )}

      {/* Face cards grid */}
      {faces.length === 0 && !showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="text-5xl mb-3">👤</div>
          <p className="text-sm font-bold text-slate-700">No authorized faces yet</p>
          <p className="text-xs text-slate-400 mt-1">Add employee and VIP photos so the AI can identify authorized people.</p>
        </div>
      )}
      <div className="space-y-3">
        {faces.map(face => {
          const roleDef = ROLES.find(r => r.value === face.role);
          const isExpanded = expanded === face.id;
          return (
            <div key={face.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${face.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-center gap-3 p-3">
                <img src={face.photo_url} alt={face.name}
                  className="w-14 h-14 rounded-xl object-cover object-top shrink-0 border border-slate-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 truncate">{face.name}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleDef?.color}`}>{roleDef?.label}</span>
                    {!face.is_active && <span className="text-[9px] text-slate-400 font-bold">INACTIVE</span>}
                  </div>
                  {face.department && <p className="text-[10px] text-slate-400">{face.department}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setExpanded(isExpanded ? null : face.id)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-bold transition-colors">
                    <Camera size={11} /> Photos
                  </button>
                  <button onClick={() => toggleActive(face)}
                    className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    {face.is_active ? <Eye size={13} className="text-emerald-600" /> : <EyeOff size={13} className="text-slate-400" />}
                  </button>
                  <button onClick={() => remove(face)}
                    className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 transition-colors">
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
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex gap-3">
        <span className="text-2xl">👕</span>
        <div>
          <p className="text-xs font-bold text-purple-800">How Color Profiles work</p>
          <p className="text-[11px] text-purple-600 mt-0.5">
            Create saved color rule sets here. Then in <strong>Alert Configuration → Advanced → Dress Code model</strong>,
            your saved profiles can be applied instantly. The AI server scans person crops for the colors defined in these profiles.
          </p>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border-2 border-purple-300 shadow-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">New Color Profile</p>
            <button onClick={() => setShowAdd(false)}><X size={16} className="text-slate-400" /></button>
          </div>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Profile name (e.g. Security Guard Uniform)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />

          <ColorPicker label="✅ Required Colors (must be wearing)"
            selected={form.required_colors}
            onChange={v => setForm({ ...form, required_colors: v })} />
          <ColorPicker label="🚫 Prohibited Colors (must NOT be wearing)"
            selected={form.prohibited_colors}
            onChange={v => setForm({ ...form, prohibited_colors: v })} />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Body Region</p>
              {(['top', 'bottom', 'full'] as const).map(r => (
                <label key={r} className="flex items-center gap-2 mb-1.5 cursor-pointer">
                  <input type="radio" checked={form.region === r} onChange={() => setForm({ ...form, region: r })} className="accent-purple-600" />
                  <span className="text-xs capitalize">{r === 'top' ? '👕 Upper' : r === 'bottom' ? '👖 Lower' : '🧍 Full'}</span>
                </label>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Coverage</p>
              <span className="text-sm font-black text-purple-700">{Math.round(form.coverage * 100)}%</span>
              <input type="range" min={0.05} max={0.50} step={0.05} value={form.coverage}
                onChange={e => setForm({ ...form, coverage: parseFloat(e.target.value) })}
                className="w-full accent-purple-600 mt-1" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Cooldown</p>
              <span className="text-sm font-black text-slate-700">{form.cooldown}s</span>
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
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 hover:border-purple-400 rounded-2xl text-sm font-bold text-slate-500 hover:text-purple-600 transition-all">
          <Plus size={16} /> New Color Profile
        </button>
      )}

      {profiles.length === 0 && !showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="text-5xl mb-3">🎨</div>
          <p className="text-sm font-bold text-slate-700">No color profiles yet</p>
          <p className="text-xs text-slate-400 mt-1">Create reusable color rule sets for uniform enforcement, safety compliance, and access control.</p>
        </div>
      )}

      <div className="space-y-3">
        {profiles.map(profile => (
          <div key={profile.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">{profile.name}</p>
              <button onClick={() => remove(profile.id, profile.name)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {profile.required_colors.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">✅ Required</p>
                  <ColorDots colors={profile.required_colors} />
                  <p className="text-[10px] text-slate-500 mt-1">{profile.required_colors.join(', ')}</p>
                </div>
              )}
              {profile.prohibited_colors.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">🚫 Prohibited</p>
                  <ColorDots colors={profile.prohibited_colors} />
                  <p className="text-[10px] text-slate-500 mt-1">{profile.prohibited_colors.join(', ')}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 text-[10px] text-slate-400 pt-2 border-t border-slate-100">
              <span>Region: <strong className="text-slate-600 capitalize">{profile.region}</strong></span>
              <span>Coverage: <strong className="text-slate-600">{Math.round(profile.coverage * 100)}%</strong></span>
              <span>Cooldown: <strong className="text-slate-600">{profile.cooldown}s</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function FaceLibrary() {
  const [tab, setTab] = useState<'faces' | 'colors'>('faces');

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
          <Users className="text-white" size={18} />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900">Detection Library</h1>
          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold">Known Faces & Color Profiles</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button onClick={() => setTab('faces')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'faces' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Users size={15} /> Known Faces
        </button>
        <button onClick={() => setTab('colors')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'colors' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Palette size={15} /> Color Profiles
        </button>
      </div>

      {tab === 'faces'  && <FacesTab />}
      {tab === 'colors' && <ColorProfilesTab />}
    </div>
  );
}
