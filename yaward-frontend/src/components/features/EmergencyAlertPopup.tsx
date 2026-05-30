'use client';

import React, { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useYAWardStore } from '@/lib/store';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function EmergencyAlertPopup() {
  const { setViolations } = useYAWardStore();
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeWebAudioIntervalRef = useRef<any>(null);
  const latestSeenIdRef = useRef<number | null>(null);

  // Fetch violations every 2s for real-time feel globally
  const { data: violationsData } = useSWR(
    '/api/violations?limit=50',
    fetcher,
    { refreshInterval: 2000 }
  );

  const stopAlarm = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (activeWebAudioIntervalRef.current) {
      clearInterval(activeWebAudioIntervalRef.current);
      activeWebAudioIntervalRef.current = null;
    }
    setActiveAlert(null);
  };

  const startAlarm = (violation: any) => {
    stopAlarm();
    setActiveAlert(violation);

    try {
      const audio = new Audio('/sounds/alarm.mp3');
      audio.volume = 0.8;
      audio.loop = true;
      activeAudioRef.current = audio;
      
      audio.play().catch(() => {
        // Fallback: Web Audio API Looping Beep Alarm
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        
        const audioCtx = new AudioContextClass();
        const playBeep = (freq: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          
          gain.gain.setValueAtTime(0, audioCtx.currentTime);
          gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
          
          osc.start();
          osc.stop(audioCtx.currentTime + duration);
        };
        
        // Play dual beep every 1.5 seconds
        const runWebAudioAlarm = () => {
          playBeep(880, 0.15);
          setTimeout(() => playBeep(880, 0.15), 220);
        };
        
        runWebAudioAlarm();
        activeWebAudioIntervalRef.current = setInterval(runWebAudioAlarm, 1500);
      });
    } catch (err) {
      console.error('Audio context failure:', err);
    }
  };

  // Sync into Zustand store & trigger warning sound on new high/critical violations
  useEffect(() => {
    if (violationsData?.violations) {
      const newViolations = violationsData.violations;
      
      // If we already have seen some violations before
      if (latestSeenIdRef.current !== null) {
        // Find any violations that have an ID higher than our latest seen ID
        const unacknowledgedCriticalNewOnes = newViolations.filter((v: any) => {
          const isNew = v.id > (latestSeenIdRef.current || 0);
          const isCriticalOrHigh = v.severity === 'CRITICAL' || v.severity === 'HIGH';
          const isUnacknowledged = !v.acknowledged;
          return isNew && isCriticalOrHigh && isUnacknowledged;
        });

        if (unacknowledgedCriticalNewOnes.length > 0) {
          startAlarm(unacknowledgedCriticalNewOnes[0]);
        }
      }
      
      // Update the latest seen ID
      if (newViolations.length > 0) {
        const maxId = Math.max(...newViolations.map((v: any) => v.id));
        latestSeenIdRef.current = maxId;
      } else {
        latestSeenIdRef.current = 0;
      }
      
      // Also sync violations list to the store so other components stay updated
      setViolations(newViolations);
    }
  }, [violationsData, setViolations]);

  // Clean up alarm loops on component unmount
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      if (activeWebAudioIntervalRef.current) {
        clearInterval(activeWebAudioIntervalRef.current);
      }
    };
  }, []);

  if (!activeAlert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-white border-2 border-red-500 rounded-2xl shadow-2xl p-6 text-center space-y-5 animate-scaleUp overflow-hidden">
        {/* Danger Background Pulse Glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 via-transparent to-transparent pointer-events-none" />
        
        {/* Pulsing Alarm Icon */}
        <div className="relative mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <ShieldAlert className="w-9 h-9 text-red-600 animate-bounce" />
        </div>

        <div className="space-y-2">
          <h3 className="text-md font-bold text-red-600 uppercase tracking-wider animate-pulse">
            PERINGATAN BAHAYA DETEKSI K3
          </h3>
          <p className="text-[10px] font-bold text-slate-500 bg-slate-100 py-1 px-3 rounded-full inline-block">
            CCTV: {activeAlert.cctv_id} • Severity: {activeAlert.severity}
          </p>
        </div>

        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-left space-y-1">
          <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide block">
            Deskripsi Pelanggaran:
          </span>
          <p className="text-xs text-red-950 font-bold leading-relaxed">
            {activeAlert.message}
          </p>
          <span className="text-[9px] text-slate-400 block pt-1.5 font-mono">
            Waktu: {new Date(activeAlert.timestamp).toLocaleString()}
          </span>
        </div>

        {/* Mute Alarm Button */}
        <button
          onClick={stopAlarm}
          className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-500/20 hover:shadow-red-500/35 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
        >
          <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping group-hover:scale-110" />
          MATIKAN ALARM & AKUI
        </button>
      </div>
    </div>
  );
}
