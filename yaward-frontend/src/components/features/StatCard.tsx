import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = 'text-slate-600',
  iconBg = 'bg-slate-100',
  trend,
  trendUp,
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-5 animate-pulse">
        <div className="h-3 bg-slate-200 rounded w-24 mb-4" />
        <div className="h-7 bg-slate-200 rounded w-16" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1.5">{value}</p>
          {trend && (
            <p className={`text-xs mt-1.5 font-medium ${trendUp ? 'text-red-600' : 'text-green-600'}`}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}
