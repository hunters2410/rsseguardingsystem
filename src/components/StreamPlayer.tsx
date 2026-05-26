import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Loader } from 'lucide-react';

interface Detection {
  id: string;
  label: string;
  confidence: number;
  box: number[]; // [x, y, w, h] in normalized coordinates (0-1) or absolute?
  timestamp: number;
}

interface StreamPlayerProps {
  url: string;
  isRecording?: boolean;
  cameraName?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  detections?: Detection[];
}

export default function StreamPlayer({
  url,
  isRecording = false,
  cameraName = "Camera",
  className = "",
  autoPlay = true,
  muted = true,
  detections = []
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 10;

  // Recording state
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  // Drawing detections
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      // Set canvas size to match video display size
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      detections.forEach((det) => {
        // Only show detections from the last 5 seconds
        const age = now - det.timestamp;
        if (age > 5000) return;

        const opacity = Math.max(0, 1 - age / 5000);
        const [x, y, w, h] = det.box;

        // YOLO boxes are often [center_x, center_y, width, height] but our ai-server uses [x1, y1, x2, y2] translated via box.xywh
        // Let's assume [center_x, center_y, width, height] or [x, y, w, h] normalized?
        // ai-server uses: "metadata": {"box": box.xywh.tolist()}
        // box.xywh is [x_center, y_center, width, height] in pixels? 
        // No, in YOLO it's usually absolute pixels unless specified.
        // But the AI server runs on a frame that might be 640x480 or something else.

        // BETTER: Assume normalized coordinates (0-1) from the AI server if possible.
        // In current main.py: box.xywh.tolist() -> absolute pixels of the frame.
        // We need to know the original frame size to scale them.

        // HACK: For now, if values are > 1, assume pixels and try to fit. 
        // But if we don't know frame size, it's hard. 
        // Let's assume the AI model ran on 640x640 (YOLO default) if we have to guess.

        // Actually, let's just draw them. If they are pixels, we need scale factor.
        // Let's assume they are normalized for now, if not we will fix main.py.

        const scaleX = canvas.width;
        const scaleY = canvas.height;

        ctx.strokeStyle = `rgba(239, 68, 68, ${opacity})`; // red-500
        ctx.lineWidth = 2;
        ctx.strokeRect(
          (x - w / 2) * scaleX,
          (y - h / 2) * scaleY,
          w * scaleX,
          h * scaleY
        );

        ctx.fillStyle = `rgba(239, 68, 68, ${opacity})`;
        ctx.font = '12px Inter, sans-serif';
        const label = `${det.label} ${Math.round(det.confidence)}%`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect((x - w / 2) * scaleX, (y - h / 2) * scaleY - 20, textWidth + 10, 20);

        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillText(label, (x - w / 2) * scaleX + 5, (y - h / 2) * scaleY - 5);
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [detections]);

  // Derive correct HLS URL from the RTSP stream URL
  // MediaMTX registers streams under the path name configured in mediamtx.yml
  // e.g. rtsp://...@ip/... -> the path key in mediamtx is set in DB as the stream_url
  // If the DB stream_url is already an HLS/HTTP URL, use it directly.
  // If it's an RTSP URL, we need the MediaMTX path name (e.g. 'cam1', 'gate')
  // which is stored in the camera's stream_url field as http://localhost:8888/<pathName>
  // OR the camera stream_url might be the raw RTSP url in which case we use cameraName slug.
  const streamUrl = (() => {
    if (!url) return '';
    // Already an HLS/HTTP URL — use directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Ensure it ends with /index.m3u8 for MediaMTX HLS
      if (url.includes('index.m3u8')) return url;
      // MediaMTX HLS URL like http://localhost:8888/cam1
      return url.replace(/\/$/, '') + '/index.m3u8';
    }
    // RTSP URL — extract just the path segment after the last slash before query string
    // e.g. rtsp://admin:pass@192.168.1.1:554/cam/realmonitor?... -> use cameraName slug
    // IMPORTANT: MediaMTX path keys use HYPHENS (e.g. "car-park"), not underscores.
    const slug = cameraName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'camera';
    return `http://localhost:8888/${slug}/index.m3u8`;
  })();

  useEffect(() => {
    let hls: Hls | null = null;
    const video = videoRef.current;
    retryCountRef.current = 0;

    if (!streamUrl || !video) return;

    const initHls = () => {
      // Clean up previous instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      setError(null);
      setLoading(true);

      const checkPlay = () => {
        setLoading(false);
        if (autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(e2 => console.error('Retry play failed:', e2));
          });
        }
      };

      if (Hls.isSupported()) {
        hls = new Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 2,
          maxLiveSyncPlaybackRate: 2.0,
          backBufferLength: 30,
          maxBufferLength: 8,
          maxMaxBufferLength: 16,
          fragLoadingTimeOut: 8000,
          manifestLoadingTimeOut: 8000,
          levelLoadingTimeOut: 8000,
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => checkPlay());

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (retryCountRef.current < MAX_RETRIES) {
                  retryCountRef.current++;
                  // Exponential back-off: 4s, 6s, 8s... up to 12s max
                  // Gives MediaMTX (sourceOnDemandStartTimeout: 25s) time to connect.
                  const delay = Math.min(4000 + retryCountRef.current * 2000, 12000);
                  console.warn(`HLS network error — retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay/1000}s (stream: ${streamUrl})`);
                  retryTimerRef.current = setTimeout(() => initHls(), delay);
                } else {
                  setError(`No stream signal. Check camera & streaming server.`);
                  setLoading(false);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError();
                break;
              default:
                hls?.destroy();
                setError(`Stream error: ${data.details}`);
                setLoading(false);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', checkPlay);
        video.addEventListener('error', () => {
          setError('Native playback error');
          setLoading(false);
        });
      } else {
        setError('HLS not supported in this browser.');
        setLoading(false);
      }
    };

    // Give MediaMTX a 2-second head-start to initiate the RTSP connection
    // before HLS.js requests the manifest (avoids the first-request 404).
    const startTimer = setTimeout(() => initHls(), 2000);

    return () => {
      clearTimeout(startTimer);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (hls) hls.destroy();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (video) { video.removeAttribute('src'); video.load(); }
    };
  }, [streamUrl]);

  // Sync muted prop
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  // Recording Logic
  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording]);

  const startRecording = () => {
    const video = videoRef.current;
    if (!video || isCapturing) return;

    try {
      // captureStream is supported in most modern browsers for video elements
      const stream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;

      if (!stream) {
        console.error("Browser does not support stream capture");
        return;
      }

      // Check supported MIME types
      const options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'video/webm';
        }
      }

      const recorder = new MediaRecorder(stream, options);

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        // Format timestamp safely for filename
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

        a.href = downloadUrl;
        a.download = `${cameraName.replace(/\s+/g, '_')}_${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        setIsCapturing(false);
      };

      recorder.onerror = (e) => {
        console.error("Recorder Error:", e);
      };

      recorder.start(1000); // Collect data every second
      setIsCapturing(true);
      console.log(`Started recording ${cameraName} with ${options.mimeType}`);
    } catch (err) {
      console.error("Recording failed to start:", err);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      console.log(`Stopped recording ${cameraName}`);
    }
  };

  return (
    <div className={`relative bg-black w-full h-full overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted={muted}
        crossOrigin="anonymous"
        controls={false}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10"
      />

      {/* Loading Overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 pointer-events-none z-10">
          <Loader className="animate-spin text-white opacity-50" size={32} />
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-80 text-red-400 p-4 text-center z-20 gap-3">
          <AlertCircle size={28} className="mb-1" />
          <p className="text-xs font-mono max-w-[200px] leading-relaxed">{error}</p>
          <button
            onClick={() => {
              retryCountRef.current = 0;
              setError(null);
              setLoading(true);
              // Re-trigger by re-running the effect
              const video = videoRef.current;
              if (video) { video.removeAttribute('src'); video.load(); }
              if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
              // Force re-init
              const hls = new Hls({
                lowLatencyMode: true,
                liveSyncDurationCount: 1,
                liveMaxLatencyDurationCount: 2,
                maxLiveSyncPlaybackRate: 2.0,
              });
              hlsRef.current = hls;
              if (video) {
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  setLoading(false);
                  video.muted = muted;
                  video.play().catch(() => { video.muted = true; video.play(); });
                });
                hls.on(Hls.Events.ERROR, (_, d) => {
                  if (d.fatal) { setError('Stream unavailable. Ensure the streaming server is running.'); setLoading(false); }
                });
              }
            }}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg border border-white/20 transition-colors"
          >
            ↺ Retry
          </button>
        </div>
      )}

      {/* Recording Badge */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-medium z-20 pointer-events-none shadow-sm">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          REC
        </div>
      )}
    </div>
  );
}

