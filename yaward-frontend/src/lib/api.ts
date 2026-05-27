import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Axios instance configured for YAWard backend.
 * Auto-sets Content-Type and base URL.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds to allow for YOLOv8 CPU inference latency
});

// Request interceptor to automatically attach standard bearer tokens
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('yaward-auth-token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[YAWard API Error]', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// ─── API Functions ─────────────────────────────────────────────────────────

/** Auth: Login with credentials */
export const login = (credentials: { username: string; password: string }) =>
  api.post('/api/auth/login', credentials);

/** Auth: Fetch currently logged-in user profile */
export const fetchMe = () =>
  api.get('/api/auth/me');

/** Auth: Fetch registered users (for selection in dropdown) */
export const fetchUsersList = () =>
  api.get('/api/users/staff');

/** Settings: Get saved notification email configurations */
export const fetchEmailSettings = () =>
  api.get('/api/settings/emails');

/** Settings: Save custom notification email configurations */
export const saveEmailSettings = (emails: string[]) =>
  api.post('/api/settings/emails', { emails });

/** Fetch system health status */
export const fetchHealth = () => api.get('/api/health');

/**
 * Fetch violations list with optional filters.
 * @param params - Query parameters: limit, cctv_id, acknowledged, severity
 */
export const fetchViolations = (params?: {
  limit?: number;
  cctv_id?: string;
  acknowledged?: boolean;
  severity?: string;
}) => api.get('/api/violations', { params });

/** Fetch single violation by ID */
export const fetchViolation = (id: number) =>
  api.get(`/api/violations/${id}`);

/**
 * Fetch dashboard statistics for a period.
 * @param period - 'today' | 'week' | 'month' | 'all'
 */
export const fetchStatistics = (period: string = 'today') =>
  api.get('/api/statistics', { params: { period } });

/**
 * Acknowledge a violation.
 * @param violationId - Violation ID to acknowledge
 * @param acknowledgedBy - Name of the supervisor
 */
export const acknowledgeAlert = (violationId: number, acknowledgedBy?: string) =>
  api.post('/api/acknowledge-alert', {
    violation_id: violationId,
    acknowledged_by: acknowledgedBy,
  });

/**
 * Analyze an image frame from a CCTV feed.
 * @param imagePath - Absolute path to the image on the server
 * @param cctvId - CCTV camera identifier
 */
export const analyzeFrame = (imagePath: string, cctvId: string) =>
  api.post('/api/analyze', {
    image_path: imagePath,
    cctv_id: cctvId,
  });

/**
 * Upload and analyze an image file from the client.
 * @param file - File object
 * @param cctvId - CCTV camera identifier
 */
export const uploadAndAnalyzeFrame = (file: File, cctvId: string) => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('cctv_id', cctvId);
  return api.post('/api/analyze', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

/**
 * Delete a single violation.
 * @param id - Violation ID to delete
 */
export const deleteViolation = (id: number) =>
  api.delete(`/api/violations/${id}`);

/**
 * Bulk delete multiple violations.
 * @param ids - Array of violation IDs to delete
 */
export const bulkDeleteViolations = (ids: number[]) =>
  api.post('/api/violations/bulk-delete', { violation_ids: ids });

/** Fetch all cameras from backend */
export const fetchCameras = () =>
  api.get('/api/cameras');

/** Register a new camera */
export const registerCamera = (cam: { id: string; name: string; location: string; rtspUrl?: string; isDangerZone?: boolean }) =>
  api.post('/api/cameras', cam);

/** Update camera details */
export const updateCamera = (id: string, cam: { name: string; location: string; rtspUrl?: string; isDangerZone?: boolean }) =>
  api.put(`/api/cameras/${id}`, cam);

/** Delete a camera register */
export const deleteCamera = (id: string) =>
  api.delete(`/api/cameras/${id}`);

export default api;
