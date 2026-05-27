'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import Topbar from '@/components/shared/Topbar';
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { BarChart3, Download } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const VIOLATION_COLORS: Record<string, string> = {
  NO_HELMET: '#f97316',
  NO_VEST: '#eab308',
  INTRUSION: '#ef4444',
  FALL: '#8b5cf6',
};

const SEVERITY_COLORS_CHART: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

type Period = 'today' | 'week' | 'month' | 'all';

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('yaward-auth-token');
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      
      const res = await fetch(`${API_BASE_URL}/api/violations/export?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to export reports');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yaward_safety_report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export safety reports:', err);
      alert('Gagal mengekspor laporan CSV. Silakan coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const { data: statsData, isLoading } = useSWR(
    `/api/statistics?period=${period}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const stats = statsData?.statistics;

  // Build chart data
  const byTypeData = stats
    ? Object.entries(stats.violations_by_type || {}).map(([name, value]) => ({ name, value }))
    : [];

  const bySeverityData = stats
    ? Object.entries(stats.violations_by_severity || {}).map(([name, value]) => ({
        name,
        value,
        fill: SEVERITY_COLORS_CHART[name] || '#94a3b8',
      }))
    : [];

  const byCctvData = stats
    ? Object.entries(stats.violations_by_cctv || {}).map(([name, value]) => ({ name, value }))
    : [];

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Last 7 Days' },
    { key: 'month', label: 'Last 30 Days' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <div className="h-full flex flex-col">
      <Topbar title="Reports" subtitle="Safety violation analytics and trends" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Period Selector */}
        <div className="flex items-center gap-2">
          {periods.map((p) => (
            <button
              key={p.key}
              id={`reports-period-${p.key}`}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}

          <div className="ml-auto">
            <button
              id="reports-export-btn"
              onClick={handleExportCsv}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {exporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </>
              )}
            </button>
          </div>
        </div>

        {isLoading ? (
          <>
            {/* Summary numbers skeletons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 animate-pulse">
                  <div className="h-3 bg-slate-200 rounded w-20 mb-2.5" />
                  <div className="h-6 bg-slate-200 rounded w-12" />
                </div>
              ))}
            </div>

            {/* Charts skeletons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5 animate-pulse space-y-4">
                <div className="h-3 bg-slate-200 rounded w-32" />
                <div className="h-[200px] bg-slate-100 rounded-lg" />
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5 animate-pulse space-y-4">
                <div className="h-3 bg-slate-200 rounded w-32" />
                <div className="h-[200px] bg-slate-100 rounded-lg" />
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5 animate-pulse space-y-4 md:col-span-2">
                <div className="h-3 bg-slate-200 rounded w-32" />
                <div className="h-[200px] bg-slate-100 rounded-lg" />
              </div>
            </div>
          </>
        ) : !stats ? (
          <div className="flex flex-col items-center justify-center h-64">
            <BarChart3 className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">No data available for this period.</p>
          </div>
        ) : (
          <>
            {/* Summary numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Violations', value: stats.total_violations, color: 'text-slate-900' },
                { label: 'Unacknowledged', value: stats.unacknowledged, color: 'text-red-600' },
                { label: 'Intrusions', value: stats.violations_by_type?.INTRUSION || 0, color: 'text-red-600' },
                { label: 'PPE Violations', value: (stats.violations_by_type?.NO_HELMET || 0) + (stats.violations_by_type?.NO_VEST || 0), color: 'text-orange-600' },
              ].map((item) => (
                <div key={item.label} className="bg-white border border-slate-200 rounded-lg p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{item.label}</p>
                  <p className={`text-2xl font-semibold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Violations by Type - Bar chart */}
              {byTypeData.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                    Violations by Type
                  </h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byTypeData}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={(v) =>
                        v === 'NO_HELMET' ? 'No Helmet' :
                        v === 'NO_VEST' ? 'No Vest' :
                        v === 'INTRUSION' ? 'Intrusion' : v
                      } />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {byTypeData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={VIOLATION_COLORS[entry.name] || '#94a3b8'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Severity Distribution - Pie Chart */}
              {bySeverityData.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                    Severity Distribution
                  </h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={bySeverityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        nameKey="name"
                      >
                        {bySeverityData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Violations by Camera - Bar chart */}
              {byCctvData.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-5 md:col-span-2">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                    Violations by Camera
                  </h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byCctvData}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#64748b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
