// ============================================
// FANROC 2026 – Matches Routes
// ============================================
const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { computeScheduleStatistics } = require('../schedulerStats');

// Hàm bỏ dấu tiếng Việt + đưa về lowercase để so sánh trường học không phân biệt hoa/thường/dấu
function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ── helpers ──────────────────────────────────

const INITIAL_SCORE = {
  yellowBalls: 0,
  whiteBalls: 0,
  pushedBarrier: false,
  barrierStatus: 'NOT_COMPLETED',
  ownCylinderBalls: 0,
  opponentCylinderBalls: 0,
  robot1EndGame: 'NONE',
  robot2EndGame: 'NONE',
  penalties: 0,
  yellowCard: false,
  redCards: false,
  calculatedBioPoints: 0,
  balanceFactor: 2.0,
  endGamePoints: 0,
  finalScore: 0,
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════
// RANDOM LỊCH ĐẤU – TUÂN THỦ ĐẦY ĐỦ QUY TẮC MỚI
// ═══════════════════════════════════════════════════
//
// BẮT BUỘC:
//  1. Mỗi trận = 4 đội khác nhau (2 Đỏ + 2 Xanh)
//  2. Mỗi đội thi ĐÚNG 4 trận (không thừa, không thiếu)
//  3. Trận đấu diễn ra TUẦN TỰ, không chạy song song
//  4. Một đội KHÔNG được thi HAI TRẬN LIỀN NHAU
//     → Giữa 2 lần thi của 1 đội phải có ít nhất 1 trận nghỉ
//  5. THCS Hữu Bằng: 2 đội HB không được cùng 1 liên minh
//
// ƯU TIÊN (mềm):
//  - Tránh 2 đội gặp nhau quá nhiều lần
//  - Đa dạng liên minh / đối thủ
//  - Số trận giữa các đội cân bằng (chênh lệch tối đa = 1)
//
// TỔ CHỨC SÂN (CỐ ĐỊNH – KHÔNG ĐỔI):
//  - Các trận chạy lần lượt: Trận 1, 2, 3, 4, ...
//  - Sân quay vòng: 1 → 2 → 3 → 1 → 2 → 3 → ...
//  - Mỗi thời điểm chỉ có 1 trận (1 sân đang hoạt động)
// ═══════════════════════════════════════════════════

function generateRandomMatchSlots(teams) {
  const REQUIRED_MATCHES = 4;
  const n = teams.length;
  if (n < 4) return [];

  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t; });
  const teamIds = teams.map(t => t.id);

  function getSchool(tid) {
    const t = teamMap[tid];
    return t && t.school ? t.school : '';
  }

  function isSameSchool(t1, t2) {
    const s1 = normalizeText(getSchool(t1));
    const s2 = normalizeText(getSchool(t2));
    return s1 && s2 && s1 === s2;
  }

  function isHuuBang(tid) {
    const s = normalizeText(getSchool(tid));
    return s.includes('thcs huu bang');
  }

  function isNamTuLiem(tid) {
    const s = normalizeText(getSchool(tid));
    return s.includes('thcs nam tu liem');
  }

  // Không cho:
  //  - Hai đội cùng trường đứng chung 1 liên minh
  //  - THCS Hữu Bằng đứng chung liên minh với THCS Nam Từ Liêm
  function canBeAlliance(t1, t2) {
    if (isSameSchool(t1, t2)) return false;
    if ((isHuuBang(t1) && isNamTuLiem(t2)) || (isHuuBang(t2) && isNamTuLiem(t1))) return false;
    return true;
  }

  console.log(`  [Schedule] ${n} đội – tạo lịch tuần tự, quay vòng sân 1→2→3`);

  // ── Thử nhiều lần (ưu tiên 4 trận/đội, không thi 2 trận liên tiếp) ──
  const MAX_ATTEMPTS = 500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Truyền BẢN SAO để tránh mutate teamIds gốc giữa các attempt
    const result = tryGenerate([...teamIds], REQUIRED_MATCHES, canBeAlliance);
    if (result) {
      const total = result.reduce((s, slot) => s + slot.length, 0);
      console.log(`  [Schedule] Thành công ở lần thử #${attempt + 1}: ${total} trận, ${result.length} khung xếp (sẽ ánh xạ tuần tự 1 trận/mốc thời gian)`);
      return result;
    }
  }

  throw new Error(
    `Không thể tạo lịch hợp lệ sau ${MAX_ATTEMPTS} lần thử với điều kiện MỖI ĐỘI ĐÚNG 4 TRẬN ` +
    `và không thi 2 trận liên tiếp. Kiểm tra lại số lượng đội (${n}) và số lượt/đội (4).`
  );
}

/**
 * Thử tạo lịch 1 lần (theo "khung xếp" nội bộ).
 * Sau khi tạo xong, các trận sẽ được ánh xạ TUẦN TỰ:
 *  - Trận sau bắt đầu ngay khi trận trước kết thúc
 *  - Sân quay vòng 1 → 2 → 3 → ...
 * Đồng thời cố gắng: mỗi đội được NGHỈ ít nhất 1 trận giữa 2 lần thi
 * (không chơi ở 2 "khung xếp" liên tiếp; khi flatten sẽ tương đương không chơi 2 trận liên tiếp).
 *
 * LƯU Ý: Không mutate mảng teamIds gốc bên ngoài (dễ gây lệch fairness giữa các attempt),
 * nên clone sang localTeamIds cho toàn bộ logic bên trong.
 */
