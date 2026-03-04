// ============================================
// FANROC 2026 – REST API Client
// ============================================

const BASE = '';   // Same-origin (vite proxy in dev, server in prod)

async function request(url: string, opts?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${url}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    });
  } catch (err: any) {
    throw new Error('Không kết nối được server. Kiểm tra server đã chạy (npm run dev hoặc npm start).');
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Phản hồi không hợp lệ từ server.');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ──────────────────────────────────────
export const loginUser = (email: string, password: string) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const loginViewer = (code: string) =>
  request('/api/auth/viewer-login', { method: 'POST', body: JSON.stringify({ code }) });

// ── Teams ─────────────────────────────────────
export const fetchTeams = () => request('/api/teams');

export const createTeam = (team: { code: string; name: string; school: string }) =>
  request('/api/teams', { method: 'POST', body: JSON.stringify(team) });

export const updateTeam = (id: string, data: { code?: string; name?: string; school?: string }) =>
  request(`/api/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteTeam = (id: string) =>
  request(`/api/teams/${id}`, { method: 'DELETE' });

// ── Matches ───────────────────────────────────
export const fetchMatches = () => request('/api/matches');

export const generateMatches = (config: { startTime: string; matchDuration: number; fields: number }) =>
  request('/api/matches/generate', { method: 'POST', body: JSON.stringify(config) });

export const updateMatch = (id: string, data: any) =>
  request(`/api/matches/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteAllMatches = () =>
  request('/api/matches', { method: 'DELETE' });

export const deleteMatch = (id: string) =>
  request(`/api/matches/${id}`, { method: 'DELETE' });

export const manualAddMatch = (payload: { allianceRedTeams: string[]; allianceBlueTeams: string[]; status?: string; startTime?: string; matchDuration?: number }) =>
  request('/api/matches/manual-add', { method: 'POST', body: JSON.stringify(payload) });

export const exportScheduleExcel = async () => {
  const res = await fetch('/api/matches/export-schedule-excel');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Xuất Excel thất bại');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'FANROC_2026_Lich_Thi_Dau_Thong_Ke.xlsx';
  a.click();
  URL.revokeObjectURL(url);
};

// ── Users ─────────────────────────────────────
export const fetchUsers = () => request('/api/users');

export const createUser = (user: { name: string; email: string; password: string; assignedField: number }) =>
  request('/api/users', { method: 'POST', body: JSON.stringify(user) });

export const deleteUser = (id: string) =>
  request(`/api/users/${id}`, { method: 'DELETE' });
