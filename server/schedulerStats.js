// ============================================
// FANROC 2026 – Schedule Statistics Module
// ============================================
// Tính thống kê sau khi tạo lịch: số trận/đội, fairness, warnings.

/**
 * @param {Array} matches - Danh sách trận (có allianceRed, allianceBlue)
 * @param {Array} teams - Danh sách đội (id, name, school)
 * @returns {Object} Statistics + warnings
 */
function computeScheduleStatistics(matches, teams) {
  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t; });

  const matchCount = {};
  const allySet = {};
  const opponentSet = {};
  teams.forEach(t => {
    matchCount[t.id] = 0;
    allySet[t.id] = new Set();
    opponentSet[t.id] = new Set();
  });

  const pairCount = {};
  const opponentPairCount = {};
  function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  for (const m of matches) {
    const red = m.allianceRed.teams;
    const blue = m.allianceBlue.teams;
    const all4 = [...red, ...blue];

    for (const tid of all4) matchCount[tid] = (matchCount[tid] || 0) + 1;

    for (let i = 0; i < 2; i++) {
      allySet[red[i]].add(red[1 - i]);
      allySet[red[1 - i]].add(red[i]);
    }
    for (let i = 0; i < 2; i++) {
      allySet[blue[i]].add(blue[1 - i]);
      allySet[blue[1 - i]].add(blue[i]);
    }
    for (const r of red) {
      for (const b of blue) {
        opponentSet[r].add(b);
        opponentSet[b].add(r);
        const k = pairKey(r, b);
        opponentPairCount[k] = (opponentPairCount[k] || 0) + 1;
      }
    }
    for (let i = 0; i < all4.length; i++) {
      for (let j = i + 1; j < all4.length; j++) {
        const k = pairKey(all4[i], all4[j]);
        pairCount[k] = (pairCount[k] || 0) + 1;
      }
    }
  }

  const counts = Object.values(matchCount);
  const maxMatches = Math.max(...counts, 0);
  const minMatches = Math.min(...counts, 999);
  const matchDifference = maxMatches - minMatches;

  const teamDetails = teams.map(t => {
    const allies = allySet[t.id] || new Set();
    const opponents = opponentSet[t.id] || new Set();
    const mc = matchCount[t.id] || 0;
    let allyRepeats = 0;
    allies.forEach(aid => {
      const k = pairKey(t.id, aid);
      allyRepeats += (pairCount[k] || 1) - 1;
    });
    let opponentRepeats = 0;
    opponents.forEach(oid => {
      const k = pairKey(t.id, oid);
      opponentRepeats += (opponentPairCount[k] || 1) - 1;
    });
    return {
      teamId: t.id,
      teamName: t.name,
      school: t.school,
      isStrong: t.isStrong === true,
      matchCount: mc,
      uniqueAllies: allies.size,
      uniqueOpponents: opponents.size,
      allyRepeats,
      opponentRepeats,
    };
  });

  const teamsWith4 = teamDetails.filter(d => d.matchCount === 4).length;
  const teamsWith5 = teamDetails.filter(d => d.matchCount === 5).length;
  const teamsUnder4 = teamDetails.filter(d => d.matchCount < 4).length;

  const totalAllyRepeats = teamDetails.reduce((s, d) => s + d.allyRepeats, 0);
  const totalOpponentRepeats = teamDetails.filter(d => d.matchCount > 0).reduce((s, d) => s + d.opponentRepeats, 0);
  const nPlayed = teamDetails.filter(d => d.matchCount > 0).length;
  const avgAllyRepeats = nPlayed > 0 ? (totalAllyRepeats / nPlayed).toFixed(2) : 0;
  const avgOpponentRepeats = nPlayed > 0 ? (totalOpponentRepeats / nPlayed).toFixed(2) : 0;

  const warnings = [];
  if (teamsUnder4 > 0) {
    warnings.push({ type: 'TEAMS_UNDER_4', message: `${teamsUnder4} đội thi < 4 trận`, teams: teamDetails.filter(d => d.matchCount < 4).map(d => d.teamName) });
  }
  if (teamsWith5 > 0) {
    warnings.push({ type: 'TEAMS_5_MATCHES', message: `${teamsWith5} đội thi 5 trận`, teams: teamDetails.filter(d => d.matchCount === 5).map(d => d.teamName) });
  }
  if (matchDifference > 1) {
    warnings.push({ type: 'FAIRNESS', message: `Chênh lệch số trận = ${matchDifference} (max-min)`, matchDifference });
  }

  // Vi phạm cùng trường (THCS Hữu Bằng - 2 đội cùng trường trong 1 liên minh)
  const sameSchoolViolations = [];
  for (const m of matches) {
    const red = m.allianceRed.teams;
    const blue = m.allianceBlue.teams;
    const r0 = teamMap[red[0]], r1 = teamMap[red[1]];
    const b0 = teamMap[blue[0]], b1 = teamMap[blue[1]];
    if (r0 && r1 && r0.school === r1.school) sameSchoolViolations.push({ match: m.matchNumber, alliance: 'Đỏ', school: r0.school });
    if (b0 && b1 && b0.school === b1.school) sameSchoolViolations.push({ match: m.matchNumber, alliance: 'Xanh', school: b0.school });
  }
  if (sameSchoolViolations.length > 0) {
    warnings.push({ type: 'SAME_SCHOOL', message: `Vi phạm cùng trường trong liên minh`, details: sameSchoolViolations });
  }

  return {
    totalTeams: teams.length,
    totalMatches: matches.length,
    teamsWith4,
    teamsWith5,
    teamsUnder4,
    teamDetails,
    fairness: {
      maxMatches: maxMatches,
      minMatches: minMatches,
      matchDifference,
      avgAllyRepeats: parseFloat(avgAllyRepeats),
      avgOpponentRepeats: parseFloat(avgOpponentRepeats),
    },
    warnings,
    fairnessWarning: matchDifference > 1 ? `Chênh lệch số trận = ${matchDifference}` : null,
  };
}

module.exports = { computeScheduleStatistics };