function tryGenerate(inputTeamIds, requiredMatches, canBeAlliance) {
  const teamIds = [...inputTeamIds];
  const n = teamIds.length;
  const matchCount = {};
  teamIds.forEach(id => { matchCount[id] = 0; });

  const pairCount = {};
  function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  const totalMatches = (n * requiredMatches) / 4;
  const timeSlots = [];
  let matchesCreated = 0;
  let consecutiveFails = 0;
  let slotIdx = 0;
  const lastSlotPlayed = {};
  teamIds.forEach(id => { lastSlotPlayed[id] = -1000; });

  while (matchesCreated < totalMatches) {
    if (consecutiveFails > 100) return null;

    // Đội còn cần thi (chưa đủ requiredMatches trận)
    const eligibleRaw = teamIds.filter(id => matchCount[id] < requiredMatches);
    if (eligibleRaw.length < 4) {
      return matchesCreated === totalMatches ? timeSlots : null;
    }

    // REST CỨNG: KHÔNG cho đội chơi ở 2 "khung xếp" liên tiếp
    // (mỗi khung xếp tương ứng 1 trận sau khi flatten ⇒ không thi 2 trận liên tiếp).
    const eligible = eligibleRaw.filter(id => slotIdx - lastSlotPlayed[id] >= 2);
    if (eligible.length < 4) {
      // Không đủ đội có nghỉ tối thiểu 1 khung ⇒ lịch này thất bại
      return null;
    }

    // Mỗi "khung xếp" chỉ chứa 1 trận → lịch tuần tự, không song song.
    const target = 1;
    const slotMatches = tryFillTimeSlot(
      eligible, target, matchCount, canBeAlliance, pairCount, pairKey
    );

    if (!slotMatches || slotMatches.length === 0) {
      consecutiveFails++;
      continue;
    }

    // Commit khung giờ
    for (const match of slotMatches) {
      const all4 = [...match.allianceRed.teams, ...match.allianceBlue.teams];
      for (const tid of all4) matchCount[tid]++;
      for (let i = 0; i < all4.length; i++) {
        for (let j = i + 1; j < all4.length; j++) {
          const k = pairKey(all4[i], all4[j]);
          pairCount[k] = (pairCount[k] || 0) + 1;
        }
      }
      // Cập nhật slot cuối thi đấu để áp dụng REST cho slot sau
      const allTeams = [...match.allianceRed.teams, ...match.allianceBlue.teams];
      allTeams.forEach(id => { lastSlotPlayed[id] = slotIdx; });
    }

    // Sau khi commit, ưu tiên các đội đang có ít trận hơn cho lần chọn tiếp theo
    teamIds.sort((a, b) => matchCount[a] - matchCount[b] || a.localeCompare(b));

    timeSlots.push(slotMatches);
    matchesCreated += slotMatches.length;
    consecutiveFails = 0;
    slotIdx++;
  }

  // Kiểm tra: mỗi đội phải có ĐÚNG requiredMatches trận
  for (const id of teamIds) {
    if (matchCount[id] !== requiredMatches) return null;
  }

  return timeSlots;
}

/**
 * Last-resort: Cho phép tối đa `maxFiveMatchTeams` đội thi 5 trận
 * để phá kẹt lịch nhưng vẫn giữ chênh lệch số trận tối đa = 1.
 *
 * Giống tryGenerate: luôn CLONE đầu vào để không mutate mảng gốc.
 */
function tryGenerateAllowingFive(inputTeamIds, requiredMatches, canBeAlliance, maxFiveMatchTeams) {
  const teamIds = [...inputTeamIds];
  const matchCount = {};
  teamIds.forEach(id => { matchCount[id] = 0; });

  const pairCount = {};
  function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  const timeSlots = [];
  let slotIdx = 0;
  const lastSlotPlayed = {};
  teamIds.forEach(id => { lastSlotPlayed[id] = -1000; });

  // Giới hạn số khung xếp để tránh vòng lặp vô hạn
  for (; slotIdx < 1000; slotIdx++) {
    const under4Raw = teamIds.filter(id => matchCount[id] < requiredMatches);
    const exactly4 = teamIds.filter(id => matchCount[id] === requiredMatches);
    const over4 = teamIds.filter(id => matchCount[id] > requiredMatches);

    // Nếu tất cả đội đã có ít nhất requiredMatches trận
    if (under4Raw.length === 0) {
      // Kiểm tra fairness: không đội nào có > requiredMatches + 1
      const tooMany = over4.filter(id => matchCount[id] > requiredMatches + 1);
      if (tooMany.length > 0) return null;
      const minMatches = Math.min(...teamIds.map(id => matchCount[id]));
      const maxMatches = Math.max(...teamIds.map(id => matchCount[id]));
      if (maxMatches - minMatches > 1) return null;
      const fiveCount = teamIds.filter(id => matchCount[id] === requiredMatches + 1).length;
      if (fiveCount > maxFiveMatchTeams) return null;
      return timeSlots;
    }

    // Ưu tiên đội được nghỉ ít nhất 1 trận (slotIdx - lastSlot >= 2)
    const under4Rest = under4Raw.filter(id => slotIdx - lastSlotPlayed[id] >= 2);
    const under4Sorted = (under4Rest.length >= 4 ? under4Rest : under4Raw)
      .sort((a, b) => matchCount[a] - matchCount[b] || a.localeCompare(b));

    // Khi không đủ đội <4 trận, có thể lấy thêm đội đã đủ 4 trận (lên 5) nhưng giới hạn.
    const fiveCountCurrent = teamIds.filter(id => matchCount[id] > requiredMatches).length;
    const canUseExtra = maxFiveMatchTeams - fiveCountCurrent;

    let pool = [];
    if (under4Sorted.length >= 4) {
      pool = under4Sorted.slice(0, 8); // ưu tiên một tập nhỏ nhất để thử
    } else {
      const needMore = 4 - under4Sorted.length;
      if (canUseExtra <= 0) break;
      const extraCandidates = exactly4
        .filter(id => slotIdx - lastSlotPlayed[id] >= 2)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, Math.min(needMore, canUseExtra));
      pool = [...under4Sorted, ...extraCandidates];
    }

    // Sau khi chọn pool, áp dụng REST cứng
    pool = pool.filter(id => slotIdx - lastSlotPlayed[id] >= 2);
    if (pool.length < 4) continue;

    const target = 1; // mỗi khung xếp 1 trận
    const slotMatches = tryFillTimeSlot(pool, target, matchCount, canBeAlliance, pairCount, pairKey);
    if (!slotMatches || slotMatches.length === 0) continue;

    // Ghi nhận trận – kiểm soát QUOTA cứng: không đội nào vượt quá requiredMatches + 1
    for (const match of slotMatches) {
      const all4 = [...match.allianceRed.teams, ...match.allianceBlue.teams];
      for (const tid of all4) {
        const next = (matchCount[tid] || 0) + 1;
        // Nếu bất kỳ đội nào bị vượt quota (ví dụ 6+ trận khi requiredMatches = 4)
        // thì lịch này coi như không hợp lệ → trả null để generate lại từ đầu.
        if (next > requiredMatches + 1) {
          return null;
        }
        matchCount[tid] = next;
      }
      for (let i = 0; i < all4.length; i++) {
        for (let j = i + 1; j < all4.length; j++) {
          const k = pairKey(all4[i], all4[j]);
          pairCount[k] = (pairCount[k] || 0) + 1;
        }
      }
      all4.forEach(id => { lastSlotPlayed[id] = slotIdx; });
    }

    timeSlots.push(slotMatches);
  }

  return null;
}

