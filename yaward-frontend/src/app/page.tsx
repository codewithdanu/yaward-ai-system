'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import { useYAWardStore } from '@/lib/store';
import StatCard from '@/components/features/StatCard';
import FeedTile from '@/components/features/FeedTile';
import AlertPreview from '@/components/features/AlertPreview';
import CCTVSimulator from '@/components/features/CCTVSimulator';
import Topbar from '@/components/shared/Topbar';
import { useEffect } from 'react';
import {
  ShieldAlert,
  Camera,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function DashboardPage() {
  const { 
    setViolations, 
    setStatistics, 
    setCameras, 
    violations, 
    statistics, 
    openAlertModal, 
    cameras 
  } = useYAWardStore();

  // Fetch cameras dynamically from PostgreSQL backend
  const { data: camerasData, isLoading: camerasLoading } = useSWR(
    '/api/cameras',
    fetcher
  );

  // Sync cameras into Zustand store
  useEffect(() => {
    if (camerasData?.cameras) {
      setCameras(camerasData.cameras);
    }
  }, [camerasData, setCameras]);

  // Fetch statistics every 5s
  const { data: statsData, isLoading: statsLoading } = useSWR(
    '/api/statistics?period=today',
    fetcher,
    { refreshInterval: 5000 }
  );

  // Fetch violations every 2s for real-time feel
  const { data: violationsData, isLoading: alertsLoading } = useSWR(
    '/api/violations?limit=50',
    fetcher,
    { refreshInterval: 2000 }
  );

  // Sync into Zustand store
  useEffect(() => {
    if (violationsData?.violations) {
      setViolations(violationsData.violations);
    }
  }, [violationsData, setViolations]);

  useEffect(() => {
    if (statsData?.statistics) {
      setStatistics(statsData.statistics);
    }
  }, [statsData, setStatistics]);

  const stats = statistics || statsData?.statistics;
  const unacknowledged = violations.filter((v) => !v.acknowledged).length;

  // Determine which cameras have active violations
  const camerasWithViolations = new Set(
    violations.filter((v) => !v.acknowledged).map((v) => v.cctv_id)
  );

  const recentAlerts = violations.slice(0, 8);

  return (
    <div className="h-full flex flex-col">
      <Topbar
        title="Safety Monitoring Dashboard"
        subtitle="Real-time AI surveillance overview"
      />

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* Stats Cards */}
        <section
          id="dashboard-stats"
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatCard
            title="Total Violations"
            value={stats?.total_violations ?? 0}
            icon={ShieldAlert}
            iconColor="text-red-600"
            iconBg="bg-red-50"
            loading={statsLoading}
          />
          <StatCard
            title="Unacknowledged"
            value={unacknowledged}
            icon={AlertTriangle}
            iconColor="text-orange-600"
            iconBg="bg-orange-50"
            loading={statsLoading}
          />
          <StatCard
            title="Active Cameras"
            value={`${cameras.filter(c => c.status === 'online').length} / ${cameras.length}`}
            icon={Camera}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            loading={camerasLoading}
          />
          <StatCard
            title="Today Resolved"
            value={(stats?.total_violations ?? 0) - unacknowledged}
            icon={CheckCircle2}
            iconColor="text-green-600"
            iconBg="bg-green-50"
            loading={statsLoading}
          />
        </section>

        {/* AI CCTV Simulator Panel */}
        <CCTVSimulator />

        {/* Violations Type Breakdown */}
        {stats?.violations_by_type && Object.keys(stats.violations_by_type).length > 0 && (
          <section id="dashboard-breakdown" className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Violations by Type
            </h2>
            <div className="flex flex-wrap gap-4">
              {Object.entries(stats.violations_by_type).map(([type, count]) => {
                const total = stats.total_violations || 1;
                const pct = Math.round(((count as number) / total) * 100);

                return (
                  <div key={type} className="flex-1 min-w-[140px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-600">
                        {type === 'NO_HELMET' ? 'No Helmet' :
                         type === 'NO_VEST' ? 'No Vest' :
                         type === 'INTRUSION' ? 'Intrusion' : type}
                      </span>
                      <span className="text-xs font-semibold text-slate-800">{count as number}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          type === 'INTRUSION' ? 'bg-red-500' :
                          type === 'NO_HELMET' ? 'bg-orange-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Main Content: Camera Grid + Alerts Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Feeds Grid */}
          <section id="dashboard-feeds" className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Live Camera Feeds
              </h2>
              <span className="text-xs text-slate-400">{cameras.length} cameras</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {camerasLoading ? (
                Array.from({ length: cameras.length || 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="bg-slate-200 aspect-video rounded-lg animate-pulse border border-slate-200" />
                    <div className="h-3.5 bg-slate-200 rounded animate-pulse w-24 px-0.5" />
                  </div>
                ))
              ) : (
                cameras.map((c) => (
                  <FeedTile
                    key={c.id}
                    cameraId={c.id}
                    hasViolation={camerasWithViolations.has(c.id)}
                    onClick={() => {
                      const latestViolation = violations.find(
                        (v) => v.cctv_id === c.id && !v.acknowledged
                      );
                      if (latestViolation) openAlertModal(latestViolation);
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* Recent Alerts Panel with fixed height and scrollbar */}
          <aside
            id="dashboard-alerts-panel"
            className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col h-[460px]"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Recent Alerts
              </h2>
              {unacknowledged > 0 && (
                <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full">
                  {unacknowledged} active
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {alertsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-md animate-pulse" />
                ))
              ) : recentAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400 mb-2" />
                  <p className="text-xs text-slate-500">No active violations</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">All clear</p>
                </div>
              ) : (
                recentAlerts.map((v) => (
                  <AlertPreview key={v.id} violation={v} />
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
