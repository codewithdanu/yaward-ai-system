'use client';

import React, { useState, useRef } from 'react';
import { Camera, Upload, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { uploadAndAnalyzeFrame } from '@/lib/api';
import { useYAWardStore } from '@/lib/store';

export default function CCTVSimulator() {
  const cameras = useYAWardStore((s) => s.cameras);
  const [selectedCamera, setSelectedCamera] = useState(cameras[0]?.id || 'CCTV-001');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setError(null);
      setResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.type.startsWith('image/')) {
        setFile(droppedFile);
        setPreviewUrl(URL.createObjectURL(droppedFile));
        setError(null);
        setResult(null);
      } else {
        setError('Hanya file gambar yang diperbolehkan (.jpg, .png, etc.)');
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Pilih gambar terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await uploadAndAnalyzeFrame(file, selectedCamera);
      setResult(response.data);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Gagal mengirim gambar.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
    setResult(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-500" />
          AI CCTV Frame Simulator
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Simulasikan CCTV dengan mengunggah gambar riil untuk dianalisis oleh YOLOv8 PPE detector
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left column: Controls */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pilih Kamera CCTV
            </label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              disabled={loading}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:opacity-50"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-semibold text-white transition-all
                ${loading || !file 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }
              `}
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menganalisis...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Kirim & Analisis
                </>
              )}
            </button>

            {file && !loading && (
              <button
                onClick={resetForm}
                className="py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded text-xs font-medium"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Middle column: Image Dropzone / Preview */}
        <div className="md:col-span-2">
          <div className="space-y-1 h-full flex flex-col">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Unggah Frame Gambar (CCTV Capture)
            </span>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {previewUrl ? (
              <div className="relative border border-slate-200 rounded bg-slate-950 flex-1 min-h-[140px] flex items-center justify-center overflow-hidden aspect-video">
                <img
                  src={previewUrl}
                  alt="CCTV Preview"
                  className="object-contain max-h-[160px] w-full h-full opacity-90"
                />
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[10px] font-mono">
                  {file?.name} ({(file!.size / 1024).toFixed(1)} KB)
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded bg-slate-50 hover:bg-slate-100/50 cursor-pointer flex-1 min-h-[140px] flex flex-col items-center justify-center gap-2 p-4 transition-all"
              >
                <Upload className="w-6 h-6 text-slate-400" />
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-600">
                    Klik untuk memilih atau Drag & Drop gambar di sini
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Mendukung JPG, PNG, WEBP (Simulasi resolusi CCTV)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results / Status Message */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-3.5 py-2.5 rounded text-xs flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Gagal Menganalisis Frame</p>
            <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-150 text-green-800 px-3.5 py-2.5 rounded text-xs flex items-start gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-green-900">Analisis Selesai & Berhasil!</p>
            <p className="text-[11px] text-green-700 mt-0.5">
              CCTV frame telah dianalisis oleh AI. Data pelanggaran disimpan ke database.
            </p>
            
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-green-200/50 text-[11px]">
              <div>
                <span className="text-slate-500 block">Pekerja (Person):</span>
                <span className="font-bold text-slate-800">{result.detections?.counts?.persons ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Helm (Hardhat):</span>
                <span className="font-bold text-slate-800">{result.detections?.counts?.helmets ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Rompi (Vest):</span>
                <span className="font-bold text-slate-800">{result.detections?.counts?.vests ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Pelanggaran (Violations):</span>
                <span className={`font-bold ${result.alert_triggered ? 'text-red-600' : 'text-green-700'}`}>
                  {result.violations?.length ?? 0}
                </span>
              </div>
            </div>

            {result.violations?.length > 0 && (
              <div className="mt-2.5 bg-red-50/70 border border-red-100 rounded p-2 space-y-1">
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide block">
                  🚨 Alarm Dipicu:
                </span>
                {result.violations.map((v: any, i: number) => (
                  <p key={i} className="text-[11px] text-red-800 font-medium">
                    • {v.message} ({v.severity})
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
