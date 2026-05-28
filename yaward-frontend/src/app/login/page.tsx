'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useYAWardStore } from '../../lib/store';
import { Eye, EyeOff, Lock, User, AlertTriangle } from 'lucide-react';

export default function LoginPage() {
  const { loginAction, isAuthenticated, isAuthLoading, initializeAuth } = useYAWardStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      window.location.href = '/';
    }
  }, [isAuthenticated, isAuthLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await loginAction(username, password);
      if (res.success) {
        window.location.href = '/';
      } else {
        setError(res.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Something went wrong. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = (userType: 'admin' | 'staff') => {
    if (userType === 'admin') {
      setUsername('admin');
      setPassword('123456');
    } else {
      setUsername('staff');
      setPassword('123456');
    }
    setError('');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-50 font-sans overflow-hidden p-4">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100/40 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-100/40 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        {/* Header Logo & Title */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex p-3 bg-white border border-slate-100 rounded-2xl mb-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
            <Image src="/images/logo.png" width={40} height={40} className="object-contain" alt="YAWard Logo" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            YA<span className="text-red-600">Ward</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">AI-Powered Industrial Safety Portal</p>
        </div>

        {/* Glassmorphic Card Container */}
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/50 rounded-3xl p-8 shadow-xl">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Sign In</h2>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-6 text-red-600 text-sm animate-shake">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-red-500/50 focus:bg-white focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-red-500/50 focus:bg-white focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-600 text-white rounded-xl font-medium text-sm transition-all shadow-[0_4px_20px_rgba(239,68,68,0.2)] focus:outline-none disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                <span>Log In</span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white/80 backdrop-blur-md px-3 text-slate-400 font-semibold tracking-wider">Demo Accounts</span>
            </div>
          </div>

          {/* Quick Demo Login Panels */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleFillDemo('admin')}
              className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-300 transition-all text-left cursor-pointer group"
            >
              <span className="text-xs font-bold text-red-600 mb-0.5 group-hover:text-red-700 transition-colors">Admin Dashboard</span>
              <span className="text-[10px] text-slate-500">Full CRUD & Email Configs</span>
            </button>
            <button
              onClick={() => handleFillDemo('staff')}
              className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-300 transition-all text-left cursor-pointer group"
            >
              <span className="text-xs font-bold text-blue-600 mb-0.5 group-hover:text-blue-700 transition-colors">Staff Monitor</span>
              <span className="text-[10px] text-slate-500">Read-Only + Acknowledge</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
