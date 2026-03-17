// ============================================
// FANROC 2026 – Scoring Logic
// Luật tính điểm theo quy chế cuộc thi
// ============================================
import { AllianceScore } from './types';

type BarrierOutcome = {
	redBarrierPoints: number;
	blueBarrierPoints: number;
	redCoeffDelta: number;
	blueCoeffDelta: number;
};

function calculateBarrierOutcome(
	redScore: Pick<AllianceScore, 'pushedBarrier' | 'barrierStatus'>,
	blueScore: Pick<AllianceScore, 'pushedBarrier' | 'barrierStatus'>
): BarrierOutcome {
	const redPushed = redScore.pushedBarrier || redScore.barrierStatus === 'COMPLETED';
	const bluePushed = blueScore.pushedBarrier || blueScore.barrierStatus === 'COMPLETED';

	if (redPushed && bluePushed) {
		return {
			redBarrierPoints: 20,
			blueBarrierPoints: 20,
			redCoeffDelta: 0,
			blueCoeffDelta: 0,
		};
	}

	if (redPushed && !bluePushed) {
		return {
			redBarrierPoints: 10,
			blueBarrierPoints: 10,
			redCoeffDelta: 0,
			blueCoeffDelta: -0.2,
		};
	}

	if (bluePushed && !redPushed) {
		return {
			redBarrierPoints: 10,
			blueBarrierPoints: 10,
			redCoeffDelta: -0.2,
			blueCoeffDelta: 0,
		};
	}

	return {
		redBarrierPoints: 0,
		blueBarrierPoints: 0,
		redCoeffDelta: -0.2,
		blueCoeffDelta: -0.2,
	};
}

function calculateSingleAlliance(
	score: AllianceScore,
	barrierPts: number,
	coeffDelta: number,
	sharedBioPoints: number
): AllianceScore {
	// 1. Điểm sinh học - now using shared value from match
	const bioPoints = sharedBioPoints;

	// 3. Hệ số cân bằng
	const diff = Math.abs(score.ownCylinderBalls - score.opponentCylinderBalls);
	let balanceFactor: number;
	if (diff <= 1) balanceFactor = 2.0;
	else if (diff <= 3) balanceFactor = 1.5;
	else balanceFactor = 1.3;
	balanceFactor = Math.max(0, balanceFactor + coeffDelta);

	// 4. End Game
	const egMap: Record<string, number> = { NONE: 0, PARTIAL: 5, FULL: 10 };
	let endGamePoints = (egMap[score.robot1EndGame] || 0) + (egMap[score.robot2EndGame] || 0);
	// Bonus: cả 2 robot Fully In
	if (score.robot1EndGame === 'FULL' && score.robot2EndGame === 'FULL') {
		endGamePoints += 10;
	}

	// 5. Penalty
	const penaltyPts = score.penalties * 5 + (score.yellowCard ? 10 : 0);

	// 6. Thẻ đỏ → 0 điểm
	if (score.redCards) {
		return {
			...score,
			calculatedBioPoints: bioPoints,
			balanceFactor,
			endGamePoints,
			finalScore: 0,
		};
	}

	// 7. Công thức tổng
	const raw = (bioPoints + barrierPts) * balanceFactor + endGamePoints - penaltyPts;
	const finalScore = Math.round(Math.max(0, raw) * 10) / 10;

	return {
		...score,
		calculatedBioPoints: bioPoints,
		balanceFactor,
		endGamePoints,
		finalScore,
	};
}

/**
 * Backward-compatible calculator for legacy UI flow.
 * Keeps old function name so older App.tsx versions still run.
 */
export function calculateAllianceScore(score: AllianceScore): AllianceScore {
	const pushed = score.pushedBarrier || score.barrierStatus === 'COMPLETED';
	const barrierPts = pushed ? 20 : 0;
	const coeffDelta = pushed ? 0 : -0.2;
	return calculateSingleAlliance(score, barrierPts, coeffDelta, 0);
}

export function calculateMatchScores(redScore: AllianceScore, blueScore: AllianceScore) {
	const barrierOutcome = calculateBarrierOutcome(redScore, blueScore);

	// Điểm sinh học được tính dựa trên tổng số bóng vàng và trắng của cả 2 đội, sau đó chia đều cho mỗi đội
	const totalYellowBalls = redScore.yellowBalls + blueScore.yellowBalls;
	const totalWhiteBalls = redScore.whiteBalls + blueScore.whiteBalls;
	const sharedBioPoints = totalYellowBalls * 3 + totalWhiteBalls * 1;

	return {
		red: calculateSingleAlliance(redScore, barrierOutcome.redBarrierPoints, barrierOutcome.redCoeffDelta, sharedBioPoints),
		blue: calculateSingleAlliance(blueScore, barrierOutcome.blueBarrierPoints, barrierOutcome.blueCoeffDelta, sharedBioPoints),
	};
}