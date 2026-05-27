'use client';

import { Bell, ShieldAlert, Check } from 'lucide-react';
import { useYAWardStore } from '@/lib/store';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const violations = useYAWardStore((s) => s.violations);
  const openAlertModal = useYAWardStore((s) => s.openAlertModal);
  const unacknowledged = violations.filter((v) => !v.acknowledged);
  const count = unacknowledged.length;

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const recentAlerts = unacknowledged.slice(0, 5);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-40 relative">
      {/* Page Title */}
      <div>
        <h1 className="text-base font-semibold text-slate-900 leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </div>

        {/* Alert bell dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            id="topbar-alerts-btn"
            onClick={() => setIsOpen(!isOpen)}
            className={`relative p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors ${isOpen ? 'bg-slate-100 text-slate-900' : ''}`}
            aria-label="View alerts"
          >
            <Bell className="w-4 h-4" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>

          {/* Floating Dropdown */}
          {isOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50 animate-fadeIn">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Notifikasi Pelanggaran</span>
                {count > 0 && (
                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                    {count} Baru
                  </span>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {recentAlerts.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                    <Check className="w-6 h-6 text-green-500" />
                    <p className="text-xs font-medium">Semua Aman</p>
                    <p className="text-[10px] text-slate-400">Tidak ada pelanggaran aktif.</p>
                  </div>
                ) : (
                  recentAlerts.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        openAlertModal(v);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50/80 transition-colors flex gap-2.5 items-start"
                    >
                      <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${v.severity === 'CRITICAL' ? 'text-red-500' : 'text-orange-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{v.cctv_id}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{v.message}</p>
                        <p className="text-[9px] text-slate-400 mt-1">
                          {new Date(v.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <Link
                href="/alerts"
                onClick={() => setIsOpen(false)}
                className="block text-center py-2 bg-slate-50 hover:bg-slate-100 border-t border-slate-150 text-[11px] font-semibold text-slate-700 hover:text-slate-900 transition-colors"
              >
                Lihat Semua Pelanggaran →
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