/**
 * Thử xếp `target` trận trong 1 khung giờ.
 * Đảm bảo: mỗi đội chỉ xuất hiện 1 lần trong khung giờ (→ thi 1 sân duy nhất).
 * Thử 60 lần shuffle khác nhau cho mỗi target.
 */
function tryFillTimeSlot(eligible, target, matchCount, canBeAlliance, pairCount, pairKey) {
  const needed = target * 4;
  if (eligible.length < needed) return null;

  const SLOT_ATTEMPTS = 60;
  const MAX_MATCHES = 4;

  for (let sa = 0; sa < SLOT_ATTEMPTS; sa++) {
    // Nhóm theo matchCount, shuffle trong nhóm, ưu tiên ít trận nhất
    const grouped = {};
    for (const id of eligible) {
      const mc = matchCount[id];
      if (!grouped[mc]) grouped[mc] = [];
      grouped[mc].push(id);
    }

    const ordered = [];
    const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    for (const mc of sortedKeys) {
      // Light shuffle: giữ ưu tiên fairness nhưng vẫn có chút ngẫu nhiên
      const g = grouped[mc];
      for (let i = g.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * Math.min(3, i + 1));
        [g[i], g[j]] = [g[j], g[i]];
      }
      ordered.push(...g);
    }

    // Lấy `needed` đội (ưu tiên ít trận nhất) với kiểm tra quota và không trùng trong pool
    const pool = [];
    const chosen = new Set();
    for (const id of ordered) {
      if (matchCount[id] >= MAX_MATCHES) continue;
      if (chosen.has(id)) continue;
      chosen.add(id);
      pool.push(id);
      if (pool.length === needed) break;
    }
    if (pool.length < needed) continue;

    // Shuffle pool rồi chia thành các nhóm 4
    const shuffled = shuffleArray(pool);
    const matches = [];
    let ok = true;

    for (let m = 0; m < target; m++) {
      const four = shuffled.slice(m * 4, m * 4 + 4);
      if (four.length < 4) { ok = false; break; }

      const match = bestSplit(four, canBeAlliance, pairCount, pairKey);
      if (!match) { ok = false; break; }

      // Đảm bảo trong 1 match không có đội trùng
      const allTeams = [...match.allianceRed.teams, ...match.allianceBlue.teams];
      const set = new Set(allTeams);
      if (set.size !== 4) { ok = false; break; }

      matches.push(match);
    }

    if (ok && matches.length === target) {
      // Verify: không đội nào xuất hiện 2 lần trong khung giờ
      const allTeamsInSlot = new Set();
      let dup = false;
      for (const match of matches) {
        for (const tid of [...match.allianceRed.teams, ...match.allianceBlue.teams]) {
          if (allTeamsInSlot.has(tid)) { dup = true; break; }
          allTeamsInSlot.add(tid);
        }
        if (dup) break;
      }
      if (!dup) return matches;
    }
  }

  return null;
}

/**
 * Tìm cách chia 4 đội thành 2 liên minh tốt nhất.
 * Có 3 cách chia: (AB vs CD), (AC vs BD), (AD vs BC).
 * Chọn cách hợp lệ (THCS HB) + ít trùng cặp nhất.
 */
