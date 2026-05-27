'use client';

import { X, CheckCircle2, AlertTriangle, Clock, Camera, Maximize2, Minimize2, ShieldAlert, User, Target, Activity } from 'lucide-react';
import { useYAWardStore, SEVERITY_COLORS, VIOLATION_TYPE_LABELS } from '@/lib/store';
import { acknowledgeAlert } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const VIOLATION_REASON: Record<string, string> = {
  NO_HELMET:  'Worker detected without a hard hat / helmet. Head protection is mandatory in all active zones.',
  NO_VEST:    'Worker detected without a high-visibility safety vest. PPE compliance is required at all times.',
  INTRUSION:  'Person detected inside a restricted danger zone. Immediate evacuation or authorization required.',
  FALL:       'Fall event detected. Worker may be injured and requires immediate assistance.',
  NO_MASK:    'Worker detected without a face mask. Respiratory protection is required in dusty active zones.',
  MACHINERY_PROXIMITY: 'Worker detected near active machinery/vehicle without proper safety cone demarcating the zone.',
};

const VIOLATION_ICON_COLOR: Record<string, string> = {
  NO_HELMET: 'text-orange-500',
  NO_VEST:   'text-yellow-500',
  INTRUSION: 'text-red-500',
  FALL:      'text-purple-500',
  NO_MASK:    'text-blue-500',
  MACHINERY_PROXIMITY: 'text-emerald-500',
};

