'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useYAWardStore } from '../../lib/store';
import {
  LayoutDashboard,
  Camera,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logoutAction } = useYAWardStore();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    // Show Live Feeds / CCTV management only for admin
    ...(user?.role === 'admin' ? [{ name: 'Live Feeds', href: '/feeds', icon: Camera }] : []),
    { name: 'Alerts', href: '/alerts', icon: Bell },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    // Show Settings only for admin
    ...(user?.role === 'admin' ? [{ name: 'Settings', href: '/settings', icon: Settings }] : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-slate-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-200">
        <div className="flex items-center justify-center w-8 h-8 bg-red-600 rounded-lg">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-slate-900 tracking-tight">YAWard</span>
          <p className="text-[10px] text-slate-400 leading-none mt-0.5">AI Safety Monitor</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-red-600' : ''}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User profile footer */}
      {user && (
        <div className="px-4 py-4 border-t border-slate-200 bg-slate-50/50 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-600/10 border border-red-500/20 text-red-600 flex items-center justify-center font-bold text-sm uppercase">
              {user.username.substring(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user.username}</p>
              <div className="flex items-center mt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                  user.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={logoutAction}
            className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-md hover:bg-red-50/50 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
        </div>
      )}

      {/* System Status Footer */}
      <div className="px-4 py-3 border-t border-slate-200">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          System Online
        </div>
        <p className="text-[10px] text-slate-300 mt-1">YAWard v1.0 MVP</p>
      </div>
    </aside>
  );
}