function bestSplit(four, canBeAlliance, pairCount, pairKey) {
  const [a, b, c, d] = four;
  const splits = [
    { red: [a, b], blue: [c, d] },
    { red: [a, c], blue: [b, d] },
    { red: [a, d], blue: [b, c] },
  ];

  let best = null;
  let bestScore = Infinity;

  for (const sp of splits) {
    // Kiểm tra ràng buộc THCS Hữu Bằng
    if (!canBeAlliance(sp.red[0], sp.red[1])) continue;
    if (!canBeAlliance(sp.blue[0], sp.blue[1])) continue;

    const all = [...sp.red, ...sp.blue];

    // HARD CONSTRAINT: Không cho phép bất kỳ cặp đội nào gặp nhau ≥ 3 lần
    // (pairCount >= 2 → trận này sẽ là lần thứ 3 trở lên) để hạn chế lặp lại.
    let tooManyRepeats = false;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const k = pairKey(all[i], all[j]);
        if ((pairCount[k] || 0) >= 2) {
          tooManyRepeats = true;
          break;
        }
      }
      if (tooManyRepeats) break;
    }
    if (tooManyRepeats) continue;

    // Điểm = tổng pairCount (càng thấp càng đa dạng) – sau khi đã loại các cặp có nguy cơ lặp ≥ 3
    let score = 0;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        score += pairCount[pairKey(all[i], all[j])] || 0;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      best = sp;
    }
  }

  if (!best) return null;

  return {
    allianceRed: { teams: best.red, score: { ...INITIAL_SCORE } },
    allianceBlue: { teams: best.blue, score: { ...INITIAL_SCORE } },
    status: 'UPCOMING',
  };
}

/**
 * Gán thời gian, sân, matchNumber, id cho các trận đã xếp.
 *
 * QUY TẮC MỚI:
 *  - Các trận diễn ra TUẦN TỰ, không song song
 *  - Trận sau bắt đầu ngay khi trận trước kết thúc
 *  - Sân quay vòng 1 → 2 → 3 → 1 → 2 → 3 → ...
 */
function assignTimeAndFieldRotation(timeSlots, startTime, matchDuration) {
  const [hh, mm] = startTime.split(':').map(Number);
  const startMinutes = hh * 60 + mm;
  const toTime = (min) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  const all = [];
  let matchNum = 1;
  let globalIndex = 0;
  const fieldCycle = [1, 2, 3];

  for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
    const slot = timeSlots[slotIdx];
    for (let fi = 0; fi < slot.length; fi++) {
      const matchStart = startMinutes + globalIndex * matchDuration;
      const matchEnd = matchStart + matchDuration;
      const field = fieldCycle[globalIndex % fieldCycle.length];

      all.push({
        ...slot[fi],
        id: uuidv4(),
        matchNumber: matchNum++,
        field,
        startTime: toTime(matchStart),
        endTime: toTime(matchEnd),
      });

      globalIndex++;
    }
  }

  return all;
}

/**
 * Validate toàn bộ lịch – trả về mảng lỗi (rỗng = hợp lệ).
 *
 * Quy tắc kiểm tra:
 *  - Mỗi trận phải có ĐÚNG 4 đội và không trùng đội trong cùng trận
 *  - (STRICT) Mỗi đội phải có đủ requiredMatches trận (khi generate)
 *  - (STRICT) Không đội nào có nhiều hơn requiredMatches + 1 trận (tối đa 5 khi requiredMatches=4)
 *  - (STRICT) Chênh lệch số trận giữa các đội tối đa = 1
 *  - Không đội nào xuất hiện 2 lần trong cùng 1 khung giờ (an toàn khi chỉnh tay)
 *  - Không đội nào thi HAI TRẬN LIỀN NHAU (matchNumber liên tiếp)
 */
function validateSchedule(matches, teamIds, requiredMatches, mode = 'STRICT') {
  const errors = [];
  const matchCount = {};
  teamIds.forEach(id => { matchCount[id] = 0; });

  // Nhóm theo khung giờ
  const bySlot = {};

  for (const m of matches) {
    const all4 = [...m.allianceRed.teams, ...m.allianceBlue.teams];

    // Kiểm tra 4 đội khác nhau
    const unique = new Set(all4);
    if (all4.length !== 4) {
      errors.push(`Trận #${m.matchNumber}: phải có đúng 4 đội, hiện có ${all4.length} đội (${all4.join(', ')})`);
    }
    if (unique.size !== all4.length) {
      errors.push(`Trận #${m.matchNumber}: có đội trùng trong cùng trận (${all4.join(', ')})`);
    }

    // Đếm trận
    for (const tid of all4) {
      matchCount[tid] = (matchCount[tid] || 0) + 1;
    }

    // Nhóm theo khung giờ (startTime)
    const slotKey = m.startTime;
    if (!bySlot[slotKey]) bySlot[slotKey] = [];
    bySlot[slotKey].push(m);
  }

  if (mode === 'STRICT') {
    // Kiểm tra mỗi đội đủ requiredMatches trận
    for (const tid of teamIds) {
      const mc = matchCount[tid] || 0;
      if (mc < requiredMatches) {
        errors.push(`Đội ${tid}: ${mc}/${requiredMatches} trận`);
      }
    }

    // Kiểm tra fairness: không đội nào quá requiredMatches + 1 và chênh lệch tối đa = 1
    const allCounts = teamIds.map(id => matchCount[id] || 0);
    const minMatches = Math.min(...allCounts);
    const maxMatches = Math.max(...allCounts);
    if (maxMatches > requiredMatches + 1) {
      errors.push(`Có đội thi quá nhiều trận (${maxMatches}) so với mức cho phép (${requiredMatches + 1}).`);
    }
    if (maxMatches - minMatches > 1) {
      errors.push(`Chênh lệch số trận giữa các đội đang là ${maxMatches - minMatches} (> 1).`);
    }
  }

  // Kiểm tra mỗi khung giờ: không đội nào xuất hiện > 1 lần
  for (const [time, slotMatches] of Object.entries(bySlot)) {
    const seen = {};
    for (const m of slotMatches) {
      const all4 = [...m.allianceRed.teams, ...m.allianceBlue.teams];
      for (const tid of all4) {
        if (seen[tid]) {
          errors.push(`Khung ${time}: đội ${tid} xuất hiện ở cả trận #${seen[tid]} và #${m.matchNumber}`);
        }
        seen[tid] = m.matchNumber;
      }
    }
  }

  // Kiểm tra: không đội nào thi 2 trận LIỀN NHAU (matchNumber liên tiếp)
  const sortedByMatchNumber = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
  const lastMatchIndex = {};
  for (let idx = 0; idx < sortedByMatchNumber.length; idx++) {
    const m = sortedByMatchNumber[idx];
    const all4 = [...m.allianceRed.teams, ...m.allianceBlue.teams];
    for (const tid of all4) {
      if (lastMatchIndex[tid] !== undefined && idx - lastMatchIndex[tid] === 1) {
        errors.push(`Đội ${tid} thi LIỀN 2 trận (#${sortedByMatchNumber[lastMatchIndex[tid]].matchNumber} và #${m.matchNumber})`);
      }
      lastMatchIndex[tid] = idx;
    }
  }

  return errors;
}

