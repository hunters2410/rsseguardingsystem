import React, { useState, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { AlertCircle, Loader } from 'lucide-react';

interface StreamPlayerProps {
  url: string;
  isRecording?: boolean;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
}

export default function StreamPlayer({ 
  url, 
  isRecording = false, 
  className = "", 
  autoPlay = true,
  muted = true
}: StreamPlayerProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  // Reset state when URL changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
    setIsLive(false);
  }, [url]);

  const handleError = (e: any) => {
    console.error("Stream Error:", e);
    setHasError(true);
    setIsLoading(false);
  };

  const handleReady = () => {
    setIsLoading(false);
    setIsLive(true);
  };

  const handleBuffer = () => {
    setIsLoading(true);
  };

  const handleBufferEnd = () => {
    setIsLoading(false);
  };

  return (
    <div className={`relative bg-black w-full h-full overflow-hidden ${className}`}>
      {/* Video Player */}
      {!hasError ? (
        <ReactPlayer
          url={url}
          width="100%"
          height="100%"
          playing={autoPlay}
          muted={muted}
          controls={true}
          playsinline={true}
          onError={handleError}
          onReady={handleReady}
          onBuffer={handleBuffer}
          onBufferEnd={handleBufferEnd}
          config={{
            file: {
              forceHLS: url.endsWith('.m3u8'),
              attributes: {
                style: { objectFit: 'cover', width: '100%', height: '100%' }
              }
            }
          }}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900 p-4 font-mono text-center">
          <AlertCircle size={48} className="mb-4 text-red-500 opacity-50" />
          <p className="text-sm">Signal Lost / Offline</p>
          <p className="text-xs text-slate-600 mt-2 max-w-xs truncate">{url}</p>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10 pointer-events-none">
          <Loader className="animate-spin text-white opacity-75" size={32} />
        </div>
      )}

      {/* Live Badge */}
      {isLive && !hasError && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-black bg-opacity-60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-green-400 pointer-events-none z-20">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          LIVE
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
