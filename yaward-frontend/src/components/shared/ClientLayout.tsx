'use client';

import React, { useEffect } from 'react';
import { useYAWardStore } from '../../lib/store';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import AlertModal from '../features/AlertModal';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isAuthLoading, initializeAuth, user } = useYAWardStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const isLoginPage = pathname === '/login';

  // Perform route shielding and redirects safely inside a useEffect side-effect
  useEffect(() => {
    if (!isAuthLoading) {
      if (!isAuthenticated && !isLoginPage) {
        window.location.href = '/login';
      } else if (isAuthenticated && user?.role === 'staff' && pathname === '/settings') {
        window.location.href = '/';
      }
    }
  }, [isAuthenticated, isAuthLoading, isLoginPage, user, pathname]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen relative bg-slate-50 flex items-center justify-center flex-col gap-4 font-sans overflow-hidden">
        {/* Dynamic Ambient Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100/40 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-100/40 rounded-full blur-[120px]" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-red-500/10 border-t-red-500 rounded-full animate-spin" />
          <span className="text-slate-500 text-xs font-extrabold tracking-widest uppercase animate-pulse">Initializing System...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isLoginPage) {
    return null;
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  // Double-check render-guard for staff accessing admin routes
  if (user?.role === 'staff' && pathname === '/settings') {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden ml-60">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Global Alert Modal */}
      <AlertModal />
    </div>
  );
}