export default function AlertModal() {
  const { selectedViolation, isAlertModalOpen, closeAlertModal, acknowledgeViolation, cameras } = useYAWardStore();
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [frameTimestamp, setFrameTimestamp] = useState(Date.now());
  const frameContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when violation changes
  useEffect(() => {
    setImageError(false);
    setFrameTimestamp(Date.now());
    setAcknowledged(false);
    setIsFullscreen(false);
  }, [selectedViolation?.id]);

  // Auto-retry every 2s when frame is not yet available
  useEffect(() => {
    if (!isAlertModalOpen || !selectedViolation) return;
    if (!imageError) return;
    const timer = setInterval(() => {
      setImageError(false);
      setFrameTimestamp(Date.now());
    }, 2000);
    return () => clearInterval(timer);
  }, [imageError, isAlertModalOpen, selectedViolation]);

  // Fullscreen API integration
  const toggleFullscreen = async () => {
    const el = frameContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  if (!isAlertModalOpen || !selectedViolation) return null;

  const v = selectedViolation;

  // Metadata from backend (bbox, confidence, zone_name, snapshot_image)
  const meta = v.metadata as Record<string, unknown> | null;
  const personBbox    = meta?.person_bbox as number[] | null;
  const confidence    = meta?.confidence  as number | null;
  const zoneName      = meta?.zone_name   as string | null;
  const snapshotImage = meta?.snapshot_image as string | null;

  // Bounding box dimensions in px for display
  const bboxW = personBbox ? Math.round(personBbox[2] - personBbox[0]) : null;
  const bboxH = personBbox ? Math.round(personBbox[3] - personBbox[1]) : null;

  // Camera info
  const cameraInfo = cameras.find(c => c.id === v.cctv_id);

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);
    try {
      await acknowledgeAlert(v.id, 'supervisor');
      acknowledgeViolation(v.id);
      setAcknowledged(true);
      setTimeout(closeAlertModal, 1200);
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    } finally {
      setIsAcknowledging(false);
    }
  };

  const formattedTimestamp = new Date(v.timestamp).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={closeAlertModal}
        aria-hidden="true"
      />

      {/* Modal — wider to fit detection panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        className="fixed z-50 inset-0 flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-fadeIn">

          {/* ── Header ── */}
          <div className={`px-6 py-4 flex items-center justify-between border-b ${
            v.severity === 'CRITICAL' ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'
          }`}>
            <div className="flex items-center gap-2.5">
              <AlertTriangle className={`w-5 h-5 ${v.severity === 'CRITICAL' ? 'text-red-600' : 'text-orange-600'}`} />
              <h2 id="alert-modal-title" className="text-sm font-semibold text-slate-900">
                Safety Violation Detected
              </h2>
              {cameraInfo?.isDangerZone && (
                <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide animate-pulse">
                  <ShieldAlert className="w-2.5 h-2.5" />
                  Danger Zone
                </span>
              )}
            </div>
            <button
              id="alert-modal-close"
              onClick={closeAlertModal}
              className="p-1 hover:bg-white/60 rounded-md transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">

            {/* Violation Type + Severity row */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${SEVERITY_COLORS[v.severity]}`}>
                {v.severity}
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {VIOLATION_TYPE_LABELS[v.type] || v.type}
              </span>
              <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formattedTimestamp}
              </span>
            </div>

            {/* ── Two-column layout: frame + detection info ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* LEFT: Detection Frame with fullscreen */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Detection Frame
                </p>

                {/* Frame container — fullscreenable */}
                <div
                  ref={frameContainerRef}
                  className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-inner group"
                  style={{ aspectRatio: '16/9' }}
                >
                  {!imageError ? (
                    <img
                      src={snapshotImage || `${backendUrl}/api/cameras/${v.cctv_id}/live?t=${frameTimestamp}`}
                      alt="Detection Visualization"
                      className="w-full h-full object-cover"
                      onError={() => setImageError(true)}
                      onLoad={() => setImageError(false)}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center p-4">
                      <div className="relative">
                        <Camera className="w-7 h-7 text-slate-500" />
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Connecting to live feed…</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">Retrying every 2 seconds</p>
                      </div>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"
                            style={{ animationDelay: `${i * 0.3}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI DETECTION / SNAPSHOT badge */}
                  {!imageError && (
                    <div className="absolute top-2 left-2.5 bg-black/60 backdrop-blur-[2px] text-[9px] font-mono text-white/90 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${snapshotImage ? 'bg-red-500' : 'bg-green-400 animate-ping'}`} />
                      {snapshotImage ? 'VIOLATION SNAPSHOT' : 'AI DETECTION LIVE'}
                    </div>
                  )}

                  {/* Fullscreen toggle button */}
                  <button
                    onClick={toggleFullscreen}
                    className="absolute top-2 right-2.5 bg-black/50 hover:bg-black/75 text-white p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 border border-white/10 backdrop-blur-[2px]"
                    title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-3.5 h-3.5" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Violation flash overlay */}
                  {v.severity === 'CRITICAL' && !imageError && (
                    <div className="absolute inset-0 border-2 border-red-500/60 rounded-xl pointer-events-none animate-pulse" />
                  )}
                </div>

                {/* Camera info below frame */}
                <div className="flex items-center gap-1.5 px-0.5">
                  <Camera className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <p className="text-[11px] text-slate-500 truncate">
                    <span className="font-mono font-semibold text-slate-700">{v.cctv_id}</span>
                    {cameraInfo && (
                      <span className="text-slate-400"> · {cameraInfo.name} – {cameraInfo.location}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* RIGHT: Detection Info Panel */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3 h-3" />
                  Detection Analysis
                </p>

                {/* Why it was triggered */}
                <div className={`rounded-lg p-3 border ${
                  v.severity === 'CRITICAL' ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'
                }`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Violation Reason</p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {VIOLATION_REASON[v.type] || v.message}
                  </p>
                </div>

                {/* Detection message from AI */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">AI Alert Message</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{v.message}</p>
                </div>

                {/* Tracking Data Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Person ID */}
                  <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <div className="flex items-center gap-1 mb-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Tracked ID</p>
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-800">{v.person_id ?? '—'}</p>
                  </div>

                  {/* Confidence */}
                  <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <div className="flex items-center gap-1 mb-1">
                      <Activity className="w-3 h-3 text-slate-400" />
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Confidence</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-800">
                        {confidence != null ? `${Math.round(confidence * 100)}%` : '—'}
                      </p>
                      {confidence != null && (
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${confidence > 0.8 ? 'bg-red-500' : confidence > 0.6 ? 'bg-orange-400' : 'bg-yellow-400'}`}
                            style={{ width: `${Math.round(confidence * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bounding Box */}
                  {bboxW && bboxH && (
                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Bounding Box</p>
                      <p className="text-xs font-mono text-slate-700">{bboxW} × {bboxH} px</p>
                    </div>
                  )}

                  {/* Zone */}
                  {zoneName && (
                    <div className="bg-red-50 rounded-lg p-2.5 border border-red-100">
                      <div className="flex items-center gap-1 mb-1">
                        <ShieldAlert className="w-3 h-3 text-red-400" />
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-red-400">Zone</p>
                      </div>
                      <p className="text-xs font-semibold text-red-700 truncate">{zoneName}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-slate-50/60">
            <button
              id="alert-modal-dismiss"
              onClick={closeAlertModal}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Dismiss
            </button>
            <button
              id="alert-modal-acknowledge"
              onClick={handleAcknowledge}
              disabled={isAcknowledging || v.acknowledged || acknowledged}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                v.acknowledged || acknowledged
                  ? 'bg-green-100 text-green-700 cursor-default border border-green-200'
                  : 'bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60'
              }`}
            >
              {acknowledged || v.acknowledged ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Acknowledged
                </>
              ) : isAcknowledging ? (
                'Acknowledging…'
              ) : (
                'Acknowledge'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
