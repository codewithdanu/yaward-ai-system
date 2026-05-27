'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { Violation, SEVERITY_COLORS, SEVERITY_DOT, VIOLATION_TYPE_LABELS } from '@/lib/store';
import { useYAWardStore } from '@/lib/store';

interface AlertPreviewProps {
  violation: Violation;
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function AlertPreview({ violation }: AlertPreviewProps) {
  const openAlertModal = useYAWardStore((s) => s.openAlertModal);

  return (
    <button
      id={`alert-preview-${violation.id}`}
      onClick={() => openAlertModal(violation)}
      className={`
        w-full text-left flex items-start gap-3 p-3 rounded-md border transition-colors duration-150
        ${violation.acknowledged
          ? 'bg-slate-50 border-slate-100 opacity-60'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }
      `}
    >
      {/* Severity dot */}
      <div className="mt-0.5 flex-shrink-0">
        <span className={`block w-2 h-2 rounded-full mt-1 ${SEVERITY_DOT[violation.severity]}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${SEVERITY_COLORS[violation.severity]}`}>
            {violation.severity}
          </span>
          <span className="text-xs font-medium text-slate-700 truncate">
            {VIOLATION_TYPE_LABELS[violation.type] || violation.type}
          </span>
        </div>

        <p className="text-xs text-slate-500 truncate">{violation.message}</p>

        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-slate-400 font-mono">{violation.cctv_id}</span>
          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
            <Clock className="w-2.5 h-2.5" />
            {formatTimeAgo(violation.timestamp)}
          </span>
        </div>
      </div>

      {!violation.acknowledged && (
        <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-1" />
      )}
    </button>
  );
}
