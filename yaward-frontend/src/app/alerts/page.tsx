'use client';

import useSWR from 'swr';
import { api, deleteViolation, bulkDeleteViolations } from '@/lib/api';
import { useYAWardStore, SEVERITY_COLORS, SEVERITY_DOT, VIOLATION_TYPE_LABELS, Violation } from '@/lib/store';
import Topbar from '@/components/shared/Topbar';
import { useEffect, useState } from 'react';
import { Filter, CheckCircle2, AlertTriangle, Clock, Camera, Trash2, ShieldAlert } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type TabType = 'all' | 'active' | 'acknowledged';
type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AlertsPage() {
  const { violations, setViolations, openAlertModal, acknowledgeViolation, deleteViolationAction, bulkDeleteViolationsAction } = useYAWardStore();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');

  // Pagination & Filtering state
  const [page, setPage] = useState(1);
  const limit = 10;
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selection & Confirmation states
  const [selectedViolationIds, setSelectedViolationIds] = useState<number[]>([]);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Fetch paginated & filtered violations
  const { data: pageData, isLoading, mutate } = useSWR(
    `/api/violations?page=${page}&limit=${limit}` +
    `${startDate ? `&start_date=${startDate}` : ''}` +
    `${endDate ? `&end_date=${endDate}` : ''}` +
    `${severityFilter !== 'ALL' ? `&severity=${severityFilter}` : ''}` +
    `${activeTab === 'active' ? '&acknowledged=false' : activeTab === 'acknowledged' ? '&acknowledged=true' : ''}`,
    fetcher,
    { refreshInterval: 3000 }
  );

  // Sync current page's violations into Zustand (to allow modal etc to read from store if needed)
  useEffect(() => {
    if (pageData?.violations) {
      setViolations(pageData.violations);
    }
  }, [pageData, setViolations]);

  // Fetch overall counts (without page limitation) for tab badges
  const { data: countsData } = useSWR(
    '/api/violations?limit=1000',
    fetcher,
    { refreshInterval: 5000 }
  );

  const totalCount = pageData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;
  const offset = (page - 1) * limit;

  // Compute tab counts
  const allTotal = countsData?.total_count || 0;
  const activeCount = countsData?.violations ? countsData.violations.filter((v: any) => !v.acknowledged).length : 0;
  const acknowledgedCount = countsData?.violations ? countsData.violations.filter((v: any) => v.acknowledged).length : 0;

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allTotal },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'acknowledged', label: 'Acknowledged', count: acknowledgedCount },
  ];

  const severities: SeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  // Handlers
  const handleDeleteSingle = async (id: number) => {
    try {
      await deleteViolation(id);
      deleteViolationAction(id);
      setSelectedViolationIds(prev => prev.filter(vId => vId !== id));
      setIsDeletingId(null);
      mutate();
    } catch (err) {
      console.error("Failed to delete violation:", err);
      alert("Gagal menghapus pelanggaran.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedViolationIds.length === 0) return;
    try {
      await bulkDeleteViolations(selectedViolationIds);
      bulkDeleteViolationsAction(selectedViolationIds);
      setSelectedViolationIds([]);
      setIsBulkDeleting(false);
      mutate();
    } catch (err) {
      console.error("Failed to bulk delete:", err);
      alert("Gagal menghapus beberapa pelanggaran.");
    }
  };

  const handleBulkAcknowledge = async () => {
    if (selectedViolationIds.length === 0) return;
    try {
      const activeViolations = pageData?.violations || [];
      const unackedIds = selectedViolationIds.filter(id => {
        const v = activeViolations.find((x: any) => x.id === id);
        return v && !v.acknowledged;
      });
      if (unackedIds.length > 0) {
        await Promise.all(
          unackedIds.map(id => api.post('/api/acknowledge-alert', { violation_id: id }))
        );
        unackedIds.forEach(id => acknowledgeViolation(id));
      }
      setSelectedViolationIds([]);
      mutate();
    } catch (err) {
      console.error("Failed to bulk acknowledge:", err);
      alert("Gagal mengkonfirmasi pelanggaran.");
    }
  };

  const pageViolations = pageData?.violations || [];

  const handleSelectAll = () => {
    const activeIds = pageViolations.map((v: any) => v.id);
    const allSelected = activeIds.every((id: number) => selectedViolationIds.includes(id));
    if (allSelected) {
      setSelectedViolationIds(prev => prev.filter(id => !activeIds.includes(id)));
    } else {
      setSelectedViolationIds(prev => {
        const unique = new Set([...prev, ...activeIds]);
        return Array.from(unique);
      });
    }
  };

  // Reset page to 1 when filters change
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedViolationIds([]);
  };

  const handleSeverityChange = (sev: SeverityFilter) => {
    setSeverityFilter(sev);
    setPage(1);
    setSelectedViolationIds([]);
  };

  return (
    <div className="h-full flex flex-col relative">
      <Topbar title="Alerts" subtitle="Safety violation alerts, filtering, and logs history" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar + filters */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                id={`alerts-tab-${tab.key}`}
                onClick={() => handleTabChange(tab.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.key
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <div className="flex gap-1">
              {severities.map((s) => (
                <button
                  key={s}
                  id={`alerts-filter-${s.toLowerCase()}`}
                  onClick={() => handleSeverityChange(s)}
                  className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                    severityFilter === s
                      ? 'bg-slate-800 text-white'
                      : s === 'ALL'
                      ? 'text-slate-500 hover:bg-slate-100'
                      : `${SEVERITY_COLORS[s]} hover:opacity-80`
                  }`}
                >
                  {s === 'ALL' ? 'All' : s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Filter & Selection Controls Row */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between gap-4 flex-shrink-0">
          {/* Left: Date filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Filter Tanggal:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-850 focus:outline-none focus:ring-1 focus:ring-slate-300 font-medium"
            />
            <span className="text-xs text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-855 focus:outline-none focus:ring-1 focus:ring-slate-300 font-medium"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-[10px] text-red-650 hover:text-red-750 bg-red-50 hover:bg-red-100/80 px-2 py-1 rounded border border-red-200/80 transition-colors font-semibold"
              >
                Reset
              </button>
            )}
          </div>

          {/* Selection Column Header inside Sub-Bar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pageViolations.length > 0 && pageViolations.every((v: any) => selectedViolationIds.includes(v.id))}
                onChange={handleSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Pilih Semua
              </span>
            </div>

            {selectedViolationIds.length > 0 && (
              <div className="flex items-center gap-2 animate-fadeIn">
                <span className="text-[11px] text-slate-500 font-medium bg-slate-200/60 px-2 py-0.5 rounded">
                  {selectedViolationIds.length} terpilih
                </span>
                {activeTab !== 'acknowledged' && (
                  <button
                    onClick={handleBulkAcknowledge}
                    className="text-[10px] bg-slate-900 hover:bg-slate-850 text-white px-2.5 py-1 rounded transition-colors font-semibold cursor-pointer"
                  >
                    Konfirmasi Aksi
                  </button>
                )}
                <button
                  onClick={() => setIsBulkDeleting(true)}
                  className="text-[10px] bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1 rounded transition-colors font-semibold cursor-pointer"
                >
                  Hapus Terpilih
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Violations List Container */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : pageViolations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20 bg-slate-50/20">
              <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
              <p className="text-sm font-medium text-slate-650">Tidak ada pelanggaran keselamatan ditemukan</p>
              <p className="text-xs text-slate-400 mt-1">
                {activeTab === 'active' ? 'Semua pelanggaran telah berhasil dikonfirmasi!' : 'Silakan sesuaikan filter Anda.'}
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {pageViolations.map((v: Violation) => {
                const isChecked = selectedViolationIds.includes(v.id);
                return (
                  <div
                    key={v.id}
                    id={`alert-row-${v.id}`}
                    className={`
                      bg-white border rounded-lg px-4 py-3 flex items-center gap-3.5 transition-all
                      ${isChecked ? 'border-blue-300 bg-blue-50/10' : 'border-slate-200 hover:border-slate-300 shadow-xs'}
                      ${v.acknowledged ? 'opacity-85' : ''}
                    `}
                  >
                    {/* Row Checkbox */}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedViolationIds(prev =>
                          prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id]
                        );
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                    />

                    {/* Severity dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[v.severity]}`} />

                    {/* Type + Message */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${SEVERITY_COLORS[v.severity]}`}>
                          {v.severity}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 font-sans">
                          {VIOLATION_TYPE_LABELS[v.type] || v.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{v.message}</p>
                    </div>

                    {/* Camera */}
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400 w-24 flex-shrink-0 font-medium">
                      <Camera className="w-3.5 h-3.5 text-slate-300" />
                      <span className="font-mono">{v.cctv_id}</span>
                    </div>

                    {/* Timestamp */}
                    <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 w-36 flex-shrink-0 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      <span>{formatDateTime(v.timestamp)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        id={`alert-detail-${v.id}`}
                        onClick={() => openAlertModal(v)}
                        className="text-xs px-2.5 py-1 border border-slate-200 text-slate-655 rounded hover:bg-slate-50 transition-colors font-medium"
                      >
                        Detail
                      </button>
                      
                      {!v.acknowledged ? (
                        <button
                          id={`alert-ack-${v.id}`}
                          onClick={async () => {
                            try {
                              await api.post('/api/acknowledge-alert', { violation_id: v.id });
                              acknowledgeViolation(v.id);
                              mutate();
                            } catch (err) {
                              console.error('Failed to acknowledge:', err);
                            }
                          }}
                          className="text-xs px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors font-semibold"
                        >
                          Konfirmasi
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-semibold px-2 py-1 bg-green-50 border border-green-150 rounded">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Resolved
                        </span>
                      )}

                      {/* Individual Delete Button */}
                      <button
                        onClick={() => setIsDeletingId(v.id)}
                        className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                        title="Hapus Pelanggaran"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {totalCount > 0 ? (
              <span>
                Menampilkan <strong className="font-semibold">{offset + 1}</strong> -{' '}
                <strong className="font-semibold">{Math.min(offset + limit, totalCount)}</strong> dari{' '}
                <strong className="font-semibold">{totalCount}</strong> pelanggaran
              </span>
            ) : (
              <span>Tidak ada data untuk ditampilkan</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 font-medium">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sebelumnya
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                className="px-3 py-1.5 border border-slate-200 rounded-md text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Single Delete Confirmation Modal */}
      {isDeletingId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden animate-fadeIn animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h2 className="text-sm font-bold text-slate-800">
                Hapus Riwayat Pelanggaran
              </h2>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-650 leading-relaxed">
                Apakah Anda yakin ingin menghapus log pelanggaran keselamatan ini secara permanen?
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 border border-slate-150 p-2.5 rounded">
                Tindakan ini akan menghapus data dari database secara permanen dan tidak dapat dikembalikan.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => setIsDeletingId(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleDeleteSingle(isDeletingId)}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded active:bg-red-800 transition-colors"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden animate-fadeIn animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h2 className="text-sm font-bold text-slate-800">
                Hapus Masal Pelanggaran
              </h2>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-655 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong className="text-red-650 font-bold">{selectedViolationIds.length}</strong> log pelanggaran terpilih secara permanen?
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 border border-slate-150 p-2.5 rounded">
                Semua data terpilih akan dihapus sepenuhnya dari database dan riwayat logs.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => setIsBulkDeleting(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded active:bg-red-800 transition-colors"
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
