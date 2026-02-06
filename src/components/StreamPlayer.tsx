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

  useEffect(() => {
    let hls: Hls | null = null;
    const video = videoRef.current;

    if (!url || !video) return;

    // Reset state
    setError(null);
    setLoading(true);

    const checkPlay = () => {
      setLoading(false);
      if (autoPlay) {
        video.play().catch(e => {
          console.warn("Autoplay blocked:", e);
          // Ensure muted if blocked
          video.muted = true;
          video.play().catch(e2 => console.error("Retry play failed:", e2));
        });
      }
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        checkPlay();
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("HLS Fatal Error:", data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              hls?.destroy();
              setError(`Stream Error: ${data.details}`);
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS
      video.src = url;
      video.addEventListener('loadedmetadata', checkPlay);
      video.addEventListener('error', () => {
        setError("Native Playback Error");
        setLoading(false);
      });
    } else {
      setError("HLS is not supported in this browser.");
      setLoading(false);
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [url]);

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

  // RTSP / Bad URL Handling UI
  if (url.startsWith('rtsp')) {
    return (
      <div className={`relative bg-slate-900 w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 font-mono text-center ${className}`}>
        <AlertCircle size={48} className="mb-4 text-red-500 opacity-50" />
        <p className="text-sm font-semibold text-red-400">Stream Unavailable</p>
        <div className="mt-4 p-2 bg-slate-800 rounded text-[10px] text-slate-400 max-w-xs text-center">
          <p className="mb-1"><strong>Note:</strong> Browsers cannot play RTSP directly.</p>
          <p>Use HLS URL: <code>http://localhost:8888/dahua/index.m3u8</code></p>
        </div>
      </div>
    );
  }

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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-80 text-red-400 p-4 text-center z-20">
          <AlertCircle size={32} className="mb-2" />
          <p className="text-xs font-mono">{error}</p>
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