// ── row → JSON helper ────────────────────────
function rowToMatch(row) {
  return {
    id: row.id,
    matchNumber: row.match_number,
    field: row.field,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    allianceRed: typeof row.alliance_red === 'string' ? JSON.parse(row.alliance_red) : row.alliance_red,
    allianceBlue: typeof row.alliance_blue === 'string' ? JSON.parse(row.alliance_blue) : row.alliance_blue,
  };
}

// ── routes ───────────────────────────────────

// GET /api/matches/export-schedule-excel
router.get('/export-schedule-excel', async (req, res) => {
  try {
    const pool = getPool();
    const [matchRows] = await pool.query('SELECT * FROM `matches` ORDER BY match_number');
    const [teams] = await pool.query('SELECT * FROM teams ORDER BY stt');
    const matches = matchRows.map(rowToMatch);

    if (matches.length === 0) {
      return res.status(400).json({ error: 'Chưa có lịch thi đấu để xuất.' });
    }

    const stats = computeScheduleStatistics(matches, teams);
    const teamMap = {};
    teams.forEach(t => { teamMap[t.id] = t; });
    const toName = id => (teamMap[id] ? teamMap[id].name : id);
    const statusLabel = s => ({ UPCOMING: 'Chờ thi', SCORING: 'Đang chấm', PENDING: 'Chờ duyệt', LOCKED: 'Đã khóa' }[s] || s);

    const wb = XLSX.utils.book_new();

    const sheet1Data = matches.map(m => ({
      'Trận': '#' + m.matchNumber,
      'Thời gian': (m.startTime && m.endTime) ? `${m.startTime} – ${m.endTime}` : '-',
      'Sân': m.field ? 'Sân ' + m.field : '-',
      'Liên minh Đỏ': m.allianceRed.teams.map(toName).join(' & '),
      'Liên minh Xanh': m.allianceBlue.teams.map(toName).join(' & '),
      'Trạng thái': statusLabel(m.status),
    }));
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Matches');

    const sheet2Data = stats.teamDetails.map((d, i) => ({
      'STT': i + 1,
      'Tên đội': d.teamName,
      'Trường': d.school,
      'isStrong': d.isStrong ? 'Có' : 'Không',
    // Số trận theo lịch – tổng số trận đội này đã thi
    'Số trận': d.matchCount,
    // Thêm cột rõ ràng hơn để tiện quan sát / lọc trong Excel (same value)
    'Số trận đã thi': d.matchCount,
      'Đồng đội đã gặp': d.uniqueAllies,
      'Đối thủ đã gặp': d.uniqueOpponents,
    }));
    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
    XLSX.utils.book_append_sheet(wb, ws2, 'Team Statistics');

    const sheet3Data = [
      { 'Chỉ số': 'Tổng số đội', 'Giá trị': stats.totalTeams },
      { 'Chỉ số': 'Tổng trận', 'Giá trị': stats.totalMatches },
      { 'Chỉ số': 'Số đội 4 trận', 'Giá trị': stats.teamsWith4 },
      { 'Chỉ số': 'Số đội 5 trận', 'Giá trị': stats.teamsWith5 },
      { 'Chỉ số': 'Match difference', 'Giá trị': stats.fairness.matchDifference },
      { 'Chỉ số': 'Fairness warning', 'Giá trị': stats.fairnessWarning || '-' },
    ];
    const ws3 = XLSX.utils.json_to_sheet(sheet3Data);
    XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=FANROC_2026_Lich_Thi_Dau_Thong_Ke.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM `matches` ORDER BY match_number');
    res.json(rows.map(rowToMatch));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/manual-add – Thêm 1 trận mới thủ công (cuối lịch)
// Body JSON:
// {
//   allianceRedTeams: string[2],
//   allianceBlueTeams: string[2],
//   status?: 'UPCOMING' | 'SCORING' | 'PENDING' | 'LOCKED'
// }
//
// Hệ thống sẽ:
//  - Lấy trận cuối cùng để tính:
//      + matchNumber mới = matchNumber cuối + 1
//      + sân mới = quay vòng 1→2→3
//      + thời gian mới: bắt đầu = endTime trận cuối, kết thúc = + matchDuration phút (suy ra từ trận cuối)
//  - Ghép score = INITIAL_SCORE cho cả 2 liên minh
//  - Chạy validateSchedule trên toàn bộ lịch (bao gồm trận mới)
//  - Nếu ok → lưu DB + emit matches:update; nếu lỗi → trả 400 với chi tiết.
router.post('/manual-add', async (req, res) => {
  try {
    const { allianceRedTeams, allianceBlueTeams, status, startTime, matchDuration } = req.body || {};
    if (!Array.isArray(allianceRedTeams) || allianceRedTeams.length !== 2 ||
        !Array.isArray(allianceBlueTeams) || allianceBlueTeams.length !== 2) {
      return res.status(400).json({ error: 'Cần truyền đúng 2 đội cho mỗi liên minh: allianceRedTeams[2], allianceBlueTeams[2].' });
    }

    const pool = getPool();
    const [matchRows] = await pool.query('SELECT * FROM `matches` ORDER BY match_number');
    const [teams] = await pool.query('SELECT * FROM teams ORDER BY stt');
    const matches = matchRows.map(rowToMatch);

    if (matches.length === 0) {
      return res.status(400).json({ error: 'Hiện chưa có lịch để làm chuẩn. Hãy tạo lịch tự động trước, sau đó mới thêm trận thủ công.' });
    }

    const last = matches[matches.length - 1];

    // Suy ra thời lượng trận chuẩn
    const [sh, sm] = String(last.startTime || '08:00').split(':').map(Number);
    const [eh, em] = String(last.endTime || '08:05').split(':').map(Number);
    const baseStartMin = sh * 60 + sm;
    const baseEndMin = eh * 60 + em;
    const baseDuration = Math.max(1, baseEndMin - baseStartMin);

    const toTime = (min) =>
      `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

    let newStartMin;
    let newEndMin;

    if (startTime) {
      // Admin truyền giờ bắt đầu riêng cho trận bổ sung
      const [h, m] = String(startTime).split(':').map(Number);
      const customStart = (isNaN(h) || isNaN(m)) ? baseEndMin : (h * 60 + m);
      const duration = Math.max(1, parseInt(matchDuration, 10) || baseDuration);
      newStartMin = customStart;
      newEndMin = customStart + duration;
    } else {
      // Mặc định: nối ngay sau trận cuối
      const [lh, lm] = String(last.endTime || '08:05').split(':').map(Number);
      const lastEndMin = lh * 60 + lm;
      const duration = Math.max(1, parseInt(matchDuration, 10) || baseDuration);
      newStartMin = lastEndMin;
      newEndMin = lastEndMin + duration;
    }

    const fieldCycle = [1, 2, 3];
    const nextField = fieldCycle[last.field % fieldCycle.length] || 1;

    const newMatch = {
      id: uuidv4(),
      matchNumber: last.matchNumber + 1,
      field: nextField,
      startTime: toTime(newStartMin),
      endTime: toTime(newEndMin),
      status: status || 'UPCOMING',
      allianceRed: {
        teams: allianceRedTeams,
        score: { ...INITIAL_SCORE },
      },
      allianceBlue: {
        teams: allianceBlueTeams,
        score: { ...INITIAL_SCORE },
      },
    };

    // ── Validate cục bộ cho TRẬN BỔ SUNG (không đụng tới fairness lịch chính) ──
    const all4 = [...newMatch.allianceRed.teams, ...newMatch.allianceBlue.teams];
    const unique = new Set(all4);
    const localErrors = [];
    if (all4.length !== 4) {
      localErrors.push('Trận bổ sung phải có đúng 4 đội.');
    }
    if (unique.size !== all4.length) {
      localErrors.push('Có đội bị trùng trong cùng trận bổ sung.');
    }

    // Kiểm tra ràng buộc trường học cho trận bổ sung (cùng trường / HB ↔ NTL không cùng liên minh)
    const teamMap = {};
    teams.forEach(t => { teamMap[t.id] = t; });
    function schoolOf(id) {
      const t = teamMap[id];
      return t && t.school ? t.school : '';
    }
    function sameSchool(a, b) {
      return normalizeText(schoolOf(a)) && normalizeText(schoolOf(a)) === normalizeText(schoolOf(b));
    }
    function isHB(id) {
      return normalizeText(schoolOf(id)).includes('thcs hữu bằng');
    }
    function isNTL(id) {
      return normalizeText(schoolOf(id)).includes('thcs nam từ liêm');
    }

    const [r1, r2] = newMatch.allianceRed.teams;
    const [b1, b2] = newMatch.allianceBlue.teams;
    if (sameSchool(r1, r2)) {
      localErrors.push('Hai đội Liên minh Đỏ thuộc cùng một trường – không hợp lệ.');
    }
    if (sameSchool(b1, b2)) {
      localErrors.push('Hai đội Liên minh Xanh thuộc cùng một trường – không hợp lệ.');
    }
    const pairs = [
      [r1, r2],
      [b1, b2],
    ];
    for (const [a, b] of pairs) {
      if ((isHB(a) && isNTL(b)) || (isHB(b) && isNTL(a))) {
        localErrors.push('THCS Hữu Bằng và THCS Nam Từ Liêm không được ở cùng một liên minh trong trận bổ sung.');
      }
    }

    if (localErrors.length > 0) {
      return res.status(400).json({
        error: 'Trận bổ sung không hợp lệ. Vui lòng điều chỉnh lại lựa chọn đội.',
        details: localErrors,
      });
    }

    await pool.query(
      'INSERT INTO `matches` (id, match_number, field, start_time, end_time, status, alliance_red, alliance_blue) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newMatch.id,
        newMatch.matchNumber,
        newMatch.field,
        newMatch.startTime,
        newMatch.endTime,
        newMatch.status,
        JSON.stringify(newMatch.allianceRed),
        JSON.stringify(newMatch.allianceBlue),
      ]
    );

    req.app.get('io').emit('matches:update');
    res.json({ success: true, match: newMatch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/generate – Tạo lịch random
router.post('/generate', async (req, res) => {
  try {
    const startTime = req.body.startTime || '08:00';
    const matchDuration = parseInt(req.body.matchDuration) || 5;
    const fields = parseInt(req.body.fields) || 3;
    const pool = getPool();

    const [teams] = await pool.query('SELECT * FROM teams ORDER BY stt');
    if (teams.length < 4) {
      return res.status(400).json({ error: 'Cần tối thiểu 4 đội để tạo lịch!' });
    }

    // Xóa lịch cũ
    await pool.query('DELETE FROM `matches`');

    // 1) Tạo danh sách trận (không gán sân/thời gian)
    // 2) Gán sân + thời gian theo FIELD ROTATION
    let timeSlots;
    try {
      timeSlots = generateRandomMatchSlots(teams);
    } catch (genErr) {
      return res.status(400).json({ error: genErr.message });
    }
    const matches = assignTimeAndFieldRotation(timeSlots, startTime, matchDuration);
    const fieldsUsedSet = new Set(matches.map(m => m.field));
    const fieldsUsed = fieldsUsedSet.size;

    // Validate toàn bộ lịch trước khi lưu
    const teamIds = teams.map(t => t.id);
    const validationErrors = validateSchedule(matches, teamIds, 4, 'STRICT');
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Lịch tạo ra không hợp lệ! Vui lòng thử lại.',
        details: validationErrors,
      });
    }

    for (const m of matches) {
      await pool.query(
        'INSERT INTO `matches` (id, match_number, field, start_time, end_time, status, alliance_red, alliance_blue) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [m.id, m.matchNumber, m.field, m.startTime, m.endTime, m.status, JSON.stringify(m.allianceRed), JSON.stringify(m.allianceBlue)]
      );
    }

    let msg = `✓ Tạo lịch: ${matches.length} trận, ${teams.length} đội, sử dụng ${fieldsUsed} sân`;
    console.log(`  ${msg}`);

    const stats = computeScheduleStatistics(matches, teams);

    req.app.get('io').emit('matches:update');
    res.json({
      matches,
      info: {
        totalMatches: matches.length,
        totalTeams: teams.length,
        fieldsUsed: fieldsUsed,
        requestedFields: fields,
        rotation: { cycleA: [1, 3], cycleB: [2] },
        note: 'Scheduler tạo trận độc lập số sân.',
      },
      statistics: stats,
      warnings: stats.warnings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/matches/:id – Cập nhật trận (chấm điểm / đổi trạng thái / chỉnh tay đội hình)
// Khi frontend chỉnh sửa danh sách đội (đổi đội giữa 2 liên minh, hoán đổi giữa các trận, di chuyển đội)
// thì chỉ cần gửi lại allianceRed / allianceBlue mong muốn.
//
// QUAN TRỌNG:
//  - Ở bước CHỈNH SỬA, ta KHÔNG áp lại full quy tắc random lịch (cooldown, fairness, số trận/đội...).
//  - Chỉ kiểm tra cục bộ trong chính trận được sửa:
//      + Đúng 4 đội, không trùng ID trong trận
//      + 2 đội cùng 1 liên minh không cùng trường
//      + THCS Hữu Bằng không đứng chung liên minh với THCS Nam Từ Liêm
router.put('/:id', async (req, res) => {
  try {
    const { status, allianceRed, allianceBlue } = req.body;
    const pool = getPool();

    // Lấy trận hiện tại để giữ nguyên các field khác
    const [matchRows] = await pool.query('SELECT * FROM `matches` WHERE id = ?', [req.params.id]);
    if (!matchRows || matchRows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy trận để cập nhật.' });
    }
    const current = rowToMatch(matchRows[0]);

    const newAllianceRed = allianceRed || current.allianceRed;
    const newAllianceBlue = allianceBlue || current.allianceBlue;

    // ── Validate cục bộ trong trận ──
    const all4 = [...newAllianceRed.teams, ...newAllianceBlue.teams];
    const unique = new Set(all4);
    const localErrors = [];

    if (all4.length !== 4) {
      localErrors.push('Trận phải có đúng 4 đội.');
    }
    if (unique.size !== all4.length) {
      localErrors.push('Có đội bị trùng trong cùng trận.');
    }

    // Kiểm tra ràng buộc trường
    const [teams] = await pool.query('SELECT * FROM teams ORDER BY stt');
    const teamMap = {};
    teams.forEach(t => { teamMap[t.id] = t; });
    const schoolOf = id => (teamMap[id] && teamMap[id].school) ? teamMap[id].school : '';
    const sameSchool = (a, b) =>
      normalizeText(schoolOf(a)) &&
      normalizeText(schoolOf(a)) === normalizeText(schoolOf(b));
    const isHB = id => normalizeText(schoolOf(id)).includes('thcs huu bang');
    const isNTL = id => normalizeText(schoolOf(id)).includes('thcs nam tu liem');

    const [r1, r2] = newAllianceRed.teams;
    const [b1, b2] = newAllianceBlue.teams;
    if (sameSchool(r1, r2)) {
      localErrors.push('Hai đội Liên minh Đỏ thuộc cùng một trường – không hợp lệ.');
    }
    if (sameSchool(b1, b2)) {
      localErrors.push('Hai đội Liên minh Xanh thuộc cùng một trường – không hợp lệ.');
    }
    const pairs = [
      [r1, r2],
      [b1, b2],
    ];
    for (const [a, b] of pairs) {
      if ((isHB(a) && isNTL(b)) || (isHB(b) && isNTL(a))) {
        localErrors.push('THCS Hữu Bằng và THCS Nam Từ Liêm không được ở cùng một liên minh.');
      }
    }

    if (localErrors.length > 0) {
      return res.status(400).json({
        error: 'Cấu hình trận không hợp lệ. Vui lòng điều chỉnh lại lựa chọn đội.',
        details: localErrors,
      });
    }

    const finalStatus = status ?? current.status;

    // Ghi xuống DB (không động tới match_number, thời gian, sân...)
    await pool.query(
      'UPDATE `matches` SET status = ?, alliance_red = ?, alliance_blue = ? WHERE id = ?',
      [finalStatus, JSON.stringify(newAllianceRed), JSON.stringify(newAllianceBlue), req.params.id]
    );
    req.app.get('io').emit('matches:update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/matches – Xóa tất cả trận
router.delete('/', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM `matches`');
    req.app.get('io').emit('matches:update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/matches/:id – Xóa 1 trận riêng lẻ
// YÊU CẦU:
//  - Có thể xóa riêng từng match.
//  - Sau khi xóa:
//      + Tự động cập nhật lại thứ tự trận (match_number liên tục 1,2,3,...).
//      + Cập nhật lại thời gian các trận phía sau: trận sau bắt đầu ngay khi trận trước kết thúc.
//      + Sân thi đấu vẫn quay vòng 1 → 2 → 3 → 1 → ...
//  - KHÔNG "regenerate" lại toàn bộ lịch: giữ nguyên đội, kết quả và trạng thái trận, chỉ cập nhật metadata (match_number, field, start/end time).
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const id = req.params.id;

    // Lấy toàn bộ lịch hiện tại (theo match_number) để biết thứ tự trước/sau
    const [allRows] = await pool.query('SELECT * FROM `matches` ORDER BY match_number');
    const indexToDelete = allRows.findIndex((r) => r.id === id);
    if (indexToDelete === -1) {
      return res.status(404).json({ error: 'Không tìm thấy trận để xóa.' });
    }

    // Xóa trận được chọn
    await pool.query('DELETE FROM `matches` WHERE id = ?', [id]);

    // Lấy lại danh sách sau khi xóa
    const [remainingRows] = await pool.query('SELECT * FROM `matches` ORDER BY match_number');

    // Nếu không còn trận nào thì chỉ cần emit cập nhật là đủ
    if (!remainingRows || remainingRows.length === 0) {
      req.app.get('io').emit('matches:update');
      return res.json({ success: true });
    }
    // Chuyển sang dạng JSON chuẩn để dễ xử lý
    const remainingMatches = remainingRows.map(rowToMatch).sort(
      (a, b) => a.matchNumber - b.matchNumber
    );

    // ── AUTO-FIX: tránh đội thi 2 trận LIỀN NHAU bằng cách hoán đổi cục bộ ──
    // Quy tắc: chỉ đổi VỊ TRÍ trận trong timeline, không đổi đội/điểm/trạng thái bên trong trận.
    function getMatchTeams(match) {
      return [...match.allianceRed.teams, ...match.allianceBlue.teams];
    }

    function fixConsecutiveTeamConflicts(matches) {
      const LOOKAHEAD = 10; // giới hạn tầm nhìn để vẫn O(n)
      for (let i = 1; i < matches.length; i++) {
        const prevTeams = new Set(getMatchTeams(matches[i - 1]));
        const currTeams = getMatchTeams(matches[i]);

        let conflict = false;
        for (const tid of currTeams) {
          if (prevTeams.has(tid)) {
            conflict = true;
            break;
          }
        }
        if (!conflict) continue;

        // Tìm trận gần phía sau để hoán đổi sao cho không trùng đội với trận trước
        let swapped = false;
        for (let j = i + 1; j < matches.length && j <= i + LOOKAHEAD; j++) {
          const candTeams = getMatchTeams(matches[j]);
          let ok = true;
          for (const tid of candTeams) {
            if (prevTeams.has(tid)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          const tmp = matches[i];
          matches[i] = matches[j];
          matches[j] = tmp;
          swapped = true;
          break;
        }

        // Nếu không tìm được ứng viên phù hợp trong LOOKAHEAD, tạm chấp nhận xung đột hiếm gặp.
        if (!swapped) {
          continue;
        }
      }
    }

    fixConsecutiveTeamConflicts(remainingMatches);

    // Helper: HH:MM -> minutes
    const toMinutes = (timeStr) => {
      const [h, m] = String(timeStr || '08:00').split(':').map(Number);
      const hh = isNaN(h) ? 8 : h;
      const mm = isNaN(m) ? 0 : m;
      return hh * 60 + mm;
    };

    // Helper: minutes -> HH:MM
    const toTime = (min) =>
      `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

    // Ghi nhận thời lượng gốc của từng trận để giữ nguyên "độ dài" khi dồn lịch
    const originalDurations = remainingMatches.map((m) => {
      const s = toMinutes(m.startTime);
      const e = toMinutes(m.endTime || m.startTime);
      const d = Math.max(1, e - s);
      return d || 5;
    });

    // Thời gian bắt đầu của toàn bộ lịch giữ nguyên như trận đầu tiên hiện tại
    const firstStartMinutes = toMinutes(remainingMatches[0].startTime);
    let cursor = firstStartMinutes;

    const fieldCycle = [1, 2, 3];

    // Dồn lại lịch: re-number + re-time + re-field tuần tự
    for (let i = 0; i < remainingMatches.length; i++) {
      const m = remainingMatches[i];
      const duration = originalDurations[i];

      const newMatchNumber = i + 1;
      const newStart = cursor;
      const newEnd = cursor + duration;
      const newField = fieldCycle[i % fieldCycle.length];

      cursor = newEnd;

      await pool.query(
        'UPDATE `matches` SET match_number = ?, field = ?, start_time = ?, end_time = ? WHERE id = ?',
        [newMatchNumber, newField, toTime(newStart), toTime(newEnd), m.id]
      );
    }

    req.app.get('io').emit('matches:update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
