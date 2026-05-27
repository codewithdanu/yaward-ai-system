import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Violation {
  id: number;
  type: 'NO_HELMET' | 'NO_VEST' | 'INTRUSION' | 'FALL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  person_id: string | null;
  cctv_id: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Statistics {
  total_violations: number;
  unacknowledged: number;
  violations_by_type: Record<string, number>;
  violations_by_severity: Record<string, number>;
  violations_by_cctv: Record<string, number>;
  period: string;
}

export interface SystemHealth {
  status: string;
  timestamp: string;
  service: string;
  database: string;
}

export interface CameraConfig {
  id: string;
  name: string;
  location: string;
  rtspUrl?: string;
  status: 'online' | 'offline';
  isDangerZone?: boolean;
}

const DEFAULT_CAMERAS: CameraConfig[] = [
  { id: 'CCTV-001', name: 'Mine Entrance Gate', location: 'Zone A - Pit Entry', status: 'online' },
  { id: 'CCTV-002', name: 'Blasting Zone Perimeter', location: 'Zone B - Restricted', status: 'online' },
  { id: 'CCTV-003', name: 'Heavy Equipment Bay', location: 'Zone C - Machinery', status: 'online' },
  { id: 'CCTV-004', name: 'Worker Assembly Point', location: 'Zone D - Common', status: 'online' },
  { id: 'CCTV-005', name: 'Tunnel Entrance', location: 'Zone E - Underground', status: 'online' },
  { id: 'CCTV-006', name: 'Admin Building Perimeter', location: 'Zone F - Office', status: 'online' },
];

interface YAWardStore {
  // State
  violations: Violation[];
  statistics: Statistics | null;
  health: SystemHealth | null;
  selectedViolation: Violation | null;
  isAlertModalOpen: boolean;
  activePeriod: string;
  activeFilter: string | null;
  cameras: CameraConfig[];

  // Auth State
  user: { id: number; username: string; email: string; role: 'admin' | 'staff' } | null;
  token: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;

  // Actions
  setViolations: (violations: Violation[]) => void;
  setStatistics: (stats: Statistics) => void;
  setHealth: (health: SystemHealth) => void;
  setSelectedViolation: (v: Violation | null) => void;
  openAlertModal: (v: Violation) => void;
  closeAlertModal: () => void;
  setActivePeriod: (period: string) => void;
  setActiveFilter: (filter: string | null) => void;
  acknowledgeViolation: (id: number) => void;
  deleteViolationAction: (id: number) => void;
  bulkDeleteViolationsAction: (ids: number[]) => void;
  addCamera: (cam: CameraConfig) => void;
  removeCamera: (id: string) => void;
  setCameras: (cameras: CameraConfig[]) => void;

  // Auth Actions
  setUser: (user: { id: number; username: string; email: string; role: 'admin' | 'staff' } | null) => void;
  setToken: (token: string | null) => void;
  setIsAuthenticated: (val: boolean) => void;
  loginAction: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logoutAction: () => void;
  initializeAuth: () => Promise<void>;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useYAWardStore = create<YAWardStore>()(
  persist(
    (set) => ({
      violations: [],
      statistics: null,
      health: null,
      selectedViolation: null,
      isAlertModalOpen: false,
      activePeriod: 'today',
      activeFilter: null,
      cameras: DEFAULT_CAMERAS,

      // Auth state defaults
      user: null,
      token: null,
      isAuthenticated: false,
      isAuthLoading: true,

      setViolations: (violations) => set({ violations }),
      setStatistics: (statistics) => set({ statistics }),
      setHealth: (health) => set({ health }),
      setSelectedViolation: (v) => set({ selectedViolation: v }),

      openAlertModal: (v) => set({ selectedViolation: v, isAlertModalOpen: true }),
      closeAlertModal: () => set({ isAlertModalOpen: false, selectedViolation: null }),

      setActivePeriod: (activePeriod) => set({ activePeriod }),
      setActiveFilter: (activeFilter) => set({ activeFilter }),

      acknowledgeViolation: (id) =>
        set((state) => ({
          violations: state.violations.map((v) =>
            v.id === id
              ? { ...v, acknowledged: true, acknowledged_at: new Date().toISOString() }
              : v
          ),
        })),

      deleteViolationAction: (id) =>
        set((state) => ({
          violations: state.violations.filter((v) => v.id !== id),
        })),

      bulkDeleteViolationsAction: (ids) =>
        set((state) => ({
          violations: state.violations.filter((v) => !ids.includes(v.id)),
        })),

      addCamera: (cam) =>
        set((state) => ({
          cameras: [...state.cameras.filter((c) => c.id !== cam.id), cam],
        })),

      removeCamera: (id) =>
        set((state) => ({
          cameras: state.cameras.filter((c) => c.id !== id),
        })),

      setCameras: (cameras) => set({ cameras }),

      // Auth actions
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

      loginAction: async (username, password) => {
        const { login } = await import('./api');
        try {
          const res = await login({ username, password });
          if (res.data && res.data.token) {
            const token = res.data.token;
            const user = res.data.user;
            localStorage.setItem('yaward-auth-token', token);
            set({ token, user, isAuthenticated: true, isAuthLoading: false });
            return { success: true };
          }
          return { success: false, error: 'Invalid response from server' };
        } catch (err) {
          console.error('Login action error:', err);
          return {
            success: false,
            error: (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Invalid credentials'
          };
        }
      },

      logoutAction: () => {
        localStorage.removeItem('yaward-auth-token');
        set({ token: null, user: null, isAuthenticated: false, isAuthLoading: false });
      },

      initializeAuth: async () => {
        set({ isAuthLoading: true });
        const token = localStorage.getItem('yaward-auth-token');
        if (!token) {
          set({ token: null, user: null, isAuthenticated: false, isAuthLoading: false });
          return;
        }
        
        try {
          const { fetchMe } = await import('./api');
          const res = await fetchMe();
          if (res.data && res.data.user) {
            set({
              token,
              user: res.data.user,
              isAuthenticated: true,
              isAuthLoading: false
            });
          } else {
            localStorage.removeItem('yaward-auth-token');
            set({ token: null, user: null, isAuthenticated: false, isAuthLoading: false });
          }
        } catch (err) {
          console.error('initializeAuth failed, clearing token:', err);
          localStorage.removeItem('yaward-auth-token');
          set({ token: null, user: null, isAuthenticated: false, isAuthLoading: false });
        }
      },
    }),
    {
      name: 'yaward-persistent-storage',
      // Persist cameras and basic auth details for fast layout rendering
      partialize: (state) => ({
        cameras: state.cameras,
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);

// ─── Derived helpers ────────────────────────────────────────────────────────

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-100',
  HIGH: 'text-orange-700 bg-orange-100',
  MEDIUM: 'text-yellow-700 bg-yellow-100',
  LOW: 'text-green-700 bg-green-100',
};

export const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-green-500',
};

export const VIOLATION_TYPE_LABELS: Record<string, string> = {
  NO_HELMET: 'No Helmet',
  NO_VEST: 'No Safety Vest',
  INTRUSION: 'Danger Zone Intrusion',
  FALL: 'Fall Detected',
  NO_MASK: 'No Mask',
  MACHINERY_PROXIMITY: 'Machinery Proximity Hazard',
};
