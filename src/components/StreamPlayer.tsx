import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Loader } from 'lucide-react';

interface StreamPlayerProps {
  url: string;
  isRecording?: boolean;
  cameraName?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
}

export default function StreamPlayer({
  url,
  isRecording = false,
  cameraName = "Camera",
  className = "",
  autoPlay = true,
  muted = true
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hlsRef = useRef<Hls | null>(null);

  // Recording state
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

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

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8'
      });

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
        const timestamp = new Date().toLocaleString().replace(/[\/, :]/g, '-');

        a.href = downloadUrl;
        a.download = `${cameraName.replace(/\s+/g, '_')}_${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        setIsCapturing(false);
      };

      recorder.start(1000); // Collect data every second
      setIsCapturing(true);
      console.log(`Started recording ${cameraName}`);
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

