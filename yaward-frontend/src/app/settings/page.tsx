'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api, fetchEmailSettings, saveEmailSettings } from '../../lib/api';
import { useYAWardStore } from '../../lib/store';
import Topbar from '@/components/shared/Topbar';
import { Mail, Plus, X, ShieldAlert, CheckCircle2, Users, UserCheck } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function SettingsPage() {
  const { user } = useYAWardStore();
  const [emails, setEmails] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [inputError, setInputError] = useState('');
  
  // SWR to fetch saved email settings
  const { data, error, isLoading, mutate } = useSWR('/api/settings/emails', () =>
    fetchEmailSettings().then((res) => res.data)
  );

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Sync settings when data loaded
  useEffect(() => {
    if (data?.emails) {
      setEmails(data.emails);
    }
  }, [data]);

  // Check if admin is currently viewing
  if (user?.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white p-8 rounded-xl border border-red-200 text-center max-w-md shadow-sm">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Access Denied</h2>
          <p className="text-slate-500 mt-2 text-sm">
            Only administrators are authorized to access notification configuration settings.
          </p>
        </div>
      </div>
    );
  }

  const handleAddCustomEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError('');

    const cleanEmail = customInput.trim().toLowerCase();
    if (!cleanEmail) return;

    // Simple email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setInputError('Format email tidak valid');
      return;
    }

    if (emails.includes(cleanEmail)) {
      setInputError('Email sudah ada dalam daftar');
      return;
    }

    setEmails([...emails, cleanEmail]);
    setCustomInput('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter((e) => e !== emailToRemove));
    setSaveSuccess(false);
  };

  const handleToggleStaffEmail = (staffEmail: string) => {
    setSaveSuccess(false);
    if (emails.includes(staffEmail)) {
      setEmails(emails.filter((e) => e !== staffEmail));
    } else {
      setEmails([...emails, staffEmail]);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError('');

    try {
      await saveEmailSettings(emails);
      setSaveSuccess(true);
      mutate();
      // Hide success banner after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save email settings:', err);
      setSaveError(err.response?.data?.error || 'Gagal menyimpan pengaturan email.');
    } finally {
      setSaving(false);
    }
  };

  const staffList = data?.available_staff_emails || [];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <Topbar
        title="Notification Settings"
        subtitle="Manage safety alert recipient list (emails)"
      />

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl space-y-6">
        {/* Status Alerts */}
        {saveSuccess && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-500" />
            <span className="text-sm font-semibold">Email recipient settings saved successfully!</span>
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl animate-shake">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 text-red-500" />
            <span className="text-sm font-semibold">{saveError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Form Settings */}
          <div className="md:col-span-2 space-y-6">
            {/* Custom email add card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-500" />
                Add Custom Recipient Email
              </h2>
              <p className="text-xs text-slate-400">
                Type individual custom email addresses to receive safety violation warnings (HIGH and CRITICAL).
              </p>

              <form onSubmit={handleAddCustomEmail} className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="e.g. manager@corp.com"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 font-sans"
                  />
                  {inputError && (
                    <p className="text-[10px] text-red-500 font-semibold mt-1 pl-1">{inputError}</p>
                  )}
                </div>
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 h-fit cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </form>
            </div>

            {/* Email Recipients list overview */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Recipients List ({emails.length})</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Active recipient list configured for SMTP alerts.</p>
                </div>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving || isLoading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Config</span>
                  )}
                </button>
              </div>

              {isLoading ? (
                <div className="py-8 text-center space-y-2.5">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">Loading settings...</p>
                </div>
              ) : emails.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-xl text-center">
                  <Mail className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-semibold">No emails configured</p>
                  <p className="text-[10px] text-slate-400 mt-1">Alerts will fall back to environment recipient lists.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-2">
                  {emails.map((email) => {
                    const isStaff = staffList.includes(email);
                    return (
                      <div
                        key={email}
                        className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs border ${
                          isStaff
                            ? 'bg-blue-50 border-blue-200 text-blue-800'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <span className="font-mono">{email}</span>
                        {isStaff && (
                          <span className="text-[9px] font-bold uppercase bg-blue-100 px-1 py-0.2 rounded text-blue-700 scale-90">
                            Staff
                          </span>
                        )}
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          className="hover:bg-slate-200/60 p-0.5 rounded-full transition-colors"
                        >
                          <X className="w-3 h-3 text-slate-500 hover:text-red-500" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Registered Staff Quick List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-fit space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Registered Staff Accounts
            </h2>
            <p className="text-xs text-slate-400">
              Select or deselect accounts from registered staff list to add them as SMTP alert recipients.
            </p>

            {isLoading ? (
              <div className="space-y-2 py-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse w-full" />
                ))}
              </div>
            ) : staffList.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <p className="text-xs font-semibold">No registered staff</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {staffList.map((email: string) => {
                  const isSelected = emails.includes(email);
                  return (
                    <button
                      key={email}
                      onClick={() => handleToggleStaffEmail(email)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/55 border-blue-300 text-blue-900 font-semibold'
                          : 'border-slate-100 bg-slate-50/20 text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <span className="truncate pr-2 font-mono">{email}</span>
                      {isSelected ? (
                        <UserCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
