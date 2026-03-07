// ============================================
// FANROC 2026 – Main App Component
// NodeJS + MySQL + Socket.IO
// ============================================
import * as XLSX from 'xlsx';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserRole, Team, Match, INITIAL_SCORE, AllianceScore, RobotEndGameState, AppUser } from './types';
import { calculateMatchScores } from './scoringLogic';
import * as api from './api';
import socket from './socket';
import {
  Trophy, Gamepad2, LayoutDashboard, LogOut,
  ChevronRight, Plus, Trash2, RefreshCw, Lock, Unlock,
  Zap, CheckCircle2, UserPlus, Mail, Key,
  ArrowRight, Users, Calendar, AlertCircle, Radio, Printer
} from 'lucide-react';

import AutomaticLeaderboard from './rest-of-list';
import logoFanroc from './logo.png';
import logoRobot from './robot_logo.png';

// ── Constants ─────────────────────────────────
const VIEW_ACCESS_CODE = 'fanroc2026';

// ══════════════════════════════════════════════
// App
// ══════════════════════════════════════════════
const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [activePortal, setActivePortal] = useState<'ADMIN' | 'JUDGE' | 'VIEWER' | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState({
    startTime: '08:00',
    matchDuration: 5,
    fields: 3,
    roundsPerTeam: 4,
  });
  const [activeAdminTab, setActiveAdminTab] = useState<'DASHBOARD' | 'TEAMS' | 'MATCHES' | 'USERS'>('DASHBOARD');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedTeamForMatches, setSelectedTeamForMatches] = useState<Team | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [matchEditError, setMatchEditError] = useState<string>('');
  const [isSavingMatch, setIsSavingMatch] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const normalizeScore = useCallback((score?: Partial<AllianceScore>): AllianceScore => {
    const legacy = score as (Partial<AllianceScore> & { pushedBarrier?: boolean }) | undefined;
    const next = { ...INITIAL_SCORE, ...(score || {}) };
    if (typeof next.pushedBarrier !== 'boolean' && score?.barrierStatus) {
      next.pushedBarrier = score.barrierStatus === 'COMPLETED';
    }
    if (typeof legacy?.pushedBarrier === 'boolean' && !score?.barrierStatus) {
      next.barrierStatus = legacy.pushedBarrier ? 'COMPLETED' : 'NOT_COMPLETED';
    }
    if (!['COMPLETED', 'NOT_COMPLETED', 'WRONG'].includes(next.barrierStatus ?? 'NOT_COMPLETED')) {
      next.barrierStatus = 'NOT_COMPLETED';
    }
    return next;
  }, []);

  const normalizeMatch = useCallback((m: Match): Match => ({
    ...m,
    allianceRed: { ...m.allianceRed, score: normalizeScore(m.allianceRed?.score) },
    allianceBlue: { ...m.allianceBlue, score: normalizeScore(m.allianceBlue?.score) },
  }), [normalizeScore]);

  // ── Data loaders ─────────────────────────────
  const loadTeams = useCallback(async () => {
    try { setTeams(await api.fetchTeams()); } catch { /* ignore */ }
  }, []);

  const loadMatches = useCallback(async () => {
    try {
      const rawMatches = await api.fetchMatches();
      setMatches((rawMatches as Match[]).map(normalizeMatch));
    } catch {
      /* ignore */
    }
  }, [normalizeMatch]);

  const loadUsers = useCallback(async () => {
    try { setUsers(await api.fetchUsers()); } catch { /* ignore */ }
  }, []);

  // ── Init: restore session + fetch data ────────
  useEffect(() => {
    const savedRole = localStorage.getItem('fanroc_role');
    if (savedRole) setRole(savedRole as UserRole);
    const savedPortal = localStorage.getItem('fanroc_portal');
    if (savedPortal) setActivePortal(savedPortal as any);
    const savedUser = localStorage.getItem('fanroc_current_user');
    if (savedUser) setCurrentUser(JSON.parse(savedUser));

    loadTeams();
    loadMatches();
    loadUsers();

    // Real-time listeners
    socket.on('teams:update', loadTeams);
    socket.on('matches:update', loadMatches);

    return () => {
      socket.off('teams:update', loadTeams);
      socket.off('matches:update', loadMatches);
    };
  }, [loadTeams, loadMatches, loadUsers]);

  // ── Persist session locally ──────────────────
  useEffect(() => {
    if (role) localStorage.setItem('fanroc_role', role);
    else localStorage.removeItem('fanroc_role');
    if (activePortal) localStorage.setItem('fanroc_portal', activePortal);
    else localStorage.removeItem('fanroc_portal');
    if (currentUser) localStorage.setItem('fanroc_current_user', JSON.stringify(currentUser));
    else localStorage.removeItem('fanroc_current_user');
  }, [role, activePortal, currentUser]);

  // ── Leaderboard ──────────────────────────────
  const leaderboard = useMemo(() => {
    // Đảm bảo luôn tính toán lại khi teams hoặc matches thay đổi
    if (!teams || teams.length === 0) return [];
    
    const stats = teams.map(team => {
      const teamMatches = matches.filter(
        m =>
          (m.status === 'LOCKED' || m.status === 'PENDING') &&
          (m.allianceRed.teams.includes(team.id) || m.allianceBlue.teams.includes(team.id))
      );
      const matchScores = teamMatches.map(m => {
        const alliance = m.allianceRed.teams.includes(team.id) ? m.allianceRed : m.allianceBlue;
        // Ưu tiên lấy từ teamScores nếu có, nếu không fallback về finalScore của liên minh
        if (alliance.teamScores && alliance.teamScores[team.id] !== undefined) {
          return alliance.teamScores[team.id];
        }
        return alliance.score.finalScore;
      });
      const bioPointsTotal = teamMatches.reduce(
        (acc, m) =>
          acc +
          (m.allianceRed.teams.includes(team.id)
            ? m.allianceRed.score.calculatedBioPoints
            : m.allianceBlue.score.calculatedBioPoints),
        0
      );
      const sortedScores = [...matchScores].sort((a, b) => b - a);
      return {
        ...team,
        totalPoints: sortedScores.slice(0, 4).reduce((a, b) => a + b, 0),
        bioPointsTotal,
        highestMatchScore: sortedScores[0] || 0,
        matchesPlayed: matchScores.length,
      };
    });
    
    // Sắp xếp: đội có điểm cao hơn lên trước, nếu bằng nhau thì ưu tiên đội có điểm cao nhất cao hơn
    return stats.sort(
      (a, b) =>
        (b.totalPoints ?? 0) - (a.totalPoints ?? 0) ||
        (b.highestMatchScore ?? 0) - (a.highestMatchScore ?? 0) ||
        (b.bioPointsTotal ?? 0) - (a.bioPointsTotal ?? 0) ||
        (a.stt ?? 0) - (b.stt ?? 0) // Nếu tất cả bằng nhau, ưu tiên STT nhỏ hơn
    );
  }, [teams, matches]);

  // ── Export Excel ─────────────────────────────
  const exportLeaderboardToExcel = () => {
    const data = leaderboard.map((team, index) => {
      // Lấy danh sách tất cả trận hợp lệ của đội (LOCKED hoặc PENDING)
      const teamMatches = matches.filter(m =>
        (m.status === 'LOCKED' || m.status === 'PENDING') &&
        (m.allianceRed.teams.includes(team.id) || m.allianceBlue.teams.includes(team.id))
      );

      // Điểm từng trận của riêng đội đó
      const matchScores = teamMatches.map(m => {
        const alliance = m.allianceRed.teams.includes(team.id) ? m.allianceRed : m.allianceBlue;
        // Ưu tiên lấy từ teamScores nếu có, nếu không fallback về finalScore của liên minh
        if (alliance.teamScores && alliance.teamScores[team.id] !== undefined) {
          return alliance.teamScores[team.id];
        }
        return alliance.score.finalScore;
      });

      // Sắp xếp điểm từng trận từ cao xuống thấp để dễ nhìn Top 4
      const sortedScores = [...matchScores].sort((a, b) => b - a);
      const padded = [...sortedScores, 0, 0, 0, 0, 0]; // đảm bảo đủ 5 phần tử
      const [m1, m2, m3, m4, m5] = padded.slice(0, 5);

      const top4Total = sortedScores.slice(0, 4).reduce((a, b) => a + b, 0);
      const highest = sortedScores[0] || 0;

      return {
        'Hạng': index + 1,
        'STT': team.stt,
        'Tên đội': team.name,
        'Trường': team.school,
        'Số trận': matchScores.length,
        'Trận 1': m1,
        'Trận 2': m2,
        'Trận 3': m3,
        'Trận 4': m4,
        'Trận 5': m5,
        'Tổng điểm (Top 4)': top4Total,
        'Điểm cao nhất': highest,
        'Điểm sinh học': team.bioPointsTotal,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bang xep hang');
    XLSX.writeFile(wb, 'FANROC_2026_Bang_Xep_Hang.xlsx');
  };

  // ── Logout ───────────────────────────────────
  const handleLogout = () => {
    setRole(null);
    setActivePortal(null);
    setCurrentUser(null);
    setSelectedMatch(null);
  };

  // ── Helper ───────────────────────────────────
  const getTeamName = (id: string) => {
    const t = teams.find(t => t.id === id);
    return t ? t.name : '';
  };

  const getTeamMatches = (teamId: string | number) => {
    return matches.filter(m =>
      m.allianceRed.teams.includes(String(teamId)) ||
      m.allianceBlue.teams.includes(String(teamId))
    );
  };

  // ── Match Admin Helpers ─────────────────────
  const handleToggleLock = async (m: Match) => {
    const newStatus = m.status === 'LOCKED' ? 'PENDING' : 'LOCKED';
    try {
      await api.updateMatch(m.id, { status: newStatus, allianceRed: m.allianceRed, allianceBlue: m.allianceBlue });
    } catch (err: any) { alert(err.message); }
  };

  const openMatchEditor = (m: Match) => {
    setEditingMatch(m);
    setMatchEditError('');
  };

  const handleChangeAllianceTeam = (color: 'RED' | 'BLUE', index: number, teamId: string) => {
    if (!editingMatch) return;
    setEditingMatch(prev => {
      if (!prev) return prev;
      const alliance = color === 'RED' ? prev.allianceRed : prev.allianceBlue;
      const updatedTeams = [...alliance.teams];
      updatedTeams[index] = teamId;
      const updatedAlliance = { ...alliance, teams: updatedTeams };
      return {
        ...prev,
        allianceRed: color === 'RED' ? updatedAlliance : prev.allianceRed,
        allianceBlue: color === 'BLUE' ? updatedAlliance : prev.allianceBlue,
      };
    });
  };

  const handleSwapAlliances = () => {
    if (!editingMatch) return;
    setEditingMatch(prev => prev ? ({
      ...prev,
      allianceRed: prev.allianceBlue,
      allianceBlue: prev.allianceRed,
    }) : prev);
  };

  const handleSaveMatchEdit = async () => {
    if (!editingMatch) return;
    setIsSavingMatch(true);
    setMatchEditError('');
    try {
      await api.updateMatch(editingMatch.id, {
        status: editingMatch.status,
        allianceRed: editingMatch.allianceRed,
        allianceBlue: editingMatch.allianceBlue,
      });
      setEditingMatch(null);
    } catch (err: any) {
      setMatchEditError(err.message || 'Không lưu được thay đổi trận đấu.');
    } finally {
      setIsSavingMatch(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!editingMatch) return;
    if (!window.confirm(`Bạn chắc chắn muốn xóa TRẬN #${editingMatch.matchNumber}?`)) return;
    setIsSavingMatch(true);
    setMatchEditError('');
    try {
      await api.deleteMatch(editingMatch.id);
      setEditingMatch(null);
    } catch (err: any) {
      setMatchEditError(err.message || 'Không xóa được trận này.');
    } finally {
      setIsSavingMatch(false);
    }
  };

  const handleEditTeamScoreDirectly = async (m: Match, teamId: string) => {
    const isRed = m.allianceRed.teams.includes(teamId);
    const alliance = isRed ? m.allianceRed : m.allianceBlue;
    const currentScore = alliance.teamScores?.[teamId] ?? alliance.score.finalScore;

    const teamName = getTeamName(teamId);
    const newScoreStr = window.prompt(`Nhập điểm mới cho đội [${teamName}] trong TRẬN #${m.matchNumber}:`, String(currentScore));

    if (newScoreStr === null) return;

    const newScore = parseFloat(newScoreStr.replace(',', '.'));
    if (isNaN(newScore)) {
      alert("Vui lòng nhập một con số hợp lệ!");
      return;
    }

    try {
      const updatedAlliance = { ...alliance };
      if (!updatedAlliance.teamScores) {
        // Fallback init teamScores nếu chưa có
        updatedAlliance.teamScores = updatedAlliance.teams.reduce((acc, tid) => ({
          ...acc,
          [tid]: updatedAlliance.score.finalScore
        }), {});
      }
      updatedAlliance.teamScores = { ...updatedAlliance.teamScores, [teamId]: newScore };

      await api.updateMatch(m.id, {
        status: m.status,
        allianceRed: isRed ? updatedAlliance : m.allianceRed,
        allianceBlue: !isRed ? updatedAlliance : m.allianceBlue,
      });
    } catch (err: any) {
      alert("Lỗi khi cập nhật điểm: " + err.message);
    }
  };

  // ════════════════════════════════════════════
  // LOGIN VIEW
  // ════════════════════════════════════════════
  const LoginView = () => {
    const [loginMode, setLoginMode] = useState<'VIEWER' | 'JUDGE' | 'ADMIN'>('VIEWER');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [viewCode, setViewCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError('');

      try {
        if (loginMode === 'VIEWER') {
          const data = await api.loginViewer(viewCode);
          setRole('VIEWER');
          setActivePortal('VIEWER');
          return;
        }

        const userData = await api.loginUser(email, password);
        if (loginMode === 'ADMIN' && userData.role !== 'ADMIN') {
          setError('Tài khoản này không có quyền Quản trị!');
          return;
        }
        setCurrentUser(userData);
        setRole(userData.role);
        setActivePortal(userData.role === 'ADMIN' && loginMode === 'ADMIN' ? 'ADMIN' : 'JUDGE');
      } catch (err: any) {
        setError(err.message || 'Đăng nhập thất bại!');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full glass-card-dark p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-100 blur-[80px] rounded-full"></div>

          <div className="text-center mb-10">
            <Trophy size={50} className="mx-auto text-blue-600 mb-4 drop-shadow-lg" />
            <h2 className="text-4xl font-black italic tracking-tighter text-slate-900 uppercase leading-none">
              FANROC <span className="text-blue-600">2026</span>
            </h2>
            <p className="text-slate-400 text-[9px] mt-2 font-black uppercase tracking-[0.5em]">Live Scoring System</p>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
            {(['VIEWER', 'JUDGE', 'ADMIN'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setLoginMode(mode); setError(''); }}
                className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${loginMode === mode ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {mode === 'VIEWER' ? 'Khán giả' : mode === 'JUDGE' ? 'Trọng tài' : 'BTC'}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-5 relative">
            {loginMode === 'VIEWER' ? (
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input required type="password" value={viewCode} onChange={e => { setViewCode(e.target.value); setError(''); }}
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-black text-center tracking-widest" placeholder="MÃ TRUY CẬP" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input required type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                    className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" placeholder="Email đăng nhập" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input required type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                    className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" placeholder="Mật khẩu" />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-xs font-bold bg-red-50 p-3 rounded-xl border border-red-100">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-2 group">
              {loading ? 'ĐANG XỬ LÝ...' : 'VÀO HỆ THỐNG'} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════
  // ADMIN VIEW
  // ════════════════════════════════════════════
  const AdminView = () => {
    const [newTeam, setNewTeam] = useState({ code: '', name: '', school: '' });
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', assignedField: 1 });
    const [newManualMatch, setNewManualMatch] = useState<{ red1: string; red2: string; blue1: string; blue2: string }>({
      red1: '',
      red2: '',
      blue1: '',
      blue2: '',
    });
    const [manualStartTime, setManualStartTime] = useState<string>(scheduleConfig.startTime);
    const [manualDuration, setManualDuration] = useState<number>(scheduleConfig.matchDuration);

    const NavButton = ({ id, label, icon: Icon }: any) => (
      <button onClick={() => setActiveAdminTab(id)}
        className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeAdminTab === id ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-100'}`}>
        <Icon size={18} /> {label}
      </button>
    );

    // ── Create / Update Team ────────────────────
    const handleSaveTeam = async () => {
      if (!newTeam.code) return;
      try {
        if (editingTeam) {
          await api.updateTeam(editingTeam.id, {
            code: newTeam.code,
            name: newTeam.name,
            school: newTeam.school,
          });
        } else {
          await api.createTeam(newTeam);
        }
        setNewTeam({ code: '', name: '', school: '' });
        setEditingTeam(null);
      } catch (err: any) { alert(err.message); }
    };

    const handleStartEditTeam = (team: Team) => {
      setEditingTeam(team);
      setNewTeam({ code: team.code, name: team.name, school: team.school });
    };

    const handleCancelEditTeam = () => {
      setEditingTeam(null);
      setNewTeam({ code: '', name: '', school: '' });
    };

    // ── Delete Team ─────────────────────────────
    const handleDeleteTeam = async (id: string) => {
      try { await api.deleteTeam(id); } catch (err: any) { alert(err.message); }
    };

    // ── Add User ────────────────────────────────
    const handleAddUser = async () => {
      if (!newUser.email) return;
      try {
        await api.createUser(newUser);
        setNewUser({ name: '', email: '', password: '', assignedField: 1 });
        loadUsers();
      } catch (err: any) { alert(err.message); }
    };

    // ── Delete User ─────────────────────────────
    const handleDeleteUser = async (id: string) => {
      try { await api.deleteUser(id); loadUsers(); } catch (err: any) { alert(err.message); }
    };

    // ── Generate Matches ────────────────────────
    const handleGenerateMatches = async () => {
      if (teams.length < 4) { alert('Cần tối thiểu 4 đội để tạo lịch!'); return; }
      try {
        setIsSyncing(true);
        const result = await api.generateMatches({
          startTime: scheduleConfig.startTime,
          matchDuration: scheduleConfig.matchDuration,
          fields: scheduleConfig.fields,
        });
        loadMatches();
        if (result && result.info) {
          const { totalMatches, fieldsUsed, note } = result.info;
          let msg = `✓ Đã tạo ${totalMatches} trận, sử dụng ${fieldsUsed} sân.`;
          if (result.statistics) {
            const s = result.statistics;
            msg += `\n\nThống kê: ${s.teamsWith4} đội 4 trận, ${s.teamsWith5} đội 5 trận`;
            if (s.matchDifference > 1) msg += `\n⚠️ Chênh lệch số trận: ${s.matchDifference}`;
          }
          if (result.warnings && result.warnings.length > 0) {
            msg += '\n\nCảnh báo: ' + result.warnings.map((w: { message: string }) => w.message).join('; ');
          }
          if (note) msg += `\n\n${note}`;
          alert(msg);
        }
      } catch (err: any) { alert(err.message); }
      finally { setIsSyncing(false); }
    };

    const handleAddManualMatch = async () => {
      const { red1, red2, blue1, blue2 } = newManualMatch;
      if (!red1 || !red2 || !blue1 || !blue2) {
        alert('Vui lòng chọn đủ 4 đội cho 2 liên minh.');
        return;
      }
      try {
        setIsSavingMatch(true);
        await api.manualAddMatch({
          allianceRedTeams: [red1, red2],
          allianceBlueTeams: [blue1, blue2],
          startTime: manualStartTime,
          matchDuration: manualDuration,
        });
        setNewManualMatch({ red1: '', red2: '', blue1: '', blue2: '' });
        setManualStartTime(scheduleConfig.startTime);
        setManualDuration(scheduleConfig.matchDuration);
        // matches sẽ tự refresh qua socket
      } catch (err: any) {
        alert(err.message || 'Không thêm được trận mới.');
      } finally {
        setIsSavingMatch(false);
      }
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Nav bar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
          <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <NavButton id="DASHBOARD" label="Tổng quan" icon={LayoutDashboard} />
            <NavButton id="TEAMS" label="Đội thi" icon={Users} />
            <NavButton id="MATCHES" label="Lịch thi" icon={Calendar} />
            <NavButton id="USERS" label="Tài khoản" icon={UserPlus} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setActivePortal('JUDGE')}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-3 transition-all">
              <Gamepad2 size={20} /> CHẾ ĐỘ GIÁM KHẢO
            </button>
          </div>
        </div>

        {/* ──── DASHBOARD ──── */}
        {activeAdminTab === 'DASHBOARD' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Tổng đội', val: teams.length, icon: Users, color: 'blue' },
                { label: 'Hoàn thành', val: matches.filter(m => m.status === 'LOCKED').length, icon: CheckCircle2, color: 'emerald' },
                { label: 'Chờ duyệt', val: matches.filter(m => m.status === 'PENDING').length, icon: Lock, color: 'orange' },
                { label: 'Đang thi', val: matches.filter(m => m.status === 'SCORING').length, icon: Zap, color: 'rose' },
              ].map(card => (
                <div key={card.label} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 flex items-center justify-between group hover:shadow-lg transition-all">
                  <div>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{card.label}</p>
                    <p className={`text-4xl font-black text-${card.color}-600 tracking-tighter`}>{card.val}</p>
                  </div>
                  <div className={`p-4 rounded-2xl bg-${card.color}-50 text-${card.color}-600`}>
                    <card.icon size={28} />
                  </div>
                </div>
              ))}
            </div>

            {/* Leaderboard table */}
            <div className="bg-white rounded-[3rem] overflow-hidden border border-slate-200 shadow-sm">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-xl font-black italic tracking-tighter uppercase text-slate-800">Xếp hạng hiện tại</h3>
                <button onClick={exportLeaderboardToExcel}
                  className="p-3 bg-white border border-slate-200 hover:bg-slate-50 text-emerald-600 rounded-xl transition-all shadow-sm" title="Xuất Excel">
                  <Printer size={18} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100">
                      <th className="px-8 py-6">Hạng</th><th className="px-8 py-6">Đội</th><th className="px-8 py-6 text-center">Trận</th><th className="px-8 py-6 text-right">Tổng điểm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {leaderboard.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group" onClick={() => setSelectedTeamForMatches(t)}>
                        <td className="px-8 py-6 font-black italic text-lg">
                          <span className={`${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-400' : 'text-blue-600'}`}>
                            #{idx + 1}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <p className="font-black text-blue-600 group-hover:text-blue-700">{t.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t.school}</p>
                        </td>
                        <td className="px-8 py-6 text-center font-bold text-slate-500">{t.matchesPlayed}</td>
                        <td className="px-8 py-6 text-right font-black text-blue-600 text-xl tracking-tighter">{Math.round(t.totalPoints * 10) / 10}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ──── USERS TAB ──── */}
        {activeAdminTab === 'USERS' && (
          <div className="space-y-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <h3 className="text-xl font-black italic uppercase tracking-tighter mb-8 flex items-center gap-3 text-slate-800"><UserPlus className="text-blue-600" /> Cấp tài khoản Trọng tài</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input placeholder="Tên Giám Khảo" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Mật khẩu" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={newUser.assignedField} onChange={e => setNewUser({ ...newUser, assignedField: parseInt(e.target.value) })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none">
                  <option value={1}>Sân 1</option><option value={2}>Sân 2</option><option value={3}>Sân 3</option>
                </select>
                <button onClick={handleAddUser} className="bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-100">TẠO USER</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users.map(u => (
                <div key={u.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 flex justify-between items-center group shadow-sm">
                  <div>
                    <p className="font-black text-slate-800">{u.name}</p>
                    <p className="text-[10px] text-blue-600 uppercase font-bold tracking-widest mt-1">
                      {u.role === 'ADMIN' ? 'Ban Tổ Chức' : `Phụ trách Sân ${u.assignedField}`}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-2 font-mono">{u.email} / {u.password}</p>
                  </div>
                  {u.id !== 'admin_1' && (
                    <button onClick={() => handleDeleteUser(u.id)} className="p-3 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={20} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──── TEAMS TAB ──── */}
        {activeAdminTab === 'TEAMS' && (
          <div className="space-y-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <h3 className="text-xl font-black italic uppercase tracking-tighter mb-8 text-slate-800">
                {editingTeam ? 'Chỉnh sửa đội thi' : 'Đăng ký đội thi'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input placeholder="Mã Đội (T01)" value={newTeam.code} onChange={e => setNewTeam({ ...newTeam, code: e.target.value })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Tên Đội" value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Trường" value={newTeam.school} onChange={e => setNewTeam({ ...newTeam, school: e.target.value })} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex gap-2">
                  <button onClick={handleSaveTeam} className="flex-1 bg-blue-600 text-white font-black rounded-2xl">
                    {editingTeam ? 'LƯU THAY ĐỔI' : 'THÊM ĐỘI'}
                  </button>
                  {editingTeam && (
                    <button onClick={handleCancelEditTeam} className="px-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-xs">
                      HỦY
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {teams.map(t => (
                <div key={t.id} className={`bg-white p-6 rounded-[2rem] border ${editingTeam?.id === t.id ? 'border-blue-500' : 'border-slate-200'} flex justify-between items-center group hover:border-blue-500 transition-all shadow-sm`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-slate-400 w-8 text-right">{String(t.stt).padStart(2, '0')}</span>
                    <div>
                      <span className="font-black text-blue-600 text-lg mr-2">{t.code}</span>
                      <span className="font-bold text-slate-800">{t.name}</span>
                      <p className="text-[10px] text-slate-400">{t.school}</p>
                      <button
                        type="button"
                        onClick={() => handleStartEditTeam(t)}
                        className="mt-1 text-[10px] font-black text-blue-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Chỉnh sửa
                      </button>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTeam(t.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──── MATCHES TAB ──── */}
        {activeAdminTab === 'MATCHES' && (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between w-full">
                <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800">Quản lý lượt đấu</h3>
                <div className="flex gap-2">
                  <button onClick={() => { try { api.exportScheduleExcel(); alert('Đã xuất Excel thống kê lịch.'); } catch (e: any) { alert(e.message); } }} disabled={matches.length === 0} className="p-3 bg-white border border-slate-200 hover:bg-slate-50 text-emerald-600 rounded-xl shadow-sm disabled:opacity-50" title="Xuất Excel thống kê lịch">
                    Excel
                  </button>
                </div>
              </div>
              <button onClick={handleGenerateMatches} disabled={isSyncing}
                className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase shadow-xl flex items-center gap-3 hover:bg-emerald-700 transition-all ml-4 whitespace-nowrap">
                <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} /> TẠO LỊCH ĐẤU 2026
              </button>
            </div>

            {/* Schedule Config */}
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <h4 className="text-lg font-black uppercase mb-6 text-slate-700">Thiết lập lịch đấu</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="text-xs font-bold text-slate-500">Giờ bắt đầu</label>
                  <input type="time" value={scheduleConfig.startTime} onChange={e => setScheduleConfig({ ...scheduleConfig, startTime: e.target.value })} className="w-full mt-1 p-3 rounded-xl border bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">Phút / trận</label>
                  <input type="number" min={1} value={scheduleConfig.matchDuration} onChange={e => setScheduleConfig({ ...scheduleConfig, matchDuration: +e.target.value })} className="w-full mt-1 p-3 rounded-xl border bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">Số sân</label>
                  <input type="number" min={1} value={scheduleConfig.fields} onChange={e => setScheduleConfig({ ...scheduleConfig, fields: +e.target.value })} className="w-full mt-1 p-3 rounded-xl border bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">Số lượt / đội</label>
                  <input disabled value="4" className="w-full mt-1 p-3 rounded-xl border bg-slate-100 font-black text-center" />
                </div>
              </div>
            </div>

            {/* Match list */}
            {matches.length > 0 && (
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="text-lg font-black uppercase text-slate-700">Danh sách lịch thi đấu ({matches.length} trận)</h4>
                    <div className="flex items-center gap-3">
                      <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-[0.15em]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>Click vào trận để chỉnh đội</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingMatch(matches.slice().sort((a, b) => a.matchNumber - b.matchNumber)[0])}
                        disabled={matches.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Calendar size={14} /> CHỈNH SỬA TRẬN
                      </button>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b">
                        <th className="px-6 py-4">Trận</th>
                        <th className="px-6 py-4">Thời gian</th>
                        <th className="px-6 py-4">Sân</th>
                        <th className="px-6 py-4">Liên minh Đỏ</th>
                        <th className="px-6 py-4">Liên minh Xanh</th>
                        <th className="px-6 py-4">Trạng thái</th>
                        <th className="px-6 py-4">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {matches.sort((a, b) => a.matchNumber - b.matchNumber).map(m => (
                        <tr
                          key={m.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => openMatchEditor(m)}
                        >
                          <td className="px-6 py-4 font-black text-slate-700 text-center whitespace-nowrap">#{m.matchNumber}</td>
                          <td className="px-6 py-4 font-mono text-slate-600 text-center">{m.startTime} – {m.endTime}</td>
                          <td className="px-6 py-4 font-black text-blue-600 text-center">Sân {m.field}</td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <span className="text-red-600 font-bold">{getTeamName(m.allianceRed.teams[0])}</span>
                            <span className="mx-2 text-red-600 font-black">&</span>
                            <span className="text-red-600 font-bold">{getTeamName(m.allianceRed.teams[1])}</span>
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <span className="text-blue-600 font-bold">{getTeamName(m.allianceBlue.teams[0])}</span>
                            <span className="mx-2 text-red-600 font-black">&</span>
                            <span className="text-blue-600 font-bold">{getTeamName(m.allianceBlue.teams[1])}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${m.status === 'LOCKED' ? 'bg-emerald-50 text-emerald-600' : m.status === 'PENDING' ? 'bg-orange-50 text-orange-600' : m.status === 'SCORING' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
                              {m.status === 'LOCKED' ? 'Đã khóa' : m.status === 'PENDING' ? 'Chờ duyệt' : m.status === 'SCORING' ? 'Đang chấm' : 'Chờ thi'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            {(m.status === 'PENDING' || m.status === 'LOCKED') && (
                              <button onClick={() => handleToggleLock(m)} className={`p-2 rounded-xl transition-all ${m.status === 'LOCKED' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-orange-600 hover:bg-orange-50'}`}>
                                {m.status === 'LOCKED' ? <Unlock size={18} /> : <Lock size={18} />}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Manual add match */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm max-w-full overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                  Thêm trận mới (BTC)
                </h4>
              </div>

              <div className="space-y-6">
                {/* Grid chính: Chia 2 cột Đỏ/Xanh trên màn hình lớn */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  
                  {/* Liên minh Đỏ */}
                  <div className="p-4 rounded-2xl bg-red-50/50 border border-red-100">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      Liên minh Đỏ
                    </p>
                    {/* Grid phụ: Chia 2 cột cho Đội 1 và Đội 2 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={newManualMatch.red1}
                        onChange={e => setNewManualMatch({ ...newManualMatch, red1: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-red-200 transition-all"
                      >
                        <option value="">-- Đội 1 --</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} – {t.school}</option>
                        ))}
                      </select>
                      <select
                        value={newManualMatch.red2}
                        onChange={e => setNewManualMatch({ ...newManualMatch, red2: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-red-200 transition-all"
                      >
                        <option value="">-- Đội 2 --</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} – {t.school}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Liên minh Xanh */}
                  <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      Liên minh Xanh
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={newManualMatch.blue1}
                        onChange={e => setNewManualMatch({ ...newManualMatch, blue1: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                      >
                        <option value="">-- Đội 1 --</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} – {t.school}</option>
                        ))}
                      </select>
                      <select
                        value={newManualMatch.blue2}
                        onChange={e => setNewManualMatch({ ...newManualMatch, blue2: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                      >
                        <option value="">-- Đội 2 --</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} – {t.school}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Thời gian */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
                    Thiết lập thời gian
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <input
                        type="time"
                        value={manualStartTime}
                        onChange={e => setManualStartTime(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        min={1}
                        value={manualDuration}
                        onChange={e => setManualDuration(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-sm text-center outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Button */}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddManualMatch}
                  disabled={isSavingMatch || teams.length === 0 || matches.length === 0}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  + Thêm trận cuối lịch
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════
  // VIEWER VIEW
  // ════════════════════════════════════════════
  const ViewerView = () => {
    const top3 = leaderboard.slice(0, 3);
    const others = leaderboard.slice(0, 100);

    return (
      <div className="space-y-12 animate-in fade-in duration-700 max-w-6xl mx-auto">
        <div className="text-center space-y-4">
          <h2 className="text-7xl font-black italic tracking-tighter uppercase text-slate-900 drop-shadow-sm">LEADERBOARD <span className="text-blue-600">LIVE</span></h2>
          <div className="flex items-center justify-center gap-4 bg-white/50 w-fit mx-auto px-6 py-2 rounded-full border border-slate-200 shadow-sm">
            <span className="live-icon"></span>
            <p className="text-[15px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Radio size={14} className="text-emerald-500" /> Đang cập nhật trực tiếp từ các sân
            </p>
          </div>
        </div>

        {/* Podium */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end pt-20">
          {/* Hạng 2 */}
          <div className="order-2 md:order-1 bg-white p-10 rounded-[3.5rem] border border-slate-200 text-center relative shadow-xl transform hover:scale-105 transition-all">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-slate-100 rounded-3xl flex items-center justify-center text-4xl font-black text-slate-400 border-4 border-white shadow-lg">2</div>
            <p className="text-2xl font-black text-slate-900 tracking-tighter uppercase mt-6">{top3[1]?.name || '...'}</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">{top3[1]?.school || 'N/A'}</p>
            <div className="mt-6 pt-6 border-t border-slate-50">
              <p className="text-4xl font-black text-slate-800 tracking-tighter">{top3[1].totalPoints?.toFixed(1) ?? 0}</p>
              <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Total Score</p>
            </div>
          </div>
          {/* Hạng 1 */}
          <div className="order-1 md:order-2 bg-white p-12 rounded-[4rem] border-4 border-blue-600/10 text-center relative shadow-2xl transform hover:scale-110 transition-all">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-32 bg-blue-600 rounded-[2.5rem] flex items-center justify-center text-6xl font-black text-white border-8 border-white shadow-2xl">1</div>
            <p className="text-3xl font-black text-slate-900 tracking-tighter uppercase mt-10">{top3[0]?.name || '...'}</p>
            <p className="text-blue-600 text-xs font-bold uppercase tracking-[0.2em] mt-2">{top3[0]?.school || 'N/A'}</p>
            <div className="mt-8 pt-8 border-t border-slate-50">
              <p className="text-7xl font-black text-blue-600 tracking-tighter">{top3[0]?.totalPoints?.toFixed(1) ?? 0}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest italic">Competition King</p>
            </div>
          </div>
          {/* Hạng 3 */}
          <div className="order-3 md:order-3 bg-white p-8 rounded-[3rem] border border-slate-200 text-center relative shadow-xl transform hover:scale-105 transition-all">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center text-3xl font-black text-orange-600 border-4 border-white shadow-lg">3</div>
            <p className="text-xl font-black text-slate-900 tracking-tighter uppercase mt-6">{top3[2]?.name || '...'}</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">{top3[2]?.school || 'N/A'}</p>
            <div className="mt-6 pt-6 border-t border-slate-50">
              <p className="text-4xl font-black text-slate-800 tracking-tighter">{top3[2]?.totalPoints?.toFixed(1) ?? 0}</p>
              <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Total Score</p>
            </div>
          </div>
        </div>

        {/* Rest of list */}
        <AutomaticLeaderboard
          others={others}
          leaderboard={leaderboard}
          isAdmin={activePortal === 'ADMIN'}
          onTeamClick={(id) => setSelectedTeamForMatches(teams.find(t => t.id === id) || null)}
        />

        {/* <div className="bg-white rounded-[3.5rem] overflow-hidden border border-slate-200 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50">
                <tr><th className="px-12 py-8">Vị trí</th><th className="px-12 py-8">Đội thi</th><th className="px-12 py-8 text-center">Trận</th><th className="px-12 py-8 text-right">Tổng Score</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {others.map((t, idx) => (
                  <tr key={t.id} className="animate-row hover:bg-slate-50 transition-colors group">
                    <td className="px-12 py-8 font-black text-slate-200 italic text-2xl group-hover:text-blue-600 transition-colors">#{idx + 1}</td>
                    <td className="px-12 py-8">
                      <p className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none mb-1">{t.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">{t.school}</p>
                    </td>
                    <td className="px-12 py-8 text-center font-black text-slate-400 text-lg">{t.matchesPlayed}</td>
                    <td className="px-12 py-8 text-right"><span className="text-3xl font-black text-blue-600 tracking-tighter">{t.totalPoints}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leaderboard.length === 0 && <p className="text-center py-40 text-slate-300 italic font-medium uppercase tracking-[0.2em]">Đang chờ kết quả từ các sân thi đấu...</p>}
          </div>
        </div> */}
      </div>
    );
  };

  const handleSelectMatch = (m: Match) => setSelectedMatch(normalizeMatch(m));

  const updateAllianceScore = <K extends keyof AllianceScore>(
    color: 'RED' | 'BLUE',
    field: K,
    value: AllianceScore[K]
  ) => {
    if (!selectedMatch) return;
    const alliance = color === 'RED' ? selectedMatch.allianceRed : selectedMatch.allianceBlue;
    const draftRedScore = color === 'RED'
      ? { ...selectedMatch.allianceRed.score, [field]: value }
      : selectedMatch.allianceRed.score;
    const draftBlueScore = color === 'BLUE'
      ? { ...selectedMatch.allianceBlue.score, [field]: value }
      : selectedMatch.allianceBlue.score;

    const redTotalBalls = draftRedScore.yellowBalls + draftRedScore.whiteBalls;
    const blueTotalBalls = draftBlueScore.yellowBalls + draftBlueScore.whiteBalls;
    const updatedRedScore = {
      ...draftRedScore,
      ownCylinderBalls: redTotalBalls,
      opponentCylinderBalls: blueTotalBalls,
    };
    const updatedBlueScore = {
      ...draftBlueScore,
      ownCylinderBalls: blueTotalBalls,
      opponentCylinderBalls: redTotalBalls,
    };

    const calculated = calculateMatchScores(updatedRedScore, updatedBlueScore);

    // Khi cập nhật điểm liên minh, mặc định cập nhật điểm của tất cả các đội trong liên minh đó theo điểm mới
    const newAllianceRed = { ...selectedMatch.allianceRed, score: calculated.red };
    const newAllianceBlue = { ...selectedMatch.allianceBlue, score: calculated.blue };

    if (color === 'RED') {
      newAllianceRed.teamScores = newAllianceRed.teams.reduce((acc, tid) => ({ ...acc, [tid]: calculated.red.finalScore }), {});
    } else {
      newAllianceBlue.teamScores = newAllianceBlue.teams.reduce((acc, tid) => ({ ...acc, [tid]: calculated.blue.finalScore }), {});
    }

    const newMatch = {
      ...selectedMatch,
      allianceRed: newAllianceRed,
      allianceBlue: newAllianceBlue,
      status: 'SCORING' as const,
    };
    setSelectedMatch(newMatch);
    // Also update in local list
    setMatches(prev => prev.map(m => m.id === newMatch.id ? newMatch : m));
  };

  const updateTeamScore = (color: 'RED' | 'BLUE', teamId: string, score: number) => {
    if (!selectedMatch) return;
    const alliance = color === 'RED' ? selectedMatch.allianceRed : selectedMatch.allianceBlue;
    const newTeamScores = { ...(alliance.teamScores || {}), [teamId]: score };

    const newMatch = {
      ...selectedMatch,
      allianceRed: color === 'RED' ? { ...selectedMatch.allianceRed, teamScores: newTeamScores } : selectedMatch.allianceRed,
      allianceBlue: color === 'BLUE' ? { ...selectedMatch.allianceBlue, teamScores: newTeamScores } : selectedMatch.allianceBlue,
      status: 'SCORING' as const,
    };
    setSelectedMatch(newMatch);
    setMatches(prev => prev.map(m => m.id === newMatch.id ? newMatch : m));
  };

  const submitScore = async () => {
    if (!selectedMatch) return;
    const final = { ...selectedMatch, status: 'PENDING' as const };
    try {
      await api.updateMatch(final.id, { status: final.status, allianceRed: final.allianceRed, allianceBlue: final.allianceBlue });
      setSelectedMatch(null);
      alert('Gửi điểm thành công cho BTC!');
    } catch (err: any) {
      alert('Lỗi gửi điểm: ' + err.message);
    }
  };

  // ── Scoring form component ──────────────────
  const ScoringForm = () => {
    if (!selectedMatch) return null;

    const renderScoreColumn = (color: 'RED' | 'BLUE') => {
      const alliance = color === 'RED' ? selectedMatch.allianceRed : selectedMatch.allianceBlue;
      const c = color === 'RED' ? 'red' : 'blue';
      return (
        <div className={`flex-1 space-y-4 p-6 rounded-[3rem] ${color === 'RED' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'} border-2`}>
          <div className={`p-5 rounded-3xl bg-${c}-600 text-white text-center shadow-lg`}>
            <h3 className="font-black uppercase text-xl tracking-tighter italic">LIÊN MINH {color === 'RED' ? 'ĐỎ' : 'XANH'}</h3>
            <p className="text-[10px] opacity-75 font-bold uppercase tracking-widest">{alliance.teams.map(tid => getTeamName(tid)).join(' & ')}</p>
          </div>

          {/* Balls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Bóng Vàng (3đ)</p>
              <div className="flex items-center gap-3">
                <button onClick={() => updateAllianceScore(color, 'yellowBalls', Math.max(0, alliance.score.yellowBalls - 1))} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 font-black text-2xl">-</button>
                <span className="flex-1 text-center font-black text-3xl text-slate-900">{alliance.score.yellowBalls}</span>
                <button onClick={() => updateAllianceScore(color, 'yellowBalls', alliance.score.yellowBalls + 1)} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 font-black text-2xl">+</button>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Bóng Trắng (1đ)</p>
              <div className="flex items-center gap-3">
                <button onClick={() => updateAllianceScore(color, 'whiteBalls', Math.max(0, alliance.score.whiteBalls - 1))} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 font-black text-2xl">-</button>
                <span className="flex-1 text-center font-black text-3xl text-slate-900">{alliance.score.whiteBalls}</span>
                <button onClick={() => updateAllianceScore(color, 'whiteBalls', alliance.score.whiteBalls + 1)} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 font-black text-2xl">+</button>
              </div>
            </div>
          </div>

          {/* Barrier + Cylinders */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-tight text-slate-500">Đẩy rào cản? (+20)</span>
              <input
                type="checkbox"
                checked={alliance.score.pushedBarrier}
                onChange={e => updateAllianceScore(color, 'pushedBarrier', e.target.checked)}
                className="w-8 h-8 accent-emerald-500 rounded-xl cursor-pointer"
              />
            </div>
            <div className="pt-4 border-t border-slate-50">
              <label className="text-[9px] font-black text-slate-400 block mb-2 uppercase text-center">Tổng bóng trụ liên minh</label>
              <div className="w-full p-4 bg-slate-50 border-none rounded-2xl text-center font-black text-2xl text-slate-900">
                {alliance.score.yellowBalls + alliance.score.whiteBalls}
              </div>
            </div>
          </div>

          {/* End Game */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 space-y-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase text-center tracking-[0.2em]">End Game Position</p>
            {[1, 2].map(num => (
              <div key={num}>
                <p className="text-[9px] font-bold text-slate-400 mb-2 text-center">Robot {num}</p>
                <div className="flex gap-2">
                  {(['NONE', 'PARTIAL', 'FULL'] as RobotEndGameState[]).map(s => (
                    <button key={s} onClick={() => updateAllianceScore(color, `robot${num}EndGame` as any, s)}
                      className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black border transition-all ${
                        alliance.score[`robot${num}EndGame` as keyof AllianceScore] === s
                          ? `bg-${c}-600 text-white border-${c}-600 shadow-md`
                          : 'bg-slate-50 text-slate-400 border-slate-100'
                      }`}>
                      {s === 'NONE' ? 'Không' : s === 'PARTIAL' ? 'Partial' : 'Full'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Penalties & Cards */}
          <div className="bg-slate-50 p-5 rounded-3xl space-y-4 border border-slate-100">
            <div className="flex justify-between items-center text-[10px] uppercase font-black text-slate-500">
              <span>Penalty (-5đ)</span>
              <div className="flex items-center gap-3">
                <button onClick={() => updateAllianceScore(color, 'penalties', Math.max(0, alliance.score.penalties - 1))} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 font-black">-</button>
                <span className="text-slate-900 w-6 text-center text-xl">{alliance.score.penalties}</span>
                <button onClick={() => updateAllianceScore(color, 'penalties', alliance.score.penalties + 1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 font-black">+</button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-200 text-orange-600 font-black text-[10px] uppercase">
              <span>THẺ VÀNG (-10đ)</span>
              <input type="checkbox" checked={alliance.score.yellowCard} onChange={e => updateAllianceScore(color, 'yellowCard', e.target.checked)} className="w-8 h-8 accent-orange-500 rounded-lg" />
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-200 text-red-600 font-black text-[10px] uppercase">
              <span>THẺ ĐỎ (0đ toàn trận)</span>
              <input type="checkbox" checked={alliance.score.redCards} onChange={e => updateAllianceScore(color, 'redCards', e.target.checked)} className="w-8 h-8 accent-red-600 rounded-lg" />
            </div>
          </div>

          {/* Individual Team Scores (ADJUSTMENT) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 space-y-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase text-center tracking-[0.2em]">Điểm riêng từng đội (Tùy chỉnh)</p>
            {alliance.teams.map(tid => {
              const currentVal = alliance.teamScores?.[tid] ?? alliance.score.finalScore;
              return (
                <div key={tid} className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-2xl">
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-900 uppercase leading-tight">{getTeamName(tid)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={currentVal}
                      onChange={e => updateTeamScore(color, tid, parseFloat(e.target.value) || 0)}
                      className="w-32 p-2 px-3 rounded-xl border border-slate-200 text-center font-black text-xl bg-white shadow-sm appearance-none"
                      style={{ MozAppearance: 'textfield' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Final Score */}
          <div className={`p-6 rounded-[2.5rem] bg-white border-4 border-${c}-500 text-center shadow-xl`}>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Điểm Tạm Tính</p>
            <p className="text-6xl font-black text-slate-900 tracking-tighter">{alliance.score.finalScore}</p>
          </div>
        </div>
      );
    };

    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in">
        <div className="flex items-center justify-between sticky top-4 bg-white/80 backdrop-blur-md py-4 px-6 rounded-3xl z-40 border border-slate-200 shadow-xl">
          <button onClick={() => setSelectedMatch(null)} className="text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600">&larr; Quay lại</button>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900">CHẤM ĐIỂM TRẬN #{selectedMatch.matchNumber} <span className="text-blue-600">SÂN {selectedMatch.field}</span></h2>
          <button onClick={submitScore} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3.5 rounded-2xl font-black text-[11px] uppercase shadow-lg transition-all active:scale-95 flex items-center gap-2">
            Xác nhận gửi <CheckCircle2 size={18} />
          </button>
        </div>
        <div className="flex flex-col lg:flex-row gap-8">
          {renderScoreColumn('RED')}
          {renderScoreColumn('BLUE')}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════
  // JUDGE PORTAL
  // ════════════════════════════════════════════
  const JudgePortal = () => {
    const myFieldMatches = useMemo(() => {
      if (role === 'ADMIN') return matches.filter(m => m.status !== 'LOCKED');
      return matches.filter(m => m.field === currentUser?.assignedField && m.status !== 'LOCKED');
    }, [matches, currentUser, role]);

    if (selectedMatch) {
      return <ScoringForm />;
    }

    // ── Match list for judge ────────────────────
    return (
      <div className="space-y-10 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div className="text-center p-12 bg-white rounded-[4rem] relative overflow-hidden border border-slate-200 shadow-sm">
          <p className="text-blue-600 text-[15px] font-black uppercase tracking-[0.2em] mb-4">Trạm chấm điểm thực địa 2026</p>
          <h2 className="text-5xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
            {role === 'ADMIN' ? 'DANH SÁCH TẤT CẢ SÂN' : `KHU VỰC SÂN THI ĐẤU ${currentUser?.assignedField}`}
          </h2>
          <p className="text-slate-400 font-bold mt-4">Trọng tài: <span className="text-slate-900">{currentUser?.name}</span></p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {myFieldMatches.sort((a, b) => a.matchNumber - b.matchNumber).map(m => (
            <button key={m.id} onClick={() => handleSelectMatch(m)}
              className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 hover:border-blue-500 hover:shadow-2xl transition-all text-left flex justify-between items-center group relative overflow-hidden shadow-sm">
              <div className="flex-1">
                <div className="flex gap-2 mb-4">
                  <span className="text-[10px] font-black bg-slate-100 px-4 py-1.5 rounded-full text-slate-500 uppercase">Trận #{m.matchNumber}</span>
                  <span className="text-[10px] font-black bg-blue-50 px-4 py-1.5 rounded-full text-blue-600 uppercase">SÂN {m.field}</span>
                </div>
                <div className="font-black text-3xl tracking-tighter leading-none">
                  <span className="text-red-600">{m.allianceRed.teams.map(id => getTeamName(id)).join(' & ')}</span>
                  <div className="text-slate-200 my-3 italic text-sm font-black">VS</div>
                  <span className="text-blue-600">{m.allianceBlue.teams.map(id => getTeamName(id)).join(' & ')}</span>
                </div>
              </div>
              <div className={`p-6 rounded-3xl ${m.status === 'PENDING' ? 'bg-orange-50 text-orange-500' : 'bg-slate-50 text-slate-300'} group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:translate-x-2 shadow-sm`}>
                <ChevronRight size={32} />
              </div>
            </button>
          ))}
          {myFieldMatches.length === 0 && (
            <div className="col-span-full py-40 text-center bg-white rounded-[4rem] border border-slate-100 border-dashed">
              <Trophy size={80} className="mx-auto text-slate-100 mb-6" />
              <p className="text-slate-300 font-black italic uppercase tracking-[0.2em]">Chưa có lượt thi đấu mới cho sân này</p>
            </div>
          )}
        </div>
        {role === 'ADMIN' && (
          <button onClick={() => setActivePortal('ADMIN')} className="block mx-auto text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-900 border-b border-slate-200 pb-1">
            Trở lại khu vực BTC
          </button>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50">
      {!activePortal ? (
        <LoginView />
      ) : (
        <>
          <header className="bg-gradient-to-r from-blue-900 to-blue-800 sticky top-0 z-50 px-10 h-16 flex items-center justify-between print:hidden shadow-lg">
            <div className="flex items-center gap-4">
              <img src={logoFanroc} alt="FANROC" className="h-12 object-contain" />
              <div>
                <h1 className="font-black text-3xl tracking-tighter text-white italic uppercase leading-none">FANROC <span className="text-blue-300">2026</span></h1>
                <p className="text-[10px] font-black text-blue-200 uppercase tracking-[0.3em] mt-2">v2.6 Real-time</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <img src={logoRobot} alt="Robot" className="h-10 object-contain" />
              <div className="hidden lg:block text-right border-r border-blue-700 pr-6 mr-6">
                <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">{currentUser?.name || 'KHÁN GIẢ'}</p>
                <p className="text-[9px] font-black text-blue-300 uppercase tracking-[0.3em] mt-2">
                  {activePortal === 'ADMIN' ? 'SUPER BTC' : activePortal === 'JUDGE' ? `GK SÂN ${currentUser?.assignedField}` : 'VIEWER'}
                </p>
              </div>
              <button onClick={handleLogout} className="w-12 h-12 flex items-center justify-center bg-blue-800 border border-blue-700 text-blue-300 hover:text-white hover:bg-blue-700 rounded-2xl transition-all active:scale-90 shadow-sm">
                <LogOut size={24} />
              </button>
            </div>
          </header>

          <main className="max-w-[1400px] mx-auto px-10 py-12 pb-40">
            {activePortal === 'ADMIN' && (
              <div key="admin-portal">
                <AdminView />
              </div>
            )}
            {activePortal === 'JUDGE' && (
              <div key="judge-portal">
                <JudgePortal />
              </div>
            )}
            {activePortal === 'VIEWER' && (
              <div key="viewer-portal">
                <ViewerView />
              </div>
            )}
          </main>

          {/* Global Modals (Admin only features usually, but visibility is handled by activePortal check if needed) */}
          {editingMatch && activePortal === 'ADMIN' && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl w-full max-w-3xl p-8 relative">
                <button
                  type="button"
                  onClick={() => { setEditingMatch(null); setMatchEditError(''); }}
                  className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-sm font-black"
                >
                  ✕
                </button>
                <h3 className="text-xl font-black uppercase tracking-tighter text-slate-900 mb-4">
                  Chỉnh sửa trận #{editingMatch.matchNumber} – Sân {editingMatch.field}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500">Liên minh ĐỎ</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {editingMatch.startTime} – {editingMatch.endTime}
                      </span>
                    </div>
                    {editingMatch.allianceRed.teams.map((tid, idx) => (
                      <select
                        key={idx}
                        value={tid}
                        onChange={e => handleChangeAllianceTeam('RED', idx, e.target.value)}
                        className="w-full max-w-xs p-2 rounded-xl border bg-red-50/60 text-sm"
                      >
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} – {t.school}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-500">Liên minh XANH</span>
                      <button
                        type="button"
                        onClick={handleSwapAlliances}
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900"
                      >
                        Hoán đổi Đỏ ↔ Xanh
                      </button>
                    </div>
                    {editingMatch.allianceBlue.teams.map((tid, idx) => (
                      <select
                        key={idx}
                        value={tid}
                        onChange={e => handleChangeAllianceTeam('BLUE', idx, e.target.value)}
                        className="w-full max-w-xs p-2 rounded-xl border bg-blue-50/60 text-sm"
                      >
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} – {t.school}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                </div>
                {matchEditError && (
                  <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-2xl p-3 whitespace-pre-line">
                    {matchEditError}
                  </div>
                )}
                <div className="mt-6 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleDeleteMatch}
                    disabled={isSavingMatch}
                    className="px-5 py-3 rounded-2xl bg-red-50 text-red-600 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-100 disabled:opacity-50"
                  >
                    Xóa trận này
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingMatch(null); setMatchEditError(''); }}
                    className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-[0.2em]"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMatchEdit}
                    disabled={isSavingMatch}
                    className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedTeamForMatches && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl w-full max-w-4xl p-8 relative max-h-[80vh] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedTeamForMatches(null)}
                  className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-sm font-black"
                >
                  ✕
                </button>
                <div className="mb-6">
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-2">
                    Các trận đấu của đội: {selectedTeamForMatches.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.25em]">
                    {selectedTeamForMatches.school}
                  </p>
                </div>

                {(() => {
                  const teamMatches = getTeamMatches(selectedTeamForMatches.id);
                  if (teamMatches.length === 0) {
                    return (
                      <div className="py-12 text-center">
                        <p className="text-slate-300 font-black italic uppercase tracking-[0.2em]">Đội này chưa có trận đấu nào</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {teamMatches.map(m => {
                        const isRedAlliance = m.allianceRed.teams.includes(String(selectedTeamForMatches.id));
                        const allianceTeams = isRedAlliance ? m.allianceRed.teams : m.allianceBlue.teams;
                        const opponentTeams = isRedAlliance ? m.allianceBlue.teams : m.allianceRed.teams;
                        const allianceName = isRedAlliance ? 'Đỏ' : 'Xanh';

                        return (
                          <div
                            key={m.id}
                            className="w-full p-4 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-2xl transition-all group"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-600">Trận #{m.matchNumber}</span>
                                  <span className={`text-[10px] font-black px-3 py-1 rounded-full ${isRedAlliance ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                    Liên minh {allianceName}
                                  </span>
                                  <span className="text-[10px] font-black bg-slate-50 px-3 py-1 rounded-full text-slate-600">Sân {m.field}</span>
                                </div>
                                <div className="text-sm font-bold text-slate-700">
                                  {allianceTeams.map(tid => getTeamName(tid)).join(' & ')}
                                  <span className="text-slate-400 mx-2">vs</span>
                                  {opponentTeams.map(tid => getTeamName(tid)).join(' & ')}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-1">
                                  {m.startTime} – {m.endTime}
                                  <span className="mx-2">•</span>
                                  <span className={`font-bold ${m.status === 'LOCKED' ? 'text-emerald-600' : m.status === 'PENDING' ? 'text-orange-600' : m.status === 'SCORING' ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {m.status === 'LOCKED' ? 'Đã khóa' : m.status === 'PENDING' ? 'Chờ duyệt' : m.status === 'SCORING' ? 'Đang chấm' : 'Chờ thi'}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-slate-400 font-bold mb-2">Điểm Alliance</p>
                                <div className="flex gap-2 mb-2 text-sm font-black justify-end">
                                  <span className="text-red-600">{m.allianceRed.score?.finalScore || 0}</span>
                                  <span className="text-slate-300">-</span>
                                  <span className="text-blue-600">{m.allianceBlue.score?.finalScore || 0}</span>
                                </div>
                                {(() => {
                                  const alliance = isRedAlliance ? m.allianceRed : m.allianceBlue;
                                  const teamScore = alliance.teamScores?.[String(selectedTeamForMatches.id)] ?? alliance.score.finalScore;
                                  if (teamScore !== alliance.score.finalScore) {
                                    return (
                                      <div className="mt-1">
                                        <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">Điểm riêng: {teamScore}</p>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                                {activePortal === 'ADMIN' && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditTeamScoreDirectly(m, String(selectedTeamForMatches.id))}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700 transition-all"
                                  >
                                    SỬA
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
