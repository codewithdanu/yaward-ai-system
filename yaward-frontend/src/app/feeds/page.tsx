'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api, deleteViolation, bulkDeleteViolations, registerCamera, updateCamera, deleteCamera } from '@/lib/api';
import Topbar from '@/components/shared/Topbar';
import FeedTile from '@/components/features/FeedTile';
import { useYAWardStore, CameraConfig } from '@/lib/store';
import { Camera, Info, Plus, X, Trash2, ShieldAlert, Lightbulb, Edit2 } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function maskRtspUrl(url: string | undefined): string {
  if (!url) return '';
  if (!url.startsWith('rtsp://')) {
    return url.length > 15 ? url.substring(0, 15) + '...' : url;
  }
  const withoutProtocol = url.substring(7);
  const atIndex = withoutProtocol.indexOf('@');
  if (atIndex !== -1) {
    const creds = withoutProtocol.substring(0, atIndex);
    const colonIndex = creds.indexOf(':');
    const user = colonIndex !== -1 ? creds.substring(0, colonIndex) : creds;
    return `rtsp://${user}:****@****`;
  }
  return `rtsp://${withoutProtocol.substring(0, 4)}****`;
}

export default function FeedsPage() {
  const { 
    violations, 
    setViolations, 
    openAlertModal, 
    cameras, 
    addCamera, 
    removeCamera,
    setCameras,
    deleteViolationAction,
    bulkDeleteViolationsAction,
    user
  } = useYAWardStore();
  const [selectedCamera, setSelectedCameraState] = useState<string | null>(null);

  // Fetch cameras dynamically from PostgreSQL backend
  const { data: camerasData, isLoading: camerasLoading, mutate: mutateCameras } = useSWR(
    '/api/cameras',
    fetcher
  );

  // Sync cameras into Zustand store
  useEffect(() => {
    if (camerasData?.cameras) {
      setCameras(camerasData.cameras);
    }
  }, [camerasData, setCameras]);

  // Selected violations for bulk actions
  const [selectedViolationIds, setSelectedViolationIds] = useState<number[]>([]);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Fetch violations every 2s for real-time feel on feeds page
  const { data: violationsData, isLoading: violationsLoading } = useSWR(
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

  const handleDeleteSingle = async (id: number) => {
    try {
      await deleteViolation(id);
      deleteViolationAction(id);
      setSelectedViolationIds(prev => prev.filter(vId => vId !== id));
      setIsDeletingId(null);
    } catch (err) {
      console.error("Failed to delete violation:", err);
      alert("Gagal menghapus peringatan. Silakan coba lagi.");
    }
  };

  const handleDeleteBulk = async () => {
    if (selectedViolationIds.length === 0) return;
    try {
      await bulkDeleteViolations(selectedViolationIds);
      bulkDeleteViolationsAction(selectedViolationIds);
      setSelectedViolationIds([]);
      setIsBulkDeleting(false);
    } catch (err) {
      console.error("Failed to bulk delete violations:", err);
      alert("Gagal menghapus beberapa peringatan. Silakan coba lagi.");
    }
  };

  const toggleSelectViolation = (id: number) => {
    setSelectedViolationIds(prev =>
      prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (cameraViolations: typeof violations) => {
    const activeIds = cameraViolations.map(v => v.id);
    const allSelected = activeIds.every(id => selectedViolationIds.includes(id));
    if (allSelected) {
      setSelectedViolationIds(prev => prev.filter(id => !activeIds.includes(id)));
    } else {
      setSelectedViolationIds(prev => {
        const unique = new Set([...prev, ...activeIds]);
        return Array.from(unique);
      });
    }
  };

  // Set selected camera with URL search params reflection
  const setSelectedCamera = (camId: string | null) => {
    setSelectedCameraState(camId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (camId) {
        url.searchParams.set('camera', camId);
      } else {
        url.searchParams.delete('camera');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Read initial camera from URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cam = params.get('camera');
      if (cam) {
        setSelectedCameraState(cam);
      }
    }
  }, []);
  
  // Registration modal states
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [newId, setNewId] = useState(`CCTV-00${cameras.length + 1}`);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newRtspUrl, setNewRtspUrl] = useState('');
  const [newIsDangerZone, setNewIsDangerZone] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Brand guide tab state
  const [activeBrandTab, setActiveBrandTab] = useState<'hikvision' | 'dahua' | 'tapo' | 'v380' | 'simulation'>('hikvision');

  // Delete modal states
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [cameraToDelete, setCameraToDelete] = useState<string | null>(null);

  // Edit modal states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editRtspUrl, setEditRtspUrl] = useState('');
  const [editIsDangerZone, setEditIsDangerZone] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditModal = (cam: CameraConfig) => {
    setEditId(cam.id);
    setEditName(cam.name);
    setEditLocation(cam.location);
    setEditRtspUrl(cam.rtspUrl || '');
    setEditIsDangerZone(cam.isDangerZone || false);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editName.trim()) {
      setEditError('Nama kamera tidak boleh kosong.');
      return;
    }

    if (!editLocation.trim()) {
      setEditError('Lokasi kamera tidak boleh kosong.');
      return;
    }

    try {
      await updateCamera(editId, {
        name: editName.trim(),
        location: editLocation.trim(),
        rtspUrl: editRtspUrl.trim() || undefined,
        isDangerZone: editIsDangerZone,
      });

      addCamera({
        id: editId,
        name: editName.trim(),
        location: editLocation.trim(),
        rtspUrl: editRtspUrl.trim() || undefined,
        isDangerZone: editIsDangerZone,
        status: 'online',
      });

      setIsEditOpen(false);
      mutateCameras();
    } catch (err: any) {
      console.error("Failed to update camera:", err);
      setEditError(err.response?.data?.error || 'Gagal mengubah kamera. Silakan coba lagi.');
    }
  };

  const camerasWithViolations = new Set(
    violations.filter((v) => !v.acknowledged).map((v) => v.cctv_id)
  );

  const selectedCameraInfo = cameras.find((c) => c.id === selectedCamera);
  const selectedViolations = violations.filter((v) => v.cctv_id === selectedCamera);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    const cleanId = newId.trim().toUpperCase();
    if (!cleanId) {
      setRegError('Camera ID tidak boleh kosong.');
      return;
    }

    if (!newName.trim()) {
      setRegError('Nama kamera tidak boleh kosong.');
      return;
    }

    if (!newLocation.trim()) {
      setRegError('Lokasi kamera tidak boleh kosong.');
      return;
    }

    try {
      await registerCamera({
        id: cleanId,
        name: newName.trim(),
        location: newLocation.trim(),
        rtspUrl: newRtspUrl.trim() || undefined,
        isDangerZone: newIsDangerZone,
      });

      mutateCameras();
      
      // Reset form
      setNewId(`CCTV-00${cameras.length + 2}`);
      setNewName('');
      setNewLocation('');
      setNewRtspUrl('');
      setNewIsDangerZone(false);
      setIsRegisterOpen(false);
    } catch (err: any) {
      console.error("Failed to register camera:", err);
      setRegError(err.response?.data?.error || 'Gagal mendaftarkan kamera. Silakan coba lagi.');
    }
  };

  const confirmDeleteCamera = (id: string) => {
    setCameraToDelete(id);
    setIsDeleteOpen(true);
  };

  const executeDeleteCamera = async () => {
    if (cameraToDelete) {
      try {
        await deleteCamera(cameraToDelete);
        removeCamera(cameraToDelete);
        setSelectedCamera(null);
        setIsDeleteOpen(false);
        setCameraToDelete(null);
        mutateCameras();
      } catch (err) {
        console.error("Failed to delete camera:", err);
        alert("Gagal menghapus kamera.");
      }
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      <Topbar
        title="Live Feeds"
        subtitle="All CCTV camera feeds overview"
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Camera Sidebar */}
        <aside className="w-56 border-r border-slate-200 bg-white flex-shrink-0 flex flex-col justify-between">
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-3 border-b border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Camera List
              </p>
            </div>
            {camerasLoading ? (
              <div className="p-2 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="py-1 px-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse flex-shrink-0" />
                      <div className="h-3 bg-slate-200 rounded animate-pulse w-16" />
                    </div>
                    <div className="h-2 bg-slate-100 rounded animate-pulse w-24 ml-3.5" />
                  </div>
                ))}
              </div>
            ) : (
              <nav className="p-2 space-y-0.5">
                {cameras.map((cam) => {
                  const hasAlert = camerasWithViolations.has(cam.id);
                  const isSelected = selectedCamera === cam.id;

                  return (
                    <button
                      key={cam.id}
                      id={`feeds-cam-${cam.id}`}
                      onClick={() => setSelectedCamera(isSelected ? null : cam.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
                        isSelected
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          hasAlert ? 'bg-red-500 animate-pulse' : 'bg-green-400'
                        }`} />
                        <span className="text-xs font-medium font-mono truncate">{cam.id}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 pl-3.5 truncate">{cam.location}</p>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Register Button at Bottom */}
          {user?.role === 'admin' && (
            <div className="p-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setNewId(`CCTV-00${cameras.length + 1}`);
                  setIsRegisterOpen(true);
                }}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Register CCTV
              </button>
            </div>
          )}
        </aside>

        {/* Main Feed Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {selectedCamera ? (
            /* Single Camera Focus View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">{selectedCameraInfo?.name}</h2>
                    {selectedCameraInfo?.isDangerZone && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide flex items-center gap-1 border border-red-200 animate-pulse">
                        Danger Zone
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedCameraInfo?.location}</p>
                  {selectedCameraInfo?.rtspUrl && (
                    <p className="text-[10px] text-slate-400 font-mono mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                      RTSP: {maskRtspUrl(selectedCameraInfo.rtspUrl)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {user?.role === 'admin' && (
                    <>
                      <button
                        onClick={() => selectedCameraInfo && openEditModal(selectedCameraInfo)}
                        className="text-xs text-blue-600 hover:text-blue-700 px-3 py-1.5 border border-blue-200 hover:bg-blue-50 rounded-md flex items-center gap-1.5 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit Camera
                      </button>
                      <button
                        onClick={() => confirmDeleteCamera(selectedCamera)}
                        className="text-xs text-red-600 hover:text-red-700 px-3 py-1.5 border border-red-200 hover:bg-red-50 rounded-md flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Camera
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedCamera(null)}
                    className="text-xs text-slate-500 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Back to Grid
                  </button>
                </div>
              </div>

              {/* Large feed view */}
              <div className="max-w-2xl">
                <FeedTile
                  cameraId={selectedCamera}
                  hasViolation={camerasWithViolations.has(selectedCamera)}
                />
              </div>

              {/* Camera violations */}
              {violationsLoading ? (
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 rounded animate-pulse w-48 mb-2" />
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 animate-pulse space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                          <div className="h-3.5 bg-slate-200 rounded w-48" />
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded w-24 ml-3.5" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedViolations.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      {user?.role === 'admin' && (
                        <input
                          type="checkbox"
                          checked={selectedViolations.map(v => v.id).every(id => selectedViolationIds.includes(id))}
                          onChange={() => handleSelectAll(selectedViolations)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      )}
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Violations from this camera ({selectedViolations.length})
                      </h3>
                    </div>

                    {/* Bulk actions within list header */}
                    {user?.role === 'admin' && selectedViolations.some(v => selectedViolationIds.includes(v.id)) && (
                      <div className="flex items-center gap-2 animate-fadeIn">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {selectedViolations.filter(v => selectedViolationIds.includes(v.id)).length} selected
                        </span>
                        <button
                          onClick={() => setIsBulkDeleting(true)}
                          className="text-[10px] bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1 rounded transition-colors font-semibold cursor-pointer"
                        >
                          Delete Selected
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {selectedViolations.map((v) => {
                      const isChecked = selectedViolationIds.includes(v.id);
                      return (
                        <div
                          key={v.id}
                          className={`group w-full bg-white border rounded-lg p-3 transition-all flex items-center gap-3 ${
                            isChecked ? 'border-blue-300 bg-blue-50/10' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {user?.role === 'admin' && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectViolation(v.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                            />
                          )}
                          
                          <button
                            onClick={() => openAlertModal(v)}
                            className="flex-1 text-left flex items-center gap-3 focus:outline-none"
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${v.acknowledged ? 'bg-green-400' : 'bg-red-500 animate-pulse'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-800 truncate">{v.message}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {new Date(v.timestamp).toLocaleString('id-ID')}
                              </p>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity mr-1 font-medium cursor-pointer" onClick={() => openAlertModal(v)}>
                              View →
                            </span>
                            {user?.role === 'admin' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsDeletingId(v.id);
                                }}
                                className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                                title="Delete Violation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* Grid View */
            <>
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Click on a camera tile or use the sidebar to focus on a specific feed. 
                  Red-bordered cameras have active violations. Click <strong>+ Register CCTV</strong> to add your CCTV camera!
                </p>
              </div>

              {camerasLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: cameras.length || 6 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="bg-slate-200 aspect-video rounded-lg animate-pulse border border-slate-200" />
                      <div className="h-3.5 bg-slate-200 rounded animate-pulse w-24 px-0.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {cameras.map((cam) => (
                    <div key={cam.id}>
                      <FeedTile
                        cameraId={cam.id}
                        hasViolation={camerasWithViolations.has(cam.id)}
                        onClick={() => setSelectedCamera(cam.id)}
                      />
                      <div className="flex items-center gap-1.5 mt-1.5 px-0.5">
                        {cam.isDangerZone && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide border border-red-200 animate-pulse flex-shrink-0">
                            ⚠ Danger
                          </span>
                        )}
                        <p className="text-[11px] text-slate-600 font-medium truncate">
                          {cam.name} <span className="text-slate-400 font-normal">— {cam.location}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Register CCTV Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" />
                Register New CCTV Camera
              </h2>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Modal Body: Two Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 max-h-[75vh] overflow-y-auto">
              {/* Left Column: Form */}
              <form onSubmit={handleRegister} className="p-6 space-y-4 flex flex-col justify-between h-full">
                <div className="space-y-4">
                  {regError && (
                    <div className="bg-red-50 border border-red-100 text-red-700 p-2.5 rounded text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="font-medium">{regError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Camera ID (Unique)
                    </label>
                    <input
                      type="text"
                      value={newId}
                      onChange={(e) => setNewId(e.target.value)}
                      placeholder="e.g. CCTV-007"
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Camera Name (Descriptive)
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Loading Facility Gate"
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Location / Zone
                    </label>
                    <input
                      type="text"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="e.g. Zone G - Heavy Vehicles"
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      RTSP Stream URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={newRtspUrl}
                      onChange={(e) => setNewRtspUrl(e.target.value)}
                      placeholder="rtsp://admin:sandi123@192.168.1.15:554/live/ch00_0"
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1.5">
                    <input
                      type="checkbox"
                      id="newIsDangerZone"
                      checked={newIsDangerZone}
                      onChange={(e) => setNewIsDangerZone(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <label htmlFor="newIsDangerZone" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Aktifkan Proteksi Area Berbahaya (Danger Zone)
                    </label>
                  </div>
                </div>

                <div className="pt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded active:bg-blue-800 transition-colors"
                  >
                    Register
                  </button>
                </div>
              </form>

              {/* Right Column: Brand Guide */}
              <div className="p-6 space-y-4 bg-slate-50/50 flex flex-col h-full overflow-y-auto">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500" />
                    Panduan Koneksi & Integrasi CCTV
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Pilih merek CCTV Anda di bawah ini untuk melihat konfigurasi dan format RTSP stream:
                  </p>
                </div>

                {/* Brand Tabs */}
                <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                  {[
                    { id: 'hikvision', label: 'Hikvision / Ezviz' },
                    { id: 'dahua', label: 'Dahua / Imou' },
                    { id: 'tapo', label: 'Tapo (TP-Link)' },
                    { id: 'v380', label: 'V380 Pro' },
                    { id: 'simulation', label: 'Webcam / Simulator' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveBrandTab(tab.id as any)}
                      className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                        activeBrandTab === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Guide Content */}
                <div className="flex-1 space-y-3.5 text-xs text-slate-600 min-h-[220px]">
                  {activeBrandTab === 'hikvision' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="bg-slate-100/80 p-2.5 rounded border border-slate-200">
                        <p className="font-semibold text-slate-800 text-[11px]">Format URL RTSP Hikvision:</p>
                        <code className="text-[10px] font-mono text-blue-700 break-all select-all block mt-1">
                          rtsp://[username]:[password]@[ip]:554/Streaming/Channels/101
                        </code>
                        <p className="font-semibold text-slate-800 text-[11px] mt-2">Format URL RTSP Ezviz:</p>
                        <code className="text-[10px] font-mono text-blue-700 break-all select-all block mt-1">
                          rtsp://admin:[verification_code]@[ip]:554/h264/ch1/main/av_stream
                        </code>
                      </div>
                      <ol className="space-y-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-500">
                        <li>Cari IP Address kamera menggunakan software <strong>SADP Tool</strong> dari PC yang satu jaringan.</li>
                        <li>Buka IP Address tersebut di web browser Anda untuk mengakses halaman konfigurasi.</li>
                        <li>Masuk ke menu <strong>Configuration &gt; Network &gt; Advanced Settings &gt; Integration Protocol</strong>.</li>
                        <li>Centang opsi <strong>Enable ONVIF</strong>, lalu tambahkan user baru dengan hak akses Media/Administrator.</li>
                        <li>Jika menggunakan Ezviz, aktifkan fitur RTSP di aplikasi HP, dan gunakan <strong>Verification Code</strong> (di stiker bawah kamera) sebagai password.</li>
                      </ol>
                    </div>
                  )}

                  {activeBrandTab === 'dahua' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="bg-slate-100/80 p-2.5 rounded border border-slate-200">
                        <p className="font-semibold text-slate-800 text-[11px]">Format URL RTSP Dahua / Imou:</p>
                        <code className="text-[10px] font-mono text-blue-700 break-all select-all block mt-1">
                          rtsp://[username]:[password]@[ip]:554/cam/realmonitor?channel=1&amp;subtype=0
                        </code>
                      </div>
                      <ol className="space-y-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-500">
                        <li>Cari IP Address kamera Dahua Anda dengan software <strong>ConfigTool</strong>.</li>
                        <li>Buka browser, masukkan IP tersebut, lalu login ke web dashboard kamera.</li>
                        <li>Masuk ke menu <strong>Setting &gt; Network &gt; Connection</strong> atau pastikan ONVIF aktif pada tab Keamanan.</li>
                        <li>Untuk kamera <strong>Imou</strong> (anak perusahaan Dahua), username default adalah <code>admin</code> dan password adalah <strong>Safety Code</strong> (tertera pada stiker kode QR di bagian bawah kamera).</li>
                        <li>Pastikan port 554 (RTSP default) terbuka di jaringan konstruksi lokal Anda.</li>
                      </ol>
                    </div>
                  )}

                  {activeBrandTab === 'tapo' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="bg-slate-100/80 p-2.5 rounded border border-slate-200">
                        <p className="font-semibold text-slate-800 text-[11px]">Format URL RTSP Tapo:</p>
                        <code className="text-[10px] font-mono text-blue-700 break-all select-all block mt-1">
                          rtsp://[username]:[password]@[ip]:554/stream1
                        </code>
                      </div>
                      <ol className="space-y-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-500">
                        <li>Buka aplikasi Tapo di HP Anda, masuk ke detail kamera, lalu ketuk ikon <strong>Settings</strong> (gigi roda).</li>
                        <li>Ketuk menu <strong>Advanced Settings &gt; Camera Account</strong>.</li>
                        <li>Buat username dan password baru khusus untuk integrasi lokal ini (jangan gunakan akun Tapo utama Anda).</li>
                        <li>Cek IP Address kamera di menu info perangkat pada aplikasi Tapo HP Anda.</li>
                        <li>Gunakan port default 554 dengan format URL di atas untuk main stream (1080p/2K).</li>
                      </ol>
                    </div>
                  )}

                  {activeBrandTab === 'v380' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="bg-slate-100/80 p-2.5 rounded border border-slate-200">
                        <p className="font-semibold text-slate-800 text-[11px]">Format URL RTSP V380 Pro:</p>
                        <code className="text-[10px] font-mono text-blue-700 break-all select-all block mt-1">
                          rtsp://admin:[password]@[ip]:554/live/ch00_0
                        </code>
                      </div>
                      <ol className="space-y-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-500">
                        <li>Hubungkan kamera V380 Pro Anda ke Wi-Fi yang sama dengan server/PC menggunakan aplikasi V380 di HP.</li>
                        <li>Masuk ke <strong>Pengaturan Perangkat &gt; Pengaturan Keamanan (Security Settings)</strong>.</li>
                        <li>Buat <strong>Password Baru</strong> khusus kamera (ini akan mengaktifkan RTSP server internal kamera).</li>
                        <li>Cari IP Address kamera di halaman informasi jaringan aplikasi HP Anda.</li>
                        <li>Masukkan URL dengan format di atas. Username default selalu <code>admin</code>.</li>
                      </ol>
                    </div>
                  )}

                  {activeBrandTab === 'simulation' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="bg-slate-100/80 p-2.5 rounded border border-slate-200">
                        <p className="font-semibold text-slate-800 text-[11px]">Metode Simulasi Real-Time:</p>
                        <p className="text-[10.5px] mt-0.5 text-slate-600 leading-normal">
                          Gunakan webcam PC Anda untuk mengirim frame langsung ke mesin deteksi AI YAWard!
                        </p>
                      </div>
                      <ol className="space-y-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-500">
                        <li>Daftarkan CCTV baru di form kiri dengan nama/lokasi bebas (contoh ID: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[10px]">CCTV-007</code>).</li>
                        <li>Buka file <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[10px]">webcam_cctv_simulation.py</code> yang berada di root proyek ini.</li>
                        <li>Pada baris 53, ubah variabel <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[10px]">cctv_id</code> agar sesuai dengan ID yang baru saja Anda daftarkan.</li>
                        <li>Jalankan simulator tersebut di terminal Anda:
                          <code className="block mt-1 bg-slate-800 text-slate-100 p-1.5 rounded font-mono text-[9px]">
                            python webcam_cctv_simulation.py
                          </code>
                        </li>
                        <li>Webcam Anda akan langsung menangkap gambar, mengirimkannya ke backend AI, dan alarm keselamatan akan langsung muncul real-time di Dashboard YAWard jika Anda tidak memakai helm atau rompi!</li>
                      </ol>
                    </div>
                  )}
                </div>

                {/* Reassurance Info Card */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] leading-relaxed text-blue-800 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5 text-blue-900">
                    <Lightbulb className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 animate-pulse" />
                    Apakah harus mengeluarkan kartu MicroSD?
                  </p>
                  <p className="text-blue-700">
                    <strong>Sama sekali tidak perlu!</strong> Kartu MicroSD tetap berada di dalam CCTV untuk perekaman lokal nonstop (backup offline). AI YAWard hanya membaca aliran data streaming video (RTSP) secara nirkabel melalui jaringan Wi-Fi/LAN lokal. Rekaman fisik Anda tetap aman!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit CCTV Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-500" />
                Edit Kamera CCTV
              </h2>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Modal Body: Form */}
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-100 text-red-700 p-2.5 rounded text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="font-medium">{editError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Camera ID (Read-only)
                </label>
                <input
                  type="text"
                  value={editId}
                  disabled
                  className="w-full text-xs bg-slate-100 border border-slate-200 rounded px-2.5 py-2 text-slate-500 font-mono cursor-not-allowed focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Nama Kamera
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Loading Facility Gate"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Lokasi / Zona
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Zone G - Heavy Vehicles"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  RTSP Stream URL
                </label>
                <input
                  type="text"
                  value={editRtspUrl}
                  onChange={(e) => setEditRtspUrl(e.target.value)}
                  placeholder="rtsp://admin:sandi123@192.168.1.15:554/live/ch00_0"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsDangerZone"
                  checked={editIsDangerZone}
                  onChange={(e) => setEditIsDangerZone(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                />
                <label htmlFor="editIsDangerZone" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  Aktifkan Proteksi Area Berbahaya (Danger Zone)
                </label>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded active:bg-blue-800 transition-colors"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteOpen && cameraToDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-slate-800">
                Hapus Kamera CCTV
              </h2>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus kamera <strong className="text-slate-900 font-bold font-mono">{cameraToDelete}</strong> dari register?
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 border border-slate-100 p-2.5 rounded">
                Tindakan ini akan menghentikan pemantauan keselamatan pada saluran kamera ini. Anda harus mendaftarkannya kembali secara manual jika ingin memantau ulang.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => {
                  setIsDeleteOpen(false);
                  setCameraToDelete(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={executeDeleteCamera}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded active:bg-red-800 transition-colors"
              >
                Hapus Kamera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Violation Delete Confirmation Modal */}
      {isDeletingId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-slate-800">
                Hapus Riwayat Pelanggaran
              </h2>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus log pelanggaran keselamatan ini secara permanen?
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 border border-slate-100 p-2.5 rounded">
                Tindakan ini tidak dapat dibatalkan. Data pelanggaran akan dihapus sepenuhnya dari database.
              </p>
            </div>

            {/* Footer */}
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

      {/* Bulk Violation Delete Confirmation Modal */}
      {isBulkDeleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-slate-800">
                Hapus Masal Pelanggaran
              </h2>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong className="text-red-600 font-bold">{selectedViolationIds.length}</strong> log pelanggaran terpilih secara permanen?
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 border border-slate-100 p-2.5 rounded">
                Tindakan ini tidak dapat dibatalkan. Semua data pelanggaran yang dipilih akan dihapus sepenuhnya dari database.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => setIsBulkDeleting(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteBulk}
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
