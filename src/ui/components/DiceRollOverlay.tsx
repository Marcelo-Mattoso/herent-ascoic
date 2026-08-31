import type { CSSProperties } from "react";
import type { CombatRollResult } from "@/core/state/combatState";

interface DiceRollOverlayProps {
	roll: CombatRollResult;
	heroAnchor: AnchorPoint;
	enemyAnchor: AnchorPoint;
}

export interface AnchorPoint {
	readonly x: number;
	readonly y: number;
}

type DiceSide = "hero" | "enemy";

const PIP_POSITIONS: Record<number, readonly [number, number][]> = {
	1: [[2, 2]],
	2: [
		[1, 1],
		[3, 3],
	],
	3: [
		[1, 1],
		[2, 2],
		[3, 3],
	],
	4: [
		[1, 1],
		[3, 1],
		[1, 3],
		[3, 3],
	],
	5: [
		[1, 1],
		[3, 1],
		[2, 2],
		[1, 3],
		[3, 3],
	],
	6: [
		[1, 1],
		[3, 1],
		[1, 2],
		[3, 2],
		[1, 3],
		[3, 3],
	],
};

export function DiceRollOverlay({
	roll,
	heroAnchor,
	enemyAnchor,
}: DiceRollOverlayProps) {
	return (
		<div className="game-dice-roll-layer" aria-hidden="true">
			<DiceCluster
				side="enemy"
				results={roll.enemyResults}
				total={roll.enemyTotal}
				anchor={enemyAnchor}
			/>
			<DiceCluster
				side="hero"
				results={roll.heroResults}
				total={roll.heroTotal}
				anchor={heroAnchor}
			/>
		</div>
	);
}

function DiceCluster({
	side,
	results,
	total,
	anchor,
}: {
	side: DiceSide;
	results: readonly number[];
	total: number;
	anchor: AnchorPoint;
}) {
	const style = {
		left: `${anchor.x}px`,
		top: `${anchor.y}px`,
	} satisfies CSSProperties;

	return (
		<div
			className={`game-dice-roll-cluster game-dice-roll-cluster--${side}`}
			style={style}
		>
			<div className="game-dice-roll-row">
				{results.map((value, index) => (
					<DiceFace
						key={`${side}-roll-die-${index}`}
						value={value}
						index={index}
						side={side}
					/>
				))}
			</div>
			<div className="game-dice-roll-total">{total}</div>
		</div>
	);
}

function DiceFace({
	value,
	index,
	side,
}: {
	value: number;
	index: number;
	side: DiceSide;
}) {
	const pips = PIP_POSITIONS[value] ?? PIP_POSITIONS[6];
	const style = {
		"--dice-index": index,
		"--dice-spin": side === "hero" ? "1" : "-1",
	} as CSSProperties;

	return (
		<div className="game-dice-roll-die" style={style}>
			{pips.map(([column, row], pipIndex) => (
				<span
					key={`pip-${pipIndex}`}
					className="game-dice-roll-pip"
					style={{
						gridColumn: column,
						gridRow: row,
					}}
				/>
			))}
		</div>
	);
}
