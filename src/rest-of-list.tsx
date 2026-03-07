import React, { useState, useEffect, useRef } from 'react';

interface Team {
  id: string | number;
  name: string;
  school: string;
  stt?: number;
  matchesPlayed: number;
  totalPoints: number;
  bioPointsTotal: number;
  highestMatchScore: number;
}

interface LeaderboardProps {
  others: Team[];
  leaderboard: any[];
  isAdmin?: boolean;
  onTeamClick?: (teamId: string | number) => void;
}

export default function AutomaticLeaderboard({ others, leaderboard, isAdmin, onTeamClick }: LeaderboardProps): JSX.Element {
  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  
  // Quan trọng: Dùng Ref để lưu vị trí cuộn chính xác dưới dạng số thực (float)
  const currentScrollPos = useRef(0);

  const scrollSpeed = 30; // Tăng lên 30px/s để thấy rõ chuyển động

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined && scrollRef.current && isAutoScroll && !isHovered) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      const container = scrollRef.current;

      // Tính toán vị trí mới dựa trên số thực để tránh lỗi làm tròn của trình duyệt
      currentScrollPos.current += scrollSpeed * deltaTime;

      // Nếu cuộn hết bảng thì reset về 0
      if (currentScrollPos.current >= container.scrollHeight - container.clientHeight) {
        currentScrollPos.current = 0;
      }

      // Gán giá trị đã tính vào scrollTop
      container.scrollTop = currentScrollPos.current;
    }
    
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isAutoScroll) {
      // Reset về vị trí 0 (rank 1) khi bắt đầu auto-scroll
      if (scrollRef.current) {
        currentScrollPos.current = 0;
        scrollRef.current.scrollTop = 0;
      }

      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isAutoScroll, isHovered]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto p-4">
      {/* Nút bấm giữ nguyên logic cũ */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsAutoScroll(!isAutoScroll)}
          className={`px-8 py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl ${
            isAutoScroll ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 border'
          }`}
        >
          {isAutoScroll ? '● Auto Scroll ON' : '○ Auto Scroll OFF'}
        </button>
      </div>

      <div 
        className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div 
          ref={scrollRef}
          /* LƯU Ý CỰC KỲ QUAN TRỌNG: 
             1. Xóa class 'scroll-smooth' nếu có.
             2. Đảm bảo có 'overflow-y-auto' và 'max-h'.
          */
          className="overflow-y-auto max-h-[70vh] select-none shadow-inner"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            scrollBehavior: 'auto' // Bắt buộc là auto để JS can thiệp chính xác
          }} 
        >
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white z-50 border-b">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-8 py-6">Xếp hạng</th>
                <th className="px-8 py-6">Đội thi</th>
                <th className="px-8 py-6 text-center">Trận</th>
                <th className="px-8 py-6 text-right text-emerald-600">Tổng điểm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {others.map((t, idx) => (
                <tr
                  key={t.id}
                  className={`group transition-colors ${isAdmin ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  onClick={() => isAdmin && onTeamClick?.(t.id)}
                >
                  <td className="px-8 py-6 font-black italic text-2xl">
                    <span className="text-slate-400">
                      #{idx + 1}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <p className={`font-black uppercase ${isAdmin ? 'text-blue-600 group-hover:text-blue-700' : 'text-slate-800'}`}>{t.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{t.school}</p>
                  </td>
                  <td className="px-8 py-6 text-center font-bold text-blue-500">{t.matchesPlayed}</td>
                  <td className="px-8 py-6 text-right font-black text-2xl text-emerald-600">
                    {t.totalPoints.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}