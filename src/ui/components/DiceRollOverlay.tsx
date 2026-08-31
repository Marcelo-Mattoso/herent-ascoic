import { type CSSProperties, useEffect, useState } from "react";
import type { CombatRollResult } from "@/core/state/combatState";

interface DiceRollOverlayProps {
	roll: CombatRollResult;
	onResolveAttack: () => void;
}

type DiceSide = "hero" | "enemy";
const ROLLING_DURATION_MS = 1850;
const ROLLING_TICK_MS = 92;

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
	onResolveAttack,
}: DiceRollOverlayProps) {
	const [canResolve, setCanResolve] = useState(false);
	const [tick, setTick] = useState(0);

	useEffect(() => {
		const interval = window.setInterval(() => {
			setTick((current) => current + 1);
		}, ROLLING_TICK_MS);
		const timer = window.setTimeout(() => {
			window.clearInterval(interval);
			setCanResolve(true);
		}, ROLLING_DURATION_MS);

		return () => {
			window.clearInterval(interval);
			window.clearTimeout(timer);
		};
	}, []);

	return (
		<div className="game-dice-roll-layer">
			<div
				className="game-dice-roll-modal"
				role="dialog"
				aria-label="Resultado da rolagem de dados"
			>
				<div className="game-dice-roll-modal__body">
					<DiceCluster
						side="enemy"
						label="Monstro"
						results={roll.enemyResults}
						total={roll.enemyTotal}
						tick={tick}
						isRolling={!canResolve}
					/>
					<div className="game-dice-roll-versus">vs</div>
					<DiceCluster
						side="hero"
						label="Herói"
						results={roll.heroResults}
						total={roll.heroTotal}
						tick={tick}
						isRolling={!canResolve}
					/>
				</div>
				<button
					type="button"
					className="game-dice-roll-action"
					onClick={onResolveAttack}
					disabled={!canResolve}
					aria-label="Resolver ataque"
				>
					{canResolve ? "Resolver ataque" : "Rolando..."}
				</button>
			</div>
		</div>
	);
}

function DiceCluster({
	side,
	label,
	results,
	total,
	tick,
	isRolling,
}: {
	side: DiceSide;
	label: string;
	results: readonly number[];
	total: number;
	tick: number;
	isRolling: boolean;
}) {
	const visibleResults = isRolling
		? results.map((value, index) => getRollingValue(value, index, tick, side))
		: results;

	return (
		<div className={`game-dice-roll-cluster game-dice-roll-cluster--${side}`}>
			<div className="game-dice-roll-label">{label}</div>
			<div className="game-dice-roll-row">
				{visibleResults.map((value, index) => (
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

function getRollingValue(
	finalValue: number,
	index: number,
	tick: number,
	side: DiceSide,
) {
	const sideOffset = side === "hero" ? 2 : 5;
	return ((finalValue + tick + index * sideOffset) % 6) + 1;
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
