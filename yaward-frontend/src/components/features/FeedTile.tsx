'use client';

import { Camera, AlertTriangle, WifiOff, Maximize2, Minimize2, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useYAWardStore } from '@/lib/store';

interface FeedTileProps {
  cameraId: string;
  hasViolation?: boolean;
  onClick?: () => void;
}

export default function FeedTile({ cameraId, hasViolation = false, onClick }: FeedTileProps) {
  const cameras = useYAWardStore((s) => s.cameras);
  const cameraConfig = cameras.find((c) => c.id === cameraId);
  const isOffline = cameraConfig ? cameraConfig.status === 'offline' : false;
  const rtspUrl = cameraConfig?.rtspUrl;

  const [isHovered, setIsHovered] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(!isOffline);

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent trigger parent onClick
    const element = document.getElementById(`feed-tile-${cameraId.replace(/[^a-zA-Z0-9]/g, '-')}`);
    if (!element) return;

    if (!document.fullscreenElement) {
      element.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const element = document.getElementById(`feed-tile-${cameraId.replace(/[^a-zA-Z0-9]/g, '-')}`);
      if (element) {
        setIsFullscreen(document.fullscreenElement === element);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [cameraId]);

  // Poll for fresh frame updates from the backend every 2 seconds
  useEffect(() => {
    if (isOffline) return;

    const interval = setInterval(() => {
      setRetryCounter((prev) => prev + 1);
      setFeedError(false); // Reset error state on retry interval directly
    }, 2000);

    return () => clearInterval(interval);
  }, [isOffline]);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  // Decide whether to stream dynamically or pull static cache frames
  const liveFeedUrl = rtspUrl && !streamError
    ? `${backendUrl}/api/cameras/${cameraId}/stream?rtsp=${encodeURIComponent(rtspUrl)}`
    : `${backendUrl}/api/cameras/${cameraId}/live?t=${retryCounter}`;

  const handleImageError = () => {
    setIsLoading(false);
    if (rtspUrl && !streamError) {
      // Fallback from real-time stream endpoint to static cache
      setStreamError(true);
    } else {
      // Both stream and static cache failed, show standard placeholder
      setFeedError(true);
    }
  };

  return (
    <div
      id={`feed-tile-${cameraId.replace(/[^a-zA-Z0-9]/g, '-')}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative bg-slate-100 rounded-lg overflow-hidden cursor-pointer
        aspect-video border-2 transition-all duration-200
        ${hasViolation ? 'border-red-500' : isOffline ? 'border-slate-200' : 'border-slate-200/60'}
        ${isHovered ? 'ring-2 ring-offset-1 ring-slate-300' : ''}
      `}
    >
      {/* Camera Feed Placeholder */}
      {isOffline ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100">
          <WifiOff className="w-6 h-6 text-slate-400" />
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Signal Lost</p>
        </div>
      ) : (
        <>
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 z-10">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-red-500 rounded-full animate-spin" />
              <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Connecting Feed...</p>
            </div>
          )}

          {/* Real live feed image from backend if active */}
          {!feedError ? (
            <img
              src={liveFeedUrl}
              alt={`Live Feed ${cameraId}`}
              onError={handleImageError}
              onLoad={() => {
                setFeedError(false);
                setIsLoading(false);
              }}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            />
          ) : (
            <>
              {/* Fallback layout: Light slate background */}
              <div className="absolute inset-0 bg-slate-50" />
              
              {/* Camera icon in center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                <Camera className="w-7 h-7 text-slate-300" />
                <p className="text-[10px] text-slate-400 font-mono uppercase">Feed Offline</p>
              </div>
            </>
          )}

          {/* Premium Camera Indicator Overlay */}
          {!feedError && !isLoading && (
            <div className="absolute top-2 left-2.5 bg-black/40 backdrop-blur-[1px] text-[9px] font-mono text-white/90 px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              REC
            </div>
          )}

          {/* Violation flash overlay */}
          {hasViolation && (
            <div className="absolute inset-0 bg-red-500/10 border-2 border-red-500 animate-pulse pointer-events-none" />
          )}
        </>
      )}

      {/* Camera Label Bar */}
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {cameraConfig?.isDangerZone && (
              <div className="flex items-center gap-0.5 bg-red-700/80 rounded px-1 py-0.5 flex-shrink-0">
                <ShieldAlert className="w-2.5 h-2.5 text-red-200" />
                <span className="text-[8px] font-bold text-red-100 uppercase tracking-wide">Danger</span>
              </div>
            )}
            <span className="text-[11px] font-semibold text-white/90 truncate">
              {cameraConfig ? `${cameraConfig.name} – ${cameraConfig.location}` : cameraId}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasViolation && (
              <div className="flex items-center gap-1 bg-red-600 rounded px-1 py-0.5">
                <AlertTriangle className="w-2.5 h-2.5 text-white" />
                <span className="text-[9px] font-bold text-white uppercase tracking-wide">Alert</span>
              </div>
            )}
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOffline ? 'bg-slate-500' : 'bg-green-400 animate-pulse'}`} />
          </div>
        </div>
      </div>

      {/* Fullscreen Button Overlay */}
      {(isHovered || isFullscreen) && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2.5 bg-black/50 hover:bg-black/75 backdrop-blur-[2px] text-white p-1.5 rounded-md transition-all duration-150 z-20 cursor-pointer flex items-center justify-center border border-white/10"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
