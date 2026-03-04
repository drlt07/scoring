// ============================================
// FANROC 2026 – TypeScript Types
// ============================================

export type UserRole = 'ADMIN' | 'JUDGE' | 'VIEWER';
export type RobotEndGameState = 'NONE' | 'PARTIAL' | 'FULL';
export type MatchStatus = 'UPCOMING' | 'SCORING' | 'PENDING' | 'LOCKED';
export type BarrierStatus = 'COMPLETED' | 'NOT_COMPLETED' | 'WRONG';

export interface AppUser {
  id: string;
  email: string;
  password?: string;
  role: UserRole;
  name: string;
  assignedField?: number;
}

export interface Team {
  id: string;
  stt: number;
  code: string;
  name: string;
  school: string;
  // Calculated (client-side)
  totalPoints?: number;
  bioPointsTotal?: number;
  highestMatchScore?: number;
  matchesPlayed?: number;
}

export interface AllianceScore {
  yellowBalls: number;
  whiteBalls: number;
  pushedBarrier: boolean;
  barrierStatus?: BarrierStatus;
  ownCylinderBalls: number;
  opponentCylinderBalls: number;
  robot1EndGame: RobotEndGameState;
  robot2EndGame: RobotEndGameState;
  penalties: number;
  yellowCard: boolean;
  redCards: boolean;
  calculatedBioPoints: number;
  balanceFactor: number;
  endGamePoints: number;
  finalScore: number;
}

export interface Alliance {
  teams: string[];
  score: AllianceScore;
}

export interface Match {
  id: string;
  matchNumber: number;
  field: number;
  startTime: string;
  endTime: string;
  status: MatchStatus;
  allianceRed: Alliance;
  allianceBlue: Alliance;
}

export const INITIAL_SCORE: AllianceScore = {
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
